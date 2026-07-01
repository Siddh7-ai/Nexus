// Load environment variables from .env file if it exists
const fs = require("fs");
const path = require("path");
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    envContent.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
            const index = trimmed.indexOf("=");
            if (index !== -1) {
                const key = trimmed.substring(0, index).trim();
                const val = trimmed.substring(index + 1).trim();
                if (key) {
                    process.env[key] = val;
                }
            }
        }
    });
}

const mongoose = require("mongoose");
const Message = require("./models/Message");
const ClearedChat = require("./models/ClearedChat");
const Room = require("./models/Room");
const VaultItem = require("./models/VaultItem");
const VaultPin = require("./models/VaultPin");
const express = require("express"); // trigger restart 2
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const keyRoutes = require("./routes/keyRoutes");
const { canAccessRoom } = require("./permissions");
const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "mysecretkey";
const multer = require("multer");
const { GridFSBucket, ObjectId } = require("mongodb");

// Multer In-Memory Storage Configuration
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

app.use(express.json({ limit: "10mb" }));
app.use(cors());
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/keys", keyRoutes);

// Endpoint for transcription config queries
app.get("/api/config/transcription", (req, res) => {
    res.json({
        mode: process.env.TRANSCRIPTION_MODE || "local",
        localModel: process.env.LOCAL_ASR_MODEL || "Xenova/distil-whisper-small.en",
        localModelVersion: process.env.LOCAL_MODEL_VERSION || "v1",
        devMode: process.env.TRANSCRIPTION_DEV_MODE === "true"
    });
});

// Endpoint for E2EE receiver ciphertext backup (reuses userRoutes middleware)
app.post("/api/messages/:messageId/backup", userRoutes.authenticateToken, async (req, res) => {
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

        // 1. Verify sender cannot use receiver backup endpoint on their own messages
        if (sender === requester) {
            return res.status(403).json({ error: "Sender cannot backup receiver ciphertext on their own message." });
        }

        // 2. Verify requesting user is actually a recipient of that message
        const chatUsers = msg.privateChatId.split("_");
        const isRecipient = chatUsers.includes(requester);
        if (!isRecipient) {
            return res.status(403).json({ error: "Access denied. You are not a recipient of this message." });
        }

        // 3. Save receiverCiphertext to that message document
        msg.receiverCiphertext = receiverCiphertext;
        await msg.save();

        res.json({ message: "Backup saved successfully." });
    } catch (err) {
        console.error("Backup error:", err);
        res.status(500).json({ error: "Server error saving backup." });
    }
});

// GET /api/vault/:privateChatId (re-uses userRoutes middleware)
app.get("/api/vault/:privateChatId", userRoutes.authenticateToken, async (req, res) => {
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
        console.error("Fetch vault items error:", err);
        res.status(500).json({ error: "Server error fetching vault items." });
    }
});

// POST /api/vault/:privateChatId (re-uses userRoutes middleware)
app.post("/api/vault/:privateChatId", userRoutes.authenticateToken, async (req, res) => {
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
        console.error("Save vault text item error:", err);
        res.status(500).json({ error: "Server error saving vault item." });
    }
});

// POST /api/vault/:privateChatId/file (re-uses userRoutes middleware)
app.post("/api/vault/:privateChatId/file", userRoutes.authenticateToken, async (req, res) => {
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
        console.error("Save vault file item error:", err);
        res.status(500).json({ error: "Server error saving vault item." });
    }
});

// DELETE /api/vault/:privateChatId/:itemId (re-uses userRoutes middleware)
app.delete("/api/vault/:privateChatId/:itemId", userRoutes.authenticateToken, async (req, res) => {
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

        // Verify item belongs to this private chat
        if (item.privateChatId !== privateChatId) {
            return res.status(400).json({ error: "Vault item does not belong to this chat" });
        }

        // Delete associated file in GridFS if it's a file item
        if (item.itemType === "file" && item.fileRef) {
            const db = mongoose.connection.db;
            const bucket = new GridFSBucket(db, { bucketName: "uploads" });
            try {
                await bucket.delete(new ObjectId(item.fileRef));
            } catch (fileErr) {
                console.error("Error deleting vault file from GridFS:", fileErr);
            }
        }

        await VaultItem.findByIdAndDelete(itemId);
        res.json({ message: "Vault item deleted successfully." });
    } catch (err) {
        console.error("Delete vault item error:", err);
        res.status(500).json({ error: "Server error deleting vault item." });
    }
});

// GET /api/vault-pin/:pinId (synchronized E2EE Vault setup recovery)
app.get("/api/vault-pin/:pinId", userRoutes.authenticateToken, async (req, res) => {
    try {
        if (req.user.isGuest) {
            return res.status(403).json({ error: "Access denied. Guests cannot access the vault PIN." });
        }
        const { pinId } = req.params;

        // Security check: Make sure user owns this pinId
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
        console.error("Fetch vault PIN error:", err);
        res.status(500).json({ error: "Server error fetching vault PIN." });
    }
});

// POST /api/vault-pin/:pinId (synchronized E2EE Vault setup backup)
app.post("/api/vault-pin/:pinId", userRoutes.authenticateToken, async (req, res) => {
    try {
        if (req.user.isGuest) {
            return res.status(403).json({ error: "Access denied. Guests cannot configure the vault PIN." });
        }
        const { pinId } = req.params;
        
        // Security check: Make sure user owns this pinId
        const prefix = `vault_pin_${req.user.username.toLowerCase()}_`;
        if (!pinId.startsWith(prefix)) {
            return res.status(403).json({ error: "Access denied. You do not own this vault PIN configuration." });
        }

        const { salt, encryptedVaultKey, pinType, pinHash } = req.body;
        if (!salt || !encryptedVaultKey || !encryptedVaultKey.nonce || !encryptedVaultKey.ciphertext || !pinType || !pinHash) {
            return res.status(400).json({ error: "Invalid vault PIN payload." });
        }

        // Upsert VaultPin
        await VaultPin.findOneAndUpdate(
            { pinId },
            { salt, encryptedVaultKey, pinType, pinHash },
            { upsert: true, new: true }
        );

        res.json({ message: "Vault PIN configuration saved successfully." });
    } catch (err) {
        console.error("Save vault PIN error:", err);
        res.status(500).json({ error: "Server error saving vault PIN." });
    }
});

// Upload endpoint (stores files in MongoDB GridFS)
app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        if (!mongoose.connection.db) {
            return res.status(500).json({ error: "Database connection not ready" });
        }

        const db = mongoose.connection.db;
        const bucket = new GridFSBucket(db, { bucketName: "uploads" });

        // Open upload stream to GridFS
        const uploadStream = bucket.openUploadStream(req.file.originalname, {
            contentType: req.file.mimetype
        });

        // Write the file buffer into GridFS
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
            console.error("GridFS upload stream error:", err);
            res.status(500).json({ error: "Failed to save file to database" });
        });
    } catch (err) {
        console.error("Upload error:", err);
        res.status(500).json({ error: "Failed to upload file" });
    }
});

// Express endpoint to receive audio upload and proxy to Python transcription service
app.post("/api/transcribe", upload.single("file"), async (req, res) => {
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
        console.error("[Node Server] Transcription routing error:", err);
        res.status(500).json({ error: "Failed to transcribe audio. Check backend service status." });
    }
});

// Async background transcription: downloads audio from GridFS, sends to Python ASR, saves result
async function transcribeMessageInBackground(messageId, fileUrl) {
    try {
        if ((process.env.TRANSCRIPTION_MODE || "local") !== "server") return;

        // Extract GridFS file ID from fileUrl (format: /api/file/<id>)
        const fileIdMatch = fileUrl.match(/\/api\/file\/([a-f0-9]+)/i);
        if (!fileIdMatch) {
            console.error("[ASR Background] Could not extract file ID from:", fileUrl);
            return;
        }

        const db = mongoose.connection.db;
        const bucket = new GridFSBucket(db, { bucketName: "uploads" });
        const fileId = new ObjectId(fileIdMatch[1]);

        // Download file from GridFS into memory buffer
        const chunks = [];
        const downloadStream = bucket.openDownloadStream(fileId);

        await new Promise((resolve, reject) => {
            downloadStream.on("data", (chunk) => chunks.push(chunk));
            downloadStream.on("end", resolve);
            downloadStream.on("error", reject);
        });

        const audioBuffer = Buffer.concat(chunks);
        console.log(`[ASR Background] Downloaded ${audioBuffer.length} bytes for message ${messageId}`);

        // Send to Python ASR service
        const formData = new FormData();
        const blob = new Blob([audioBuffer], { type: "audio/webm" });
        formData.append("file", blob, "voice_message.webm");

        const pythonRes = await fetch("http://127.0.0.1:5001/transcribe", {
            method: "POST",
            body: formData
        });

        if (!pythonRes.ok) {
            const errText = await pythonRes.text();
            console.error(`[ASR Background] Python ASR failed for ${messageId}:`, errText);
            return;
        }

        const result = await pythonRes.json();
        let transcript = (result.transcript || "").trim();

        // Clean up Whisper artifacts like "[BLANK_AUDIO]"
        if (transcript === "[BLANK_AUDIO]" || transcript === "(blank audio)" || transcript === "[BLANK AUDIO]") {
            transcript = "";
        }

        // Save transcript to the message document
        await Message.findByIdAndUpdate(messageId, { transcript });
        console.log(`[ASR Background] Transcript saved for ${messageId}: "${transcript}"`);

    } catch (err) {
        console.error(`[ASR Background] Error transcribing message ${messageId}:`, err.message);
    }
}

// GET endpoint to fetch transcript for a specific message (on-demand)
app.get("/api/transcript/:messageId", async (req, res) => {
    try {
        const { messageId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(messageId)) {
            return res.status(400).json({ error: "Invalid message ID" });
        }

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ error: "Message not found" });
        }

        // If transcript already exists (including empty string for silent audio), return it
        if (message.transcript !== null && message.transcript !== undefined) {
            return res.json({ transcript: message.transcript, status: "ready" });
        }

        // Transcript not yet ready — try to transcribe on-demand if it has a file
        if (message.fileUrl && (process.env.TRANSCRIPTION_MODE || "local") === "server") {
            await transcribeMessageInBackground(messageId, message.fileUrl);

            // Re-fetch the updated message
            const updated = await Message.findById(messageId);
            if (updated && updated.transcript !== null) {
                return res.json({ transcript: updated.transcript, status: "ready" });
            }
        }

        // Still not ready or server mode disabled
        return res.json({ transcript: null, status: "pending" });
    } catch (err) {
        console.error("[Transcript API] Error:", err);
        res.status(500).json({ error: "Failed to fetch transcript" });
    }
});

// File Retrieval endpoint (retrieves/streams files from MongoDB GridFS with Range support)
app.get("/api/file/:id", async (req, res) => {
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

        // Find file metadata
        const files = await bucket.find({ _id: fileId }).toArray();
        if (files.length === 0) {
            return res.status(404).json({ error: "File not found" });
        }

        const file = files[0];
        const range = req.headers.range;

        // Support direct forced download via Content-Disposition
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
                console.error("GridFS download stream error:", err);
                if (!res.headersSent) {
                    res.status(500).json({ error: "Failed to download file" });
                }
            });
        }
        // Support video byte-range requests for seeking in HTML5 players
        else if (range && file.contentType && file.contentType.startsWith("video/")) {
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
                end: end + 1 // exclusive in GridFS
            });
            downloadStream.pipe(res);

            downloadStream.on("error", (err) => {
                console.error("GridFS partial download stream error:", err);
                if (!res.headersSent) {
                    res.status(500).end();
                }
            });
        } else {
            // General file streaming (images, documents, whole videos)
            res.set({
                "Content-Type": file.contentType || "application/octet-stream",
                "Content-Length": file.length,
                "Cache-Control": "public, max-age=31536000" // cache static assets
            });

            const downloadStream = bucket.openDownloadStream(fileId);
            downloadStream.pipe(res);

            downloadStream.on("error", (err) => {
                console.error("GridFS download stream error:", err);
                if (!res.headersSent) {
                    res.status(500).json({ error: "Failed to download file" });
                }
            });
        }
    } catch (err) {
        console.error("Retrieve file error:", err);
        res.status(500).json({ error: "Failed to retrieve file" });
    }
});

// Serve frontend built assets
app.use(express.static(path.join(__dirname, "../frontend/dist")));

const server = http.createServer(app);

const io = new Server(server, {
    maxHttpBufferSize: 1e7,
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.set("io", io);

mongoose.connect("mongodb://127.0.0.1:27017/Chatapp")
    .then(() => console.log("MongoDB Connected"))
    .catch((err) => console.log(err));

// REST: get all users (for private messaging user list)
app.get("/api/users", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ message: "No token" });
        const token = authHeader.split(" ")[1];
        
        // Block guest tokens from hitting this DB list endpoint
        if (token.startsWith("guest:")) {
            return res.status(403).json({ message: "Access denied. Guests cannot list users." });
        }

        jwt.verify(token, JWT_SECRET);
        const users = await User.find({}, { username: 1, displayName: 1, avatar: 1, status: 1, _id: 1 });
        res.json(users);
    } catch (err) {
        res.status(401).json({ message: "Unauthorized" });
    }
});

// REST: get users that have active conversation history with current user, sorted by latest activity
app.get("/api/users/conversations", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ message: "No token" });
        const token = authHeader.split(" ")[1];

        if (token.startsWith("guest:")) {
            return res.status(403).json({ message: "Access denied. Guests cannot list conversations." });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const currentU = decoded.username.toLowerCase();

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
        const dmUsers = await User.find(
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
        console.error("Error fetching DM conversations:", err);
        res.status(401).json({ message: "Unauthorized" });
    }
});

const ROOMS = ["Nexus Official"];

// Map socketId -> { username, userId }
const connectedUsers = new Map();

function getUniqueOnlineUsers() {
    return Array.from(connectedUsers.values())
        .filter(u => u.username)
        .filter((u, i, arr) => arr.findIndex(x => x.username?.toLowerCase() === u.username?.toLowerCase()) === i);
}

function emitPresence() {
    const userList = getUniqueOnlineUsers();
    io.emit("onlineUsers", userList.length);
    io.emit("onlineUserList", userList);
}



async function getChatClearedAt(username, chatId) {
    if (!username || !chatId) return null;
    const record = await ClearedChat.findOne({ username, chatId });
    return record ? record.clearedAt : null;
}

// Rate Limiting for Room Join Code: max 10 attempts per minute per user
const rateLimitMap = new Map();

function checkRateLimit(userId) {
    const now = Date.now();
    if (!rateLimitMap.has(userId)) {
        rateLimitMap.set(userId, [now]);
        return true;
    }
    const attempts = rateLimitMap.get(userId).filter(t => now - t < 60000);
    if (attempts.length >= 10) {
        return false;
    }
    attempts.push(now);
    rateLimitMap.set(userId, attempts);
    return true;
}

io.use((socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error("Authentication required"));
        }

        // Support guest connection tokens
        if (token.startsWith("guest:")) {
            const username = token.split(":")[1];
            socket.username = username;
            socket.userId = "guest_" + username;
            socket.role = "guest";
            socket.request.user = { id: socket.userId, username: socket.username, role: socket.role };
            return next();
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        socket.username = decoded.username;
        socket.userId = decoded.userId;
        socket.role = "user";
        socket.request.user = { id: socket.userId, username: socket.username, role: socket.role };
        next();
    } catch (err) {
        next(new Error("Invalid token"));
    }
});

io.on("connection", async (socket) => {

    console.log("Connected:", socket.id);

    let displayName = socket.username;
    let avatar = "";
    let status = "Online";

    if (socket.role === "user") {
        try {
            const userDoc = await User.findOne({ username: socket.username });
            if (userDoc) {
                displayName = userDoc.displayName || socket.username;
                avatar = userDoc.avatar || "";
                status = userDoc.status || "Online";
                if (status === "Offline") {
                    status = "Online";
                    userDoc.status = "Online";
                    await userDoc.save();
                }
            }
        } catch (err) {
            console.error("Error fetching connection user details:", err);
        }
    }

    socket.displayName = displayName;
    socket.avatar = avatar;
    socket.status = status;

    connectedUsers.set(socket.id, {
        username: socket.username,
        userId: socket.userId,
        role: socket.role,
        displayName: socket.displayName,
        avatar: socket.avatar,
        status: socket.status
    });

    socket.emit("currentUser", {
        username: socket.username,
        userId: socket.userId,
        role: socket.role,
        displayName: socket.displayName,
        avatar: socket.avatar,
        status: socket.status
    });

    emitPresence();

    // Auto-join all public rooms for background notifications
    ROOMS.forEach(r => socket.join(r));

    // Join personal room for private notifications
    if (socket.username) {
        socket.join(`user_${socket.username.toLowerCase()}`);
    }

    // Auto-join all custom private rooms where the user is a member on connect
    if (socket.userId && socket.role === "user") {
        (async () => {
            try {
                const customRooms = await Room.find({ members: socket.userId });
                customRooms.forEach(room => {
                    socket.join(room._id.toString());
                });
                const populatedRooms = await Room.find({ members: socket.userId })
                    .sort({ createdAt: -1 })
                    .populate("admin", "username");
                socket.emit("customRoomsList", populatedRooms);
            } catch (err) {
                console.error("Error auto-joining custom rooms on connect:", err);
            }
        })();
    }



    // Calculate and emit initial unread counts
    (async () => {
        if (!socket.username) return;
        try {
            const unreadCounts = {};
            
            // Build list of accessible rooms for the user
            let systemRooms = ["Nexus Official"];
            const customRoomMap = {};
            if (socket.userId && !socket.userId.startsWith("guest_")) {
                const userDoc = await User.findById(socket.userId);
                if (userDoc && userDoc.deletedSystemRooms) {
                    systemRooms = systemRooms.filter(r => !userDoc.deletedSystemRooms.includes(r));
                }
                const userRooms = await Room.find({ members: socket.userId });
                userRooms.forEach(r => {
                    systemRooms.push(r._id.toString());
                    customRoomMap[r._id.toString()] = r.name;
                });
            }
            const accessibleRoomIds = systemRooms;

            const unreadMessages = await Message.find({
                username: { $ne: socket.username },
                seenBy: { $ne: socket.username },
                deletedFor: { $ne: socket.username },
                $or: [
                    { room: { $in: accessibleRoomIds } },
                    { privateChatId: { $regex: new RegExp(`(^|_)${socket.username}(_|$)`, "i") } }
                ]
            });

            for (const msg of unreadMessages) {
                const chatKey = msg.privateChatId || msg.room;
                if (!chatKey) continue;
                const clearedAt = await getChatClearedAt(socket.username, chatKey);
                if (clearedAt && msg.createdAt <= clearedAt) {
                    continue;
                }
                const isCustom = mongoose.Types.ObjectId.isValid(chatKey);
                const clientKey = isCustom ? (customRoomMap[chatKey] || chatKey) : chatKey;
                unreadCounts[clientKey] = (unreadCounts[clientKey] || 0) + 1;
            }
            socket.emit("unreadCounts", unreadCounts);
        } catch (err) {
            console.error("Error calculating unread counts on connection:", err);
        }
    })();



    // Join a chat room
    socket.on("joinRoom", async (room) => {
        try {
            // Leave any active private chat rooms since we are switching to a room
            for (const r of socket.rooms) {
                if (r.startsWith("private_")) {
                    socket.leave(r);
                }
            }
            const userId = socket.request.user?.id;
            let roomDoc = null;
            if (socket.role !== "guest" && userId) {
                if (mongoose.Types.ObjectId.isValid(room)) {
                    roomDoc = await Room.findById(room);
                } else {
                    roomDoc = await Room.findOne({ name: room, members: userId });
                }
            }

            if (roomDoc) {
                if (!socket.request || !socket.request.user) {
                    socket.emit("error", { message: "Access denied. Login required." });
                    return;
                }
                const isMember = roomDoc.members.some(m => m.toString() === userId.toString());
                if (!isMember) {
                    socket.emit("joinError", "You are not a member of this private room.");
                    socket.emit("error", { message: "Access denied. You are not a member of this private room." });
                    return;
                }
                
                const populated = await Room.findById(roomDoc._id)
                    .populate("admin", "username displayName avatar")
                    .populate("members", "username displayName avatar _id status");
                    
                socket.emit("activeRoomDetails", populated);

                const uniqueRoomId = roomDoc._id.toString();
                socket.join(uniqueRoomId);

                // Mark room messages as seen on join
                if (socket.username) {
                    try {
                        await Message.updateMany(
                            {
                                room: uniqueRoomId,
                                privateChatId: null,
                                username: { $ne: socket.username },
                                seenBy: { $ne: socket.username }
                            },
                            { $push: { seenBy: socket.username } }
                        );
                        const updatedMsgs = await Message.find({ room: uniqueRoomId, privateChatId: null }).select("_id seenBy");
                        io.to(uniqueRoomId).emit("messagesSeenUpdate", updatedMsgs);
                    } catch (err) {
                        console.error("Error marking room messages as seen:", err);
                    }
                }

                const clearedAt = await getChatClearedAt(socket.username, uniqueRoomId);
                const messagesQuery = {
                    room: uniqueRoomId,
                    privateChatId: null,
                    deletedFor: { $ne: socket.username }
                };
                if (clearedAt) {
                    messagesQuery.createdAt = { $gt: clearedAt };
                }
                const messages = await Message.find(messagesQuery).sort({ createdAt: 1 });
                const mappedMessages = messages.map(msg => {
                    const mObj = msg.toObject();
                    mObj.room = roomDoc.name;
                    return mObj;
                });
                socket.emit("oldMessages", { room: roomDoc.name, messages: mappedMessages });
            } else {
                if (!canAccessRoom(socket.role, room)) {
                    socket.emit("error", { message: "Access denied. Login required." });
                    return;
                }
                socket.emit("activeRoomDetails", { name: room, isPrivate: false });

                socket.join(room);

                // Mark room messages as seen on join
                if (socket.username) {
                    try {
                        await Message.updateMany(
                            {
                                room,
                                privateChatId: null,
                                username: { $ne: socket.username },
                                seenBy: { $ne: socket.username }
                            },
                            { $push: { seenBy: socket.username } }
                        );
                        const updatedMsgs = await Message.find({ room, privateChatId: null }).select("_id seenBy");
                        io.to(room).emit("messagesSeenUpdate", updatedMsgs);
                    } catch (err) {
                        console.error("Error marking room messages as seen:", err);
                    }
                }

                const clearedAt = await getChatClearedAt(socket.username, room);
                const messagesQuery = {
                    room,
                    privateChatId: null,
                    deletedFor: { $ne: socket.username }
                };
                if (clearedAt) {
                    messagesQuery.createdAt = { $gt: clearedAt };
                }
                const messages = await Message.find(messagesQuery).sort({ createdAt: 1 });
                socket.emit("oldMessages", { room, messages });
            }
        } catch (err) {
            console.error("Error checking private room permission:", err);
            socket.emit("error", { message: "Server error joining room." });
            return;
        }
    });

    // Join private chat
    socket.on("joinPrivateChat", async ({ otherUsername }) => {
        if (socket.role === "guest") {
            socket.emit("error", { message: "Access denied. Login required." });
            return;
        }

        const users = [socket.username.toLowerCase(), otherUsername.toLowerCase()].sort();
        const privateChatId = users.join("_");

        // Leave any other active private chat rooms before joining the new one
        for (const room of socket.rooms) {
            if (room.startsWith("private_") && room !== `private_${privateChatId}`) {
                socket.leave(room);
            }
        }

        socket.join(`private_${privateChatId}`);

        const clearedAt = await getChatClearedAt(socket.username, privateChatId);
        const messagesQuery = {
            privateChatId,
            deletedFor: { $ne: socket.username }
        };
        if (clearedAt) {
            messagesQuery.createdAt = { $gt: clearedAt };
        }
        const messages = await Message.find(messagesQuery).sort({ createdAt: 1 });
        socket.emit("oldMessages", { privateChatId, messages });

        // Mark messages as seen
        await Message.updateMany(
            {
                privateChatId,
                username: { $ne: socket.username },
                seenBy: { $ne: socket.username }
            },
            { 
                $push: { seenBy: socket.username },
                $set: { seenAt: new Date() }
            }
        );
        // Notify sender their messages were seen
        const updatedMsgs = await Message.find({ privateChatId }).sort({ createdAt: 1 });
        io.to(`private_${privateChatId}`).emit("messagesSeenUpdate", updatedMsgs);
        const parts = privateChatId.split("_");
        parts.forEach(part => {
            io.to(`user_${part.toLowerCase()}`).emit("messagesSeenUpdate", updatedMsgs);
        });
    });

    socket.on("requestSessionReset", ({ privateChatId }) => {
        if (!privateChatId) return;
        socket.to(`private_${privateChatId}`).emit("sessionResetRequested", { privateChatId });
    });

    socket.on("requestSessionResetAndResend", ({ messageId, privateChatId }) => {
        if (!privateChatId || !messageId) return;
        socket.to(`private_${privateChatId}`).emit("sessionResetAndResendRequested", { messageId, privateChatId });
    });

    socket.on("resendEncryptedMessage", async ({ messageId, privateChatId, text, ratchetHeader, handshakePayload, senderCiphertext }) => {
        try {
            const msg = await Message.findById(messageId);
            if (msg) {
                msg.text = text;
                msg.ratchetHeader = ratchetHeader;
                if (handshakePayload) msg.handshakePayload = handshakePayload;
                if (senderCiphertext) msg.senderCiphertext = senderCiphertext;
                msg.receiverCiphertext = undefined;
                await msg.save();

                io.to(`private_${privateChatId}`).emit("messageUpdated", msg);
                const parts = privateChatId.split("_");
                parts.forEach(part => {
                    io.to(`user_${part.toLowerCase()}`).emit("messageUpdated", msg);
                });
            }
        } catch (err) {
            console.error("Error in resendEncryptedMessage:", err);
        }
    });

    socket.on("typing", async ({ room, privateChatId }) => {
        if (privateChatId) {
            if (socket.role === "guest") return;
            socket.to(`private_${privateChatId}`).emit("typing", {
                username: socket.username,
                role: socket.role,
                displayName: socket.displayName || socket.username,
                avatar: socket.avatar || "",
                room: null,
                privateChatId
            });
        } else {
            const targetRoom = room || "Nexus Official";
            const userId = socket.request.user?.id;
            let roomDoc = null;
            if (socket.role !== "guest" && userId) {
                if (mongoose.Types.ObjectId.isValid(targetRoom)) {
                    roomDoc = await Room.findById(targetRoom);
                } else {
                    roomDoc = await Room.findOne({ name: targetRoom, members: userId });
                }
            }

            let targetChannel = targetRoom;
            let roomNameValue = targetRoom;

            try {
                if (roomDoc) {
                    if (!socket.request || !socket.request.user) return;
                    const isMember = roomDoc.members.some(m => m.toString() === userId.toString());
                    if (!isMember) return;
                    targetChannel = roomDoc._id.toString();
                    roomNameValue = roomDoc.name;
                } else {
                    if (!canAccessRoom(socket.role, targetRoom)) return;
                }
            } catch (err) {
                console.error("Error verifying typing room permissions:", err);
                return;
            }
            socket.to(targetChannel).emit("typing", {
                username: socket.username,
                role: socket.role,
                displayName: socket.displayName || socket.username,
                avatar: socket.avatar || "",
                room: roomNameValue,
                privateChatId: null
            });
        }
    });

    // Stop Typing
    socket.on("stopTyping", async ({ room, privateChatId }) => {
        if (privateChatId) {
            if (socket.role === "guest") return;
            socket.to(`private_${privateChatId}`).emit("stopTyping", {
                username: socket.username,
                room: null,
                privateChatId
            });
        } else {
            const targetRoom = room || "Nexus Official";
            const userId = socket.request.user?.id;
            let roomDoc = null;
            if (socket.role !== "guest" && userId) {
                if (mongoose.Types.ObjectId.isValid(targetRoom)) {
                    roomDoc = await Room.findById(targetRoom);
                } else {
                    roomDoc = await Room.findOne({ name: targetRoom, members: userId });
                }
            }

            let targetChannel = targetRoom;
            let roomNameValue = targetRoom;
            if (roomDoc) {
                targetChannel = roomDoc._id.toString();
                roomNameValue = roomDoc.name;
            }
            socket.to(targetChannel).emit("stopTyping", {
                username: socket.username,
                room: roomNameValue,
                privateChatId: null
            });
        }
    });

    // Recording status
    socket.on("recordingStart", async ({ room, privateChatId }) => {
        if (privateChatId) {
            if (socket.role === "guest") return;
            socket.to(`private_${privateChatId}`).emit("recordingStart", {
                username: socket.username,
                role: socket.role,
                displayName: socket.displayName || socket.username,
                avatar: socket.avatar || "",
                room: null,
                privateChatId
            });
        } else {
            const targetRoom = room || "Nexus Official";
            const userId = socket.request.user?.id;
            let roomDoc = null;
            if (socket.role !== "guest" && userId) {
                if (mongoose.Types.ObjectId.isValid(targetRoom)) {
                    roomDoc = await Room.findById(targetRoom);
                } else {
                    roomDoc = await Room.findOne({ name: targetRoom, members: userId });
                }
            }

            let targetChannel = targetRoom;
            let roomNameValue = targetRoom;

            try {
                if (roomDoc) {
                    if (!socket.request || !socket.request.user) return;
                    const isMember = roomDoc.members.some(m => m.toString() === userId.toString());
                    if (!isMember) return;
                    targetChannel = roomDoc._id.toString();
                    roomNameValue = roomDoc.name;
                } else {
                    if (!canAccessRoom(socket.role, targetRoom)) return;
                }
            } catch (err) {
                console.error("Error verifying recording room permissions:", err);
                return;
            }
            socket.to(targetChannel).emit("recordingStart", {
                username: socket.username,
                role: socket.role,
                displayName: socket.displayName || socket.username,
                avatar: socket.avatar || "",
                room: roomNameValue,
                privateChatId: null
            });
        }
    });

    socket.on("recordingStop", async ({ room, privateChatId }) => {
        if (privateChatId) {
            if (socket.role === "guest") return;
            socket.to(`private_${privateChatId}`).emit("recordingStop", {
                username: socket.username,
                room: null,
                privateChatId
            });
        } else {
            const targetRoom = room || "Nexus Official";
            const userId = socket.request.user?.id;
            let roomDoc = null;
            if (socket.role !== "guest" && userId) {
                if (mongoose.Types.ObjectId.isValid(targetRoom)) {
                    roomDoc = await Room.findById(targetRoom);
                } else {
                    roomDoc = await Room.findOne({ name: targetRoom, members: userId });
                }
            }

            let targetChannel = targetRoom;
            let roomNameValue = targetRoom;
            if (roomDoc) {
                targetChannel = roomDoc._id.toString();
                roomNameValue = roomDoc.name;
            }
            socket.to(targetChannel).emit("recordingStop", {
                username: socket.username,
                room: roomNameValue,
                privateChatId: null
            });
        }
    });

    // Send message (room or private)
    socket.on("message", async (data) => {
        try {
            let targetRoomName = data.privateChatId
                ? `private_${data.privateChatId}`
                : (data.room || "Nexus Official");
            let dbRoomValue = data.room || "Nexus Official";
            let roomNameValue = data.room || "Nexus Official";

            if (data.privateChatId) {
                if (socket.role === "guest") {
                    socket.emit("error", { message: "Access denied. Login required." });
                    return;
                }
            } else {
                const room = data.room || "Nexus Official";
                if (room === "Nexus Official" && socket.username !== "Siddh") {
                    socket.emit("error", { message: "Only the administrator can post messages in this channel." });
                    return;
                }
                const userId = socket.request.user?.id;
                let roomDoc = null;
                if (socket.role !== "guest" && userId) {
                    if (mongoose.Types.ObjectId.isValid(room)) {
                        roomDoc = await Room.findById(room);
                    } else {
                        roomDoc = await Room.findOne({ name: room, members: userId });
                    }
                }

                if (roomDoc) {
                    if (!socket.request || !socket.request.user) {
                        socket.emit("error", { message: "Access denied. Login required." });
                        return;
                    }
                    const isMember = roomDoc.members.some(m => m.toString() === userId.toString());
                    if (!isMember) {
                        socket.emit("error", { message: "Access denied. You are not a member of this private room." });
                        return;
                    }
                    targetRoomName = roomDoc._id.toString();
                    dbRoomValue = roomDoc._id.toString();
                    roomNameValue = roomDoc.name;
                } else {
                    if (!canAccessRoom(socket.role, room)) {
                        socket.emit("error", { message: "Access denied. Login required." });
                        return;
                    }
                }
            }

            const activeUsernames = [socket.username];
            const socketIds = io.sockets.adapter.rooms.get(targetRoomName);
            if (socketIds) {
                for (const id of socketIds) {
                    const s = io.sockets.sockets.get(id);
                    if (s && s.username && !activeUsernames.includes(s.username)) {
                        activeUsernames.push(s.username);
                    }
                }
            }

            const msgData = {
                username: socket.username,
                tempId: data.tempId || null,
                text: data.text,
                isGuest: socket.role === "guest",
                seenBy: activeUsernames,
                avatar: socket.avatar || "",
                displayName: socket.displayName || socket.username,
                fileUrl: data.fileUrl || null,
                fileName: data.fileName || null,
                fileSize: data.fileSize || null,
                fileType: data.fileType || null,
                fileQuality: data.fileQuality || null,
                ratchetHeader: data.ratchetHeader || null,
                handshakePayload: data.handshakePayload || null,
                senderCiphertext: data.senderCiphertext || null,
                replyTo: data.replyTo || null
            };

            if (data.privateChatId) {
                msgData.privateChatId = data.privateChatId;
                msgData.room = null;
            } else {
                msgData.room = dbRoomValue;
                msgData.privateChatId = null;
            }

            const savedMessage = await Message.create(msgData);
            console.log("[Nexus ASR G] Database document saved:", JSON.stringify(savedMessage));

            if (data.privateChatId) {
                io.to(`private_${data.privateChatId}`).emit("reply", savedMessage);

                // Also notify the recipient if they are online (so their sidebar gets updated with unread count)
                const parts = data.privateChatId.split("_");
                const recipient = parts.find(u => u !== socket.username.toLowerCase());
                if (recipient) {
                    io.to(`user_${recipient.toLowerCase()}`).emit("reply", savedMessage);
                }
            } else {
                const clientMsg = savedMessage.toObject();
                clientMsg.room = roomNameValue;
                io.to(targetRoomName).emit("reply", clientMsg);
            }

            // Fire-and-forget: Trigger async background transcription for voice messages
            if (savedMessage.fileUrl && savedMessage.fileType &&
                (savedMessage.fileType.startsWith("audio/") || savedMessage.fileType === "audio/e2ee") &&
                savedMessage.fileType !== "audio/e2ee") { // Skip E2EE (server can't decrypt)
                transcribeMessageInBackground(savedMessage._id.toString(), savedMessage.fileUrl)
                    .catch(err => console.error("[ASR Background] Fire-and-forget error:", err.message));
            }
        } catch (error) {
            console.log(error);
        }
    });

    // Message seen (mark as seen when user views)
    socket.on("markSeen", async ({ messageId }) => {
        try {
            const msg = await Message.findByIdAndUpdate(
                messageId,
                { 
                    $addToSet: { seenBy: socket.username },
                    $set: { seenAt: new Date() }
                },
                { new: true }
            );
            if (!msg) return;
            const room = msg.privateChatId
                ? `private_${msg.privateChatId}`
                : msg.room;
            io.to(room).emit("messageUpdated", msg);
        } catch (err) {
            console.log(err);
        }
    });

    // React to a message
    socket.on("reactMessage", async ({ messageId, emoji }) => {
        try {
            const msg = await Message.findById(messageId);
            if (!msg) return;

            // Toggle: remove if same emoji from same user, else add/replace
            const existingIdx = msg.reactions.findIndex(
                r => r.username?.toLowerCase() === socket.username?.toLowerCase()
            );

            if (existingIdx !== -1) {
                if (msg.reactions[existingIdx].emoji === emoji) {
                    // Remove reaction
                    msg.reactions.splice(existingIdx, 1);
                } else {
                    // Replace emoji
                    msg.reactions[existingIdx].emoji = emoji;
                }
            } else {
                msg.reactions.push({ emoji, username: socket.username });
            }

            await msg.save();

            const room = msg.privateChatId
                ? `private_${msg.privateChatId}`
                : msg.room;
            io.to(room).emit("messageUpdated", msg);
        } catch (err) {
            console.log(err);
        }
    });

    // Edit message
    socket.on("editMessage", async ({ messageId, newText }) => {
        try {
            const msg = await Message.findById(messageId);
            if (!msg || msg.username !== socket.username) return;

            // Block guests from editing message outside Nexus Official
            if (socket.role === "guest" && msg.room !== "Nexus Official") {
                return;
            }

            msg.text = newText;
            msg.isEdited = true;
            await msg.save();

            const room = msg.privateChatId
                ? `private_${msg.privateChatId}`
                : msg.room;
            io.to(room).emit("messageUpdated", msg);
        } catch (err) {
            console.log(err);
        }
    });

    // Delete message
    socket.on("deleteMessage", async ({ messageId, deleteFor, deleteFileFromServer }) => {
        try {
            const msg = await Message.findById(messageId);
            if (!msg) return;

            // Block guests from deleting message outside Nexus Official
            if (socket.role === "guest" && msg.room !== "Nexus Official") {
                return;
            }

            if (deleteFileFromServer && msg.fileUrl) {
                // Extract fileId from fileUrl (typically ends with fileId)
                const parts = msg.fileUrl.split("/");
                const fileIdStr = parts[parts.length - 1];
                if (fileIdStr && mongoose.Types.ObjectId.isValid(fileIdStr)) {
                    const db = mongoose.connection.db;
                    const bucket = new GridFSBucket(db, { bucketName: "uploads" });
                    try {
                        await bucket.delete(new ObjectId(fileIdStr));
                    } catch (fileErr) {
                        console.error("Error deleting file from GridFS:", fileErr);
                    }
                }
            }

            if (deleteFor === "everyone" && msg.username?.toLowerCase() === socket.username?.toLowerCase()) {
                // If the message is locked in the shared vault, also delete it from VaultItem
                if (msg.isLocked && msg.lockedItemId) {
                    const item = await VaultItem.findById(msg.lockedItemId);
                    if (item) {
                        if (item.itemType === "file" && item.fileRef) {
                            const db = mongoose.connection.db;
                            const bucket = new GridFSBucket(db, { bucketName: "uploads" });
                            try {
                                await bucket.delete(new ObjectId(item.fileRef));
                            } catch (fileErr) {
                                console.error("Error deleting vault file from GridFS:", fileErr);
                            }
                        }
                        await VaultItem.findByIdAndDelete(msg.lockedItemId);
                    }
                    msg.isLocked = false;
                    msg.lockedItemId = null;
                    msg.lockedBy = null;
                    msg.lockedAt = null;
                }

                msg.isDeleted = true;
                msg.text = "This message was deleted";
                if (deleteFileFromServer) {
                    msg.fileUrl = null;
                    msg.fileName = null;
                    msg.fileSize = null;
                    msg.fileType = null;
                    msg.fileQuality = null;
                }
                await msg.save();
                const room = msg.privateChatId
                    ? `private_${msg.privateChatId}`
                    : msg.room;
                io.to(room).emit("messageUpdated", msg);
            } else {
                // Delete for me only
                const lowercaseUsername = socket.username?.toLowerCase();
                const isAlreadyDeleted = msg.deletedFor.some(u => u?.toLowerCase() === lowercaseUsername);
                if (!isAlreadyDeleted) {
                    msg.deletedFor.push(socket.username);
                    await msg.save();
                }
                // Only affects the requesting socket
                socket.emit("messageDeletedForMe", messageId);
            }
        } catch (err) {
            console.log(err);
        }
    });

    // Lock message and save E2EE lock status
    socket.on("lockMessage", async ({ messageId, lockedItemId }) => {
        try {
            const msg = await Message.findById(messageId);
            if (!msg) return;

            if (socket.role === "guest" && msg.room !== "Nexus Official") {
                return;
            }

            msg.isLocked = true;
            msg.lockedItemId = lockedItemId;
            msg.lockedBy = socket.username;
            msg.lockedAt = new Date();
            msg.text = "🔒 Locked message";

            // If the message has attachments, securely delete them from GridFS server
            if (msg.fileUrl) {
                const parts = msg.fileUrl.split("/");
                const fileIdStr = parts[parts.length - 1];
                if (fileIdStr && mongoose.Types.ObjectId.isValid(fileIdStr)) {
                    const db = mongoose.connection.db;
                    const bucket = new GridFSBucket(db, { bucketName: "uploads" });
                    try {
                        await bucket.delete(new ObjectId(fileIdStr));
                    } catch (fileErr) {
                        console.error("Error deleting file from GridFS in lockMessage:", fileErr);
                    }
                }
            }

            // Clear metadata fields to prevent plaintext access
            msg.fileUrl = null;
            msg.fileName = null;
            msg.fileSize = null;
            msg.fileType = null;
            msg.fileQuality = null;
            await msg.save();

            const room = msg.privateChatId
                ? `private_${msg.privateChatId}`
                : msg.room;
            io.to(room).emit("messageUpdated", msg);
        } catch (err) {
            console.log(err);
        }
    });

    // Clear chat only for current user
    socket.on("clearChat", async ({ chatId }) => {
        try {
            if (!socket.username || !chatId) return;

            let targetChatId = chatId;
            const isPrivate = chatId.includes("_");
            
            if (!isPrivate) {
                const userId = socket.request.user?.id;
                let roomDoc = null;
                if (socket.role !== "guest" && userId) {
                    if (mongoose.Types.ObjectId.isValid(chatId)) {
                        roomDoc = await Room.findById(chatId);
                    } else {
                        roomDoc = await Room.findOne({ name: chatId, members: userId });
                    }
                }
                if (roomDoc) {
                    targetChatId = roomDoc._id.toString();
                }
            }

            await ClearedChat.findOneAndUpdate(
                { username: socket.username, chatId: targetChatId },
                { clearedAt: new Date() },
                { upsert: true, new: true }
            );

            if (isPrivate) {
                socket.emit("oldMessages", { privateChatId: chatId, messages: [] });
            } else {
                socket.emit("oldMessages", { room: chatId, messages: [] });
            }
        } catch (err) {
            console.log("Error clearing chat:", err);
            socket.emit("error", { message: "Failed to clear chat." });
        }
    });

    // Change username
    socket.on("changeUsername", ({ newUsername }) => {
        try {
            if (!socket.username || !newUsername) return;

            const oldUsername = socket.username;
            socket.username = newUsername;

            if (oldUsername) {
                socket.leave(`user_${oldUsername.toLowerCase()}`);
            }
            socket.join(`user_${newUsername.toLowerCase()}`);

            // Update connectedUsers entry
            connectedUsers.set(socket.id, {
                username: newUsername,
                userId: socket.userId,
                role: socket.role,
                displayName: socket.displayName || newUsername,
                avatar: socket.avatar || "",
                status: socket.status || "Online"
            });

            // Re-emit currentUser
            socket.emit("currentUser", {
                username: newUsername,
                userId: socket.userId,
                role: socket.role,
                displayName: socket.displayName || newUsername,
                avatar: socket.avatar || "",
                status: socket.status || "Online"
            });

            // Update presence for all connected sockets
            emitPresence();
        } catch (err) {
            console.log("Error changing username:", err);
        }
    });

    // Update Profile dynamically in memory
    socket.on("updateProfile", ({ displayName, avatar, status }) => {
        try {
            if (socket.role === "guest") return;
            if (displayName !== undefined) socket.displayName = displayName;
            if (avatar !== undefined) socket.avatar = avatar;
            if (status !== undefined) socket.status = status;

            const conn = connectedUsers.get(socket.id);
            if (conn) {
                conn.displayName = socket.displayName;
                conn.avatar = socket.avatar;
                conn.status = socket.status;
            }

            emitPresence();
        } catch (err) {
            console.log("Error updating profile in socket:", err);
        }
    });

    // Auth guard checker helper
    const userGuard = (socket) => {
        if (!socket.request || !socket.request.user) {
            socket.emit("error", { message: "Unauthorized. Authentication required." });
            return false;
        }
        return true;
    };

    // Socket Custom Private Rooms Events
    socket.on("fetchCustomRooms", async () => {
        if (!userGuard(socket)) return;
        try {
            const userId = socket.request.user.id;
            const rooms = await Room.find({ members: userId })
                .sort({ createdAt: -1 })
                .populate("admin", "username");
            socket.emit("customRoomsList", rooms);
        } catch (err) {
            console.error("Error fetching custom rooms:", err);
            socket.emit("error", { message: "Error fetching rooms." });
        }
    });

    socket.on("createRoom", async (payload) => {
        if (!userGuard(socket)) return;
        try {
            const userId = socket.request.user.id;
            const username = socket.request.user.username;
            
            let roomName = "";
            let roomAvatar = "";
            
            if (typeof payload === "string") {
                roomName = payload;
            } else if (payload && typeof payload === "object") {
                roomName = payload.name || "";
                roomAvatar = payload.avatar || "";
            }
            
            if (!roomName || roomName.trim().length < 2 || roomName.trim().length > 40) {
                socket.emit("error", { message: "Room name must be between 2 and 40 characters." });
                return;
            }
            
            const count = await Room.countDocuments({ admin: userId });
            if (count >= 20) {
                socket.emit("error", { message: "You have reached the maximum limit of 20 rooms." });
                return;
            }
            
            let code = "";
            let retries = 0;
            let exists = true;
            while (exists && retries < 5) {
                code = Math.floor(100000 + Math.random() * 900000).toString();
                const countCode = await Room.countDocuments({ code });
                if (countCode === 0) {
                    exists = false;
                }
                retries++;
            }
            
            if (exists) {
                socket.emit("error", { message: "Failed to generate a unique room code. Please try again." });
                return;
            }
            
            const newRoom = new Room({
                name: roomName.trim(),
                code,
                admin: userId,
                members: [userId],
                avatar: roomAvatar
            });
            await newRoom.save();
            
            socket.join(newRoom.name);
            console.log(`User ${username} created custom room: ${newRoom.name} (${code})`);
            
            const rooms = await Room.find({ members: userId })
                .sort({ createdAt: -1 })
                .populate("admin", "username");
            socket.emit("customRoomsList", rooms);
            
            const populated = await Room.findById(newRoom._id)
                .populate("admin", "username displayName avatar")
                .populate("members", "username displayName avatar _id status");
            socket.emit("roomCreatedSuccess", populated);
        } catch (err) {
            console.error("Error creating room:", err);
            socket.emit("error", { message: "Failed to create room." });
        }
    });

    socket.on("editRoom", async ({ roomId, name: newName, avatar: newAvatar }) => {
        if (!userGuard(socket)) return;
        try {
            const userId = socket.request.user.id;
            const username = socket.request.user.username;
            
            const room = await Room.findById(roomId);
            if (!room) {
                socket.emit("error", { message: "Room not found." });
                return;
            }
            
            if (room.admin.toString() !== userId.toString()) {
                socket.emit("error", { message: "Unauthorized. Admin privileges required." });
                return;
            }
            
            const oldName = room.name;
            let nameChanged = false;
            
            if (newName && newName.trim() !== oldName) {
                const cleanedName = newName.trim();
                if (cleanedName.length < 2 || cleanedName.length > 40) {
                    socket.emit("error", { message: "Room name must be between 2 and 40 characters." });
                    return;
                }
                room.name = cleanedName;
                nameChanged = true;
            }
            
            if (newAvatar !== undefined) {
                room.avatar = newAvatar;
            }
            
            await room.save();
            
            const populated = await Room.findById(room._id)
                .populate("admin", "username displayName avatar")
                .populate("members", "username displayName avatar _id status");
                
            if (nameChanged) {
                // Update room name in all Messages database documents
                await Message.updateMany({ room: oldName }, { room: room.name });
                
                // Notify all clients in the old room of rename & details update
                io.to(oldName).emit("roomRenamed", { 
                    oldName, 
                    newName: room.name, 
                    room: populated 
                });
                
                // Instruct sockets connected to the old room to join the new room name in socket.io
                const socketsInRoom = await io.in(oldName).fetchSockets();
                socketsInRoom.forEach(s => {
                    s.join(room.name);
                    s.leave(oldName);
                });
            } else {
                // Just emit a details update
                io.to(room.name).emit("roomMemberUpdate", populated);
            }
            
            // Send updated customRoomsList to all members of the room
            const memberIds = populated.members.map(m => m._id);
            for (const memberId of memberIds) {
                const memberRooms = await Room.find({ members: memberId })
                    .sort({ createdAt: -1 })
                    .populate("admin", "username");
                const memberDoc = populated.members.find(m => m._id.toString() === memberId.toString());
                if (memberDoc) {
                    io.to(`user_${memberDoc.username.toLowerCase()}`).emit("customRoomsList", memberRooms);
                }
            }
        } catch (err) {
            console.error("Error editing room:", err);
            socket.emit("error", { message: "Failed to edit room details." });
        }
    });

    socket.on("joinRoomByCode", async (code) => {
        if (!userGuard(socket)) return;
        try {
            const userId = socket.request.user.id;
            const username = socket.request.user.username;
            
            if (!checkRateLimit(userId)) {
                socket.emit("joinError", "Too many attempts. Please try again later.");
                return;
            }
            
            if (!code || code.trim().length !== 6 || isNaN(code)) {
                socket.emit("joinError", "Invalid code format. Must be 6 digits.");
                return;
            }
            
            const room = await Room.findOne({ code: code.trim() });
            if (!room) {
                socket.emit("joinError", "Room not found");
                return;
            }
            
            if (room.members.length >= room.maxMembers) {
                socket.emit("joinError", "Room is full");
                return;
            }
            
            if (room.members.some(m => m.toString() === userId.toString())) {
                socket.emit("joinError", "Already a member");
                return;
            }
            
            await Room.findByIdAndUpdate(room._id, { $addToSet: { members: userId } });
            
            socket.join(room.name);
            console.log(`User ${username} joined custom room: ${room.name}`);
            
            const rooms = await Room.find({ members: userId })
                .sort({ createdAt: -1 })
                .populate("admin", "username");
            
            const populated = await Room.findById(room._id)
                .populate("admin", "username displayName avatar")
                .populate("members", "username displayName avatar _id status");
            
            socket.emit("joinSuccess", { room: populated, customRoomsList: rooms });
            io.to(room.name).emit("roomMemberUpdate", populated);
        } catch (err) {
            console.error("Error joining room by code:", err);
            socket.emit("joinError", "Failed to join room.");
        }
    });

    socket.on("leaveRoom", async (roomName) => {
        if (!userGuard(socket)) return;
        try {
            const userId = socket.request.user.id;
            const username = socket.request.user.username;
            
            let room = null;
            if (mongoose.Types.ObjectId.isValid(roomName)) {
                room = await Room.findById(roomName);
            } else {
                room = await Room.findOne({ name: roomName, members: userId });
            }

            if (!room) {
                socket.emit("error", { message: "Room not found." });
                return;
            }
            
            const uniqueRoomId = room._id.toString();
            const realRoomName = room.name;

            if (room.admin.toString() === userId.toString()) {
                io.to(uniqueRoomId).emit("roomDeleted", { roomName: realRoomName });
                
                const socketsInRoom = await io.in(uniqueRoomId).fetchSockets();
                socketsInRoom.forEach(s => s.leave(uniqueRoomId));
                
                await Room.findByIdAndDelete(room._id);
                console.log(`Room ${realRoomName} deleted by admin: ${username}`);
            } else {
                await Room.findByIdAndUpdate(room._id, { $pull: { members: userId } });
                socket.leave(uniqueRoomId);
                console.log(`User ${username} left room: ${realRoomName}`);
                
                const updatedRoom = await Room.findById(room._id)
                    .populate("admin", "username displayName avatar")
                    .populate("members", "username displayName avatar _id status");
                io.to(uniqueRoomId).emit("roomMemberUpdate", updatedRoom);
            }
            
            const rooms = await Room.find({ members: userId })
                .sort({ createdAt: -1 })
                .populate("admin", "username");
            socket.emit("customRoomsList", rooms);
        } catch (err) {
            console.error("Error leaving room:", err);
            socket.emit("error", { message: "Failed to leave room." });
        }
    });

    socket.on("deleteRoom", async (roomName) => {
        if (!userGuard(socket)) return;
        try {
            const userId = socket.request.user.id;
            const username = socket.request.user.username;
            
            let room = null;
            if (mongoose.Types.ObjectId.isValid(roomName)) {
                room = await Room.findById(roomName);
            } else {
                room = await Room.findOne({ name: roomName, admin: userId });
            }

            if (!room) {
                socket.emit("error", { message: "Room not found." });
                return;
            }
            
            if (room.admin.toString() !== userId.toString()) {
                socket.emit("error", { message: "Unauthorized. Admin privileges required." });
                return;
            }
            
            const uniqueRoomId = room._id.toString();
            const realRoomName = room.name;

            io.to(uniqueRoomId).emit("roomDeleted", { roomName: realRoomName });
            
            const socketsInRoom = await io.in(uniqueRoomId).fetchSockets();
            socketsInRoom.forEach(s => s.leave(uniqueRoomId));
            
            await Room.findByIdAndDelete(room._id);
            console.log(`Room ${realRoomName} deleted by admin: ${username}`);
            
            const rooms = await Room.find({ members: userId })
                .sort({ createdAt: -1 })
                .populate("admin", "username");
            socket.emit("customRoomsList", rooms);
        } catch (err) {
            console.error("Error deleting room:", err);
            socket.emit("error", { message: "Failed to delete room." });
        }
    });

    socket.on("deleteSystemRoom", async ({ roomName }) => {
        if (!userGuard(socket)) return;
        try {
            const userId = socket.request.user.id;
            const username = socket.request.user.username;
            
            const updatedUser = await User.findByIdAndUpdate(
                userId,
                { $addToSet: { deletedSystemRooms: roomName } },
                { new: true }
            );
            
            console.log(`User ${username} deleted/hid system room: ${roomName}`);
            socket.emit("deletedSystemRoomsUpdated", updatedUser.deletedSystemRooms || []);
        } catch (err) {
            console.error("Error hiding/deleting system room:", err);
            socket.emit("error", { message: "Failed to delete room." });
        }
    });



    socket.on("disconnect", async () => {
        const userObj = connectedUsers.get(socket.id);
        connectedUsers.delete(socket.id);
        emitPresence();

        if (userObj && userObj.role !== "guest") {
            const hasOtherConnections = Array.from(connectedUsers.values()).some(u => u.username === userObj.username);
            if (!hasOtherConnections) {
                try {
                    await User.findOneAndUpdate(
                        { username: userObj.username },
                        { lastSeen: new Date(), status: "Offline" }
                    );
                } catch (err) {
                    console.error("Error setting user offline status on disconnect:", err);
                }
            }
        }

        // Explicitly leave all private rooms the user belongs to on disconnect
        if (socket.userId && socket.role === "user") {
            try {
                const customRooms = await Room.find({ members: socket.userId });
                customRooms.forEach(room => {
                    socket.leave(room._id.toString());
                });
            } catch (err) {
                console.error("Error leaving custom rooms on disconnect:", err);
            }
        }

        console.log("Disconnected:", socket.id);
    });

});

// Catch-all route to serve the built React application (SPA)
app.get("*all", (req, res) => {
    if (!req.path.startsWith("/api")) {
        res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
    }
});

const { spawn } = require("child_process");
let pythonProcess = null;

function startPythonASR() {
    if ((process.env.TRANSCRIPTION_MODE || "local") !== "server") return;

    console.log("[Node Server] Spawning Python ASR service...");
    const pythonExec = "C:\\Users\\Raulji Siddharthsinh\\AppData\\Local\\Programs\\Python\\Python311\\python.exe";
    const scriptPath = path.join(__dirname, "transcription_server.py");

    const pathDelimiter = process.platform === "win32" ? ";" : ":";
    const customEnv = {
        ...process.env,
        PATH: `${__dirname}${pathDelimiter}${process.env.PATH || ""}`
    };

    pythonProcess = spawn(pythonExec, [scriptPath], {
        cwd: __dirname,
        env: customEnv
    });

    pythonProcess.stdout.on("data", (data) => {
        console.log(`[Python ASR stdout]: ${data}`);
    });

    pythonProcess.stderr.on("data", (data) => {
        console.error(`[Python ASR stderr]: ${data}`);
    });

    pythonProcess.on("close", (code) => {
        console.log(`[Python ASR Process] exited with code ${code}`);
    });
}

const cleanUpProcess = () => {
    if (pythonProcess) {
        console.log("[Node Server] Stopping Python ASR process...");
        pythonProcess.kill();
    }
};

process.on("exit", cleanUpProcess);
process.on("SIGINT", () => {
    cleanUpProcess();
    process.exit();
});
process.on("SIGTERM", () => {
    cleanUpProcess();
    process.exit();
});

server.listen(5000, () => {
    console.log("Server started on port 5000");
    startPythonASR(); // Auto-spawn Python speech recognition microservice if enabled ASR
});
