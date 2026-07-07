const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const { GridFSBucket, ObjectId } = require("mongodb");
const path = require("path");

const Message = require("../models/Message");
const VaultItem = require("../models/VaultItem");
const VaultPin = require("../models/VaultPin");
const StickerPack = require("../models/StickerPack");
const ClearedChat = require("../models/ClearedChat");
const { authenticateToken } = require("./userRoutes");
const logger = require("../utils/logger");

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// 1. Transcription Config Endpoint
router.get("/api/config/transcription", (req, res) => {
  res.json({
    mode: process.env.TRANSCRIPTION_MODE || "local",
    localModel: process.env.LOCAL_ASR_MODEL || "Xenova/distil-whisper-small.en",
    localModelVersion: process.env.LOCAL_MODEL_VERSION || "v1",
    devMode: process.env.TRANSCRIPTION_DEV_MODE === "true"
  });
});

// 2. E2EE receiver ciphertext backup
router.post("/api/messages/:messageId/backup", authenticateToken, async (req, res) => {
  try {
    if (req.user.isGuest) {
      return res.status(403).json({ error: "Access denied. Guests cannot backup messages." });
    }
    const { messageId } = req.params;
    const { receiverCiphertext } = req.body;

    if (!receiverCiphertext || !receiverCiphertext.nonce || !receiverCiphertext.ciphertext) {
      return res.status(400).json({ error: "Invalid backup payload." });
    }

    const msg = await Message.findById(messageId);
    if (!msg) {
      return res.status(404).json({ error: "Message not found." });
    }

    if (!msg.privateChatId) {
      return res.status(400).json({ error: "Not a private chat message." });
    }

    const sender = msg.username.toLowerCase();
    const requester = req.user.username.toLowerCase();

    if (sender === requester) {
      return res.status(403).json({ error: "Sender cannot backup receiver ciphertext on their own message." });
    }

    const chatUsers = msg.privateChatId.split("_");
    if (!chatUsers.includes(requester)) {
      return res.status(403).json({ error: "Access denied. You are not a recipient of this message." });
    }

    msg.receiverCiphertext = receiverCiphertext;
    await msg.save();

    res.json({ message: "Backup saved successfully." });
  } catch (err) {
    logger.error("Backup error:", err);
    res.status(500).json({ error: "Server error saving backup." });
  }
});

// 3. Vault CRUD
router.get("/api/vault/:privateChatId", authenticateToken, async (req, res) => {
  try {
    if (req.user.isGuest) {
      return res.status(403).json({ error: "Access denied. Guests cannot access the vault." });
    }
    const { privateChatId } = req.params;
    const members = privateChatId.split("_");
    if (!members.includes(req.user.username.toLowerCase())) {
      return res.status(403).json({ error: "Not a member of this chat" });
    }

    const items = await VaultItem.find({ privateChatId }).sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    logger.error("Fetch vault items error:", err);
    res.status(500).json({ error: "Server error fetching vault items." });
  }
});

router.post("/api/vault/:privateChatId", authenticateToken, async (req, res) => {
  try {
    if (req.user.isGuest) {
      return res.status(403).json({ error: "Access denied. Guests cannot access the vault." });
    }
    const { privateChatId } = req.params;
    const members = privateChatId.split("_");
    if (!members.includes(req.user.username.toLowerCase())) {
      return res.status(403).json({ error: "Not a member of this chat" });
    }

    const { encryptedData, itemType } = req.body;
    if (!encryptedData || !encryptedData.nonce || !encryptedData.ciphertext || itemType !== "text") {
      return res.status(400).json({ error: "Invalid text item payload." });
    }

    const newItem = new VaultItem({
      privateChatId,
      uploadedBy: req.user.username,
      itemType,
      encryptedData
    });
    await newItem.save();
    res.json(newItem);
  } catch (err) {
    logger.error("Save vault text item error:", err);
    res.status(500).json({ error: "Server error saving vault item." });
  }
});

router.post("/api/vault/:privateChatId/file", authenticateToken, async (req, res) => {
  try {
    if (req.user.isGuest) {
      return res.status(403).json({ error: "Access denied. Guests cannot access the vault." });
    }
    const { privateChatId } = req.params;
    const members = privateChatId.split("_");
    if (!members.includes(req.user.username.toLowerCase())) {
      return res.status(403).json({ error: "Not a member of this chat" });
    }

    const { encryptedData, fileName, fileSize, fileType, fileRef } = req.body;
    if (!encryptedData || !encryptedData.nonce || !encryptedData.ciphertext || !fileRef) {
      return res.status(400).json({ error: "Invalid file item payload." });
    }

    const newItem = new VaultItem({
      privateChatId,
      uploadedBy: req.user.username,
      itemType: "file",
      encryptedData,
      fileRef,
      fileName,
      fileSize,
      fileType
    });
    await newItem.save();
    res.json(newItem);
  } catch (err) {
    logger.error("Save vault file item error:", err);
    res.status(500).json({ error: "Server error saving vault item." });
  }
});

router.delete("/api/vault/:privateChatId/:itemId", authenticateToken, async (req, res) => {
  try {
    if (req.user.isGuest) {
      return res.status(403).json({ error: "Access denied. Guests cannot access the vault." });
    }
    const { privateChatId, itemId } = req.params;
    const members = privateChatId.split("_");
    if (!members.includes(req.user.username.toLowerCase())) {
      return res.status(403).json({ error: "Not a member of this chat" });
    }

    const item = await VaultItem.findById(itemId);
    if (!item) {
      return res.status(404).json({ error: "Vault item not found" });
    }

    if (item.privateChatId !== privateChatId) {
      return res.status(400).json({ error: "Vault item does not belong to this chat" });
    }

    if (item.itemType === "file" && item.fileRef) {
      const db = mongoose.connection.db;
      const bucket = new GridFSBucket(db, { bucketName: "uploads" });
      try {
        await bucket.delete(new ObjectId(item.fileRef));
      } catch (fileErr) {
        logger.error("Error deleting vault file from GridFS:", fileErr);
      }
    }

    await VaultItem.findByIdAndDelete(itemId);
    res.json({ message: "Vault item deleted successfully." });
  } catch (err) {
    logger.error("Delete vault item error:", err);
    res.status(500).json({ error: "Server error deleting vault item." });
  }
});

// 4. Vault PIN
router.get("/api/vault-pin/:pinId", authenticateToken, async (req, res) => {
  try {
    if (req.user.isGuest) {
      return res.status(403).json({ error: "Access denied. Guests cannot access the vault PIN." });
    }
    const { pinId } = req.params;

    const prefix = `vault_pin_${req.user.username.toLowerCase()}_`;
    if (!pinId.startsWith(prefix)) {
      return res.status(403).json({ error: "Access denied. You do not own this vault PIN configuration." });
    }

    const pinData = await VaultPin.findOne({ pinId });
    if (!pinData) {
      return res.status(404).json({ error: "Vault PIN not found" });
    }
    res.json({
      salt: pinData.salt,
      encryptedVaultKey: pinData.encryptedVaultKey,
      pinType: pinData.pinType,
      pinHash: pinData.pinHash
    });
  } catch (err) {
    logger.error("Fetch vault PIN error:", err);
    res.status(500).json({ error: "Server error fetching vault PIN." });
  }
});

router.post("/api/vault-pin/:pinId", authenticateToken, async (req, res) => {
  try {
    if (req.user.isGuest) {
      return res.status(403).json({ error: "Access denied. Guests cannot configure the vault PIN." });
    }
    const { pinId } = req.params;

    const prefix = `vault_pin_${req.user.username.toLowerCase()}_`;
    if (!pinId.startsWith(prefix)) {
      return res.status(403).json({ error: "Access denied. You do not own this vault PIN configuration." });
    }

    const { salt, encryptedVaultKey, pinType, pinHash } = req.body;
    if (!salt || !encryptedVaultKey || !encryptedVaultKey.nonce || !encryptedVaultKey.ciphertext || !pinType || !pinHash) {
      return res.status(400).json({ error: "Invalid vault PIN payload." });
    }

    await VaultPin.findOneAndUpdate(
      { pinId },
      { salt, encryptedVaultKey, pinType, pinHash },
      { upsert: true, new: true }
    );

    res.json({ message: "Vault PIN configuration saved successfully." });
  } catch (err) {
    logger.error("Save vault PIN error:", err);
    res.status(500).json({ error: "Server error saving vault PIN." });
  }
});

// 5. Sticker Packs
router.get("/api/stickers/packs", authenticateToken, async (req, res) => {
  try {
    const username = req.user.username;
    const packs = await StickerPack.find({
      $or: [
        { isSystem: true },
        { createdBy: username }
      ]
    }).sort({ isSystem: -1, createdAt: 1 });
    res.json(packs);
  } catch (err) {
    logger.error("Failed to get sticker packs:", err);
    res.status(500).json({ error: "Failed to fetch sticker packs" });
  }
});

router.get("/api/stickers/pack/:packId", authenticateToken, async (req, res) => {
  try {
    const { packId } = req.params;
    const pack = await StickerPack.findOne({ packId });
    if (!pack) {
      return res.status(404).json({ error: "Sticker pack not found" });
    }
    if (!pack.isSystem && pack.createdBy !== req.user.username) {
      return res.status(403).json({ error: "Access denied to this sticker pack" });
    }
    res.json(pack.stickers);
  } catch (err) {
    logger.error("Failed to get stickers in pack:", err);
    res.status(500).json({ error: "Failed to fetch stickers" });
  }
});

router.post("/api/stickers/custom", upload.single("file"), authenticateToken, async (req, res) => {
  try {
    const username = req.user.username;
    let buffer;

    if (req.file) {
      buffer = req.file.buffer;
    } else if (req.body.base64Data) {
      const cleanBase64 = req.body.base64Data.replace(/^data:image\/\w+;base64,/, "");
      buffer = Buffer.from(cleanBase64, "base64");
    } else {
      return res.status(400).json({ error: "Missing sticker image file or base64Data" });
    }

    if (!mongoose.connection.db) {
      return res.status(500).json({ error: "Database connection not ready" });
    }

    const db = mongoose.connection.db;
    const bucket = new GridFSBucket(db, { bucketName: "uploads" });

    const stickerId = new mongoose.Types.ObjectId().toString();
    const filename = `custom_sticker_${username}_${stickerId}.webp`;

    const uploadStream = bucket.openUploadStream(filename, {
      contentType: "image/webp"
    });

    uploadStream.end(buffer);

    uploadStream.on("finish", async () => {
      const gridfsId = uploadStream.id.toString();
      const fileUrl = `/api/file/${gridfsId}`;

      const customPackId = `custom_${username.toLowerCase()}`;
      let pack = await StickerPack.findOne({ packId: customPackId });
      if (!pack) {
        pack = await StickerPack.create({
          packId: customPackId,
          name: "My Stickers",
          emoji: "👤",
          isSystem: false,
          createdBy: username,
          stickers: []
        });
      }

      const newSticker = {
        stickerId: stickerId,
        url: fileUrl,
        order: pack.stickers.length + 1
      };

      pack.stickers.push(newSticker);
      await pack.save();

      res.status(201).json({
        message: "Custom sticker saved successfully",
        sticker: newSticker,
        pack: pack
      });
    });

    uploadStream.on("error", (err) => {
      logger.error("GridFS upload stream error:", err);
      res.status(500).json({ error: "Failed to save sticker file to database" });
    });

  } catch (err) {
    logger.error("Failed to save custom sticker:", err);
    res.status(500).json({ error: "Failed to save custom sticker" });
  }
});

router.delete("/api/stickers/custom/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const username = req.user.username;
    const customPackId = `custom_${username.toLowerCase()}`;

    const pack = await StickerPack.findOne({ packId: customPackId });
    if (!pack) {
      return res.status(404).json({ error: "Custom sticker pack not found" });
    }

    const stickerIdx = pack.stickers.findIndex(s => s.stickerId === id);
    if (stickerIdx === -1) {
      return res.status(404).json({ error: "Sticker not found in your custom pack" });
    }

    const sticker = pack.stickers[stickerIdx];
    const parts = sticker.url.split("/");
    const gridfsId = parts[parts.length - 1];

    if (mongoose.connection.db) {
      try {
        const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: "uploads" });
        await bucket.delete(new ObjectId(gridfsId));
      } catch (fileErr) {
        logger.error("Error deleting sticker file from GridFS:", fileErr.message);
      }
    }

    pack.stickers.splice(stickerIdx, 1);
    await pack.save();

    res.json({ message: "Custom sticker deleted successfully", pack });
  } catch (err) {
    logger.error("Failed to delete custom sticker:", err);
    res.status(500).json({ error: "Failed to delete custom sticker" });
  }
});

// 6. Generic File Upload
router.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (!mongoose.connection.db) {
      return res.status(500).json({ error: "Database connection not ready" });
    }

    const db = mongoose.connection.db;
    const bucket = new GridFSBucket(db, { bucketName: "uploads" });

    const uploadStream = bucket.openUploadStream(req.file.originalname, {
      contentType: req.file.mimetype
    });

    uploadStream.end(req.file.buffer);

    uploadStream.on("finish", () => {
      const fileUrl = `/api/file/${uploadStream.id}`;
      res.json({
        fileUrl,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        fileType: req.file.mimetype
      });
    });

    uploadStream.on("error", (err) => {
      logger.error("GridFS upload stream error:", err);
      res.status(500).json({ error: "Failed to save file to database" });
    });
  } catch (err) {
    logger.error("Upload error:", err);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// 7. Transcription proxy to Python service
router.post("/api/transcribe", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    if ((process.env.TRANSCRIPTION_MODE || "local") !== "server") {
      return res.status(400).json({ error: "Server-side transcription is disabled. Use client-side local transcription." });
    }

    const formData = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
    formData.append("file", blob, req.file.originalname);

    const pythonRes = await fetch("http://127.0.0.1:5001/transcribe", {
      method: "POST",
      body: formData
    });

    if (!pythonRes.ok) {
      const errText = await pythonRes.text();
      throw new Error(`Python ASR failed: ${errText}`);
    }

    const result = await pythonRes.json();
    res.json(result);
  } catch (err) {
    logger.error("[Node Server] Transcription routing error:", err);
    res.status(500).json({ error: "Failed to transcribe audio. Check backend service status." });
  }
});

// 8. Transcript polling / trigger on demand
async function transcribeMessageInBackground(messageId, fileUrl) {
  try {
    if ((process.env.TRANSCRIPTION_MODE || "local") !== "server") return;

    const fileIdMatch = fileUrl.match(/\/api\/file\/([a-f0-9]+)/i);
    if (!fileIdMatch) {
      logger.error("[ASR Background] Could not extract file ID from:", fileUrl);
      return;
    }

    const db = mongoose.connection.db;
    const bucket = new GridFSBucket(db, { bucketName: "uploads" });
    const fileId = new ObjectId(fileIdMatch[1]);

    const chunks = [];
    const downloadStream = bucket.openDownloadStream(fileId);

    await new Promise((resolve, reject) => {
      downloadStream.on("data", (chunk) => chunks.push(chunk));
      downloadStream.on("end", resolve);
      downloadStream.on("error", reject);
    });

    const audioBuffer = Buffer.concat(chunks);
    logger.info(`[ASR Background] Downloaded ${audioBuffer.length} bytes for message ${messageId}`);

    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: "audio/webm" });
    formData.append("file", blob, "voice_message.webm");

    const pythonRes = await fetch("http://127.0.0.1:5001/transcribe", {
      method: "POST",
      body: formData
    });

    if (!pythonRes.ok) {
      const errText = await pythonRes.text();
      logger.error(`[ASR Background] Python ASR failed for ${messageId}:`, errText);
      return;
    }

    const result = await pythonRes.json();
    let transcript = (result.transcript || "").trim();

    if (transcript === "[BLANK_AUDIO]" || transcript === "(blank audio)" || transcript === "[BLANK AUDIO]") {
      transcript = "";
    }

    await Message.findByIdAndUpdate(messageId, { transcript });
    logger.info(`[ASR Background] Transcript saved for ${messageId}: "${transcript}"`);
  } catch (err) {
    logger.error(`[ASR Background] Error transcribing message ${messageId}:`, err.message);
  }
}

router.get("/api/transcript/:messageId", async (req, res) => {
  try {
    const { messageId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: "Invalid message ID" });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    if (message.transcript !== null && message.transcript !== undefined) {
      return res.json({ transcript: message.transcript, status: "ready" });
    }

    if (message.fileUrl && (process.env.TRANSCRIPTION_MODE || "local") === "server") {
      await transcribeMessageInBackground(messageId, message.fileUrl);
      const updated = await Message.findById(messageId);
      if (updated && updated.transcript !== null) {
        return res.json({ transcript: updated.transcript, status: "ready" });
      }
    }

    return res.json({ transcript: null, status: "pending" });
  } catch (err) {
    logger.error("[Transcript API] Error:", err);
    res.status(500).json({ error: "Failed to fetch transcript" });
  }
});

// 9. File retrieval & byte-range streaming
router.get("/api/file/:id", async (req, res) => {
  try {
    if (!mongoose.connection.db) {
      return res.status(500).json({ error: "Database connection not ready" });
    }

    let fileId;
    try {
      fileId = new ObjectId(req.params.id);
    } catch (e) {
      return res.status(400).json({ error: "Invalid file ID format" });
    }

    const db = mongoose.connection.db;
    const bucket = new GridFSBucket(db, { bucketName: "uploads" });

    const files = await bucket.find({ _id: fileId }).toArray();
    if (files.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }

    const file = files[0];
    const range = req.headers.range;

    if (req.query.download === "true") {
      const safeFilename = encodeURIComponent(file.filename);
      res.set({
        "Content-Type": file.contentType || "application/octet-stream",
        "Content-Length": file.length,
        "Content-Disposition": `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`,
        "Cache-Control": "no-cache"
      });

      const downloadStream = bucket.openDownloadStream(fileId);
      downloadStream.pipe(res);

      downloadStream.on("error", (err) => {
        logger.error("GridFS download stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to download file" });
        }
      });
    } else if (range && file.contentType && file.contentType.startsWith("video/")) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : file.length - 1;
      const chunksize = (end - start) + 1;

      res.status(206);
      res.set({
        "Content-Range": `bytes ${start}-${end}/${file.length}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": file.contentType
      });

      const downloadStream = bucket.openDownloadStream(fileId, {
        start,
        end: end + 1
      });
      downloadStream.pipe(res);

      downloadStream.on("error", (err) => {
        logger.error("GridFS partial download stream error:", err);
        if (!res.headersSent) {
          res.status(500).end();
        }
      });
    } else {
      res.set({
        "Content-Type": file.contentType || "application/octet-stream",
        "Content-Length": file.length,
        "Cache-Control": "public, max-age=31536000"
      });

      const downloadStream = bucket.openDownloadStream(fileId);
      downloadStream.pipe(res);

      downloadStream.on("error", (err) => {
        logger.error("GridFS download stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to download file" });
        }
      });
    }
  } catch (err) {
    logger.error("Retrieve file error:", err);
    res.status(500).json({ error: "Failed to retrieve file" });
  }
});

// 10. Legacy User-Lists API required by Chat.jsx
router.get("/api/users", authenticateToken, async (req, res) => {
  try {
    if (req.user.isGuest) {
      return res.status(403).json({ message: "Access denied. Guests cannot list users." });
    }
    const users = await mongoose.model("User").find({}, { username: 1, displayName: 1, avatar: 1, status: 1, _id: 1 });
    res.json(users);
  } catch (err) {
    logger.error("Get users error:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.get("/api/users/conversations", authenticateToken, async (req, res) => {
  try {
    if (req.user.isGuest) {
      return res.status(403).json({ message: "Access denied. Guests cannot list conversations." });
    }

    const currentU = req.user.username.toLowerCase();

    // Aggregate private chats with latest message and preview
    const chats = await Message.aggregate([
      {
        $match: {
          privateChatId: { $regex: new RegExp(`(^|_)${currentU}(_|$)`, "i") }
        }
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$privateChatId",
          latestMessageTime: { $first: "$createdAt" },
          lastMessage: { $first: "$$ROOT" }
        }
      },
      { $sort: { latestMessageTime: -1 } }
    ]);

    // Extract partner usernames
    const partnerNames = chats.map(c => {
      const parts = c._id.split("_");
      const partner = parts.find(u => u.toLowerCase() !== currentU.toLowerCase());
      return partner ? partner.toLowerCase() : null;
    }).filter(Boolean);

    const uniquePartnerNames = [...new Set(partnerNames)];

    // Fetch user details for partners
    const dmUsers = await mongoose.model("User").find(
      { username: { $in: uniquePartnerNames.map(u => new RegExp(`^${u}$`, "i")) } },
      { username: 1, displayName: 1, avatar: 1, status: 1, _id: 1 }
    );

    // Map usernames to user docs for ordering
    const userMap = {};
    dmUsers.forEach(u => { userMap[u.username.toLowerCase()] = u; });

    // Get cleared chats for current user to filter out cleared messages
    const clearedChats = await ClearedChat.find({ username: { $regex: new RegExp(`^${currentU}$`, "i") } });
    const clearedMap = {};
    clearedChats.forEach(c => {
      clearedMap[c.chatId.toLowerCase()] = c.clearedAt;
    });

    const sortedDmUsers = uniquePartnerNames
      .map(name => ({ name, chat: chats.find(ch => ch._id.includes(name)) }))
      .filter(item => userMap[item.name])
      .map(item => {
        const u = userMap[item.name];
        const chatId = item.chat._id.toLowerCase();
        const clearedAt = clearedMap[chatId];

        let lastMessage = item.chat.lastMessage;
        if (clearedAt && lastMessage && new Date(lastMessage.createdAt) <= new Date(clearedAt)) {
          lastMessage = null;
        }

        return {
          ...u.toObject(),
          lastMessage
        };
      });

    res.json(sortedDmUsers);
  } catch (err) {
    logger.error("Get DM conversations error:", err);
    res.status(500).json({ error: "Failed to get conversations" });
  }
});

module.exports = router;
