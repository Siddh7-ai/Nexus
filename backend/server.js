const mongoose = require("mongoose");
const Message = require("./models/Message");
const ClearedChat = require("./models/ClearedChat");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const { canAccessRoom } = require("./permissions");

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "mysecretkey";
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + "-" + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

app.use(express.json({ limit: "10mb" }));
app.use(cors());
app.use("/uploads", express.static(uploadsDir));
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);

// Upload endpoint
app.post("/api/upload", upload.single("file"), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }
        const fileUrl = `/uploads/${req.file.filename}`;
        res.json({
            fileUrl,
            fileName: req.file.originalname,
            fileSize: req.file.size,
            fileType: req.file.mimetype
        });
    } catch (err) {
        console.error("Upload error:", err);
        res.status(500).json({ error: "Failed to upload file" });
    }
});

// Serve frontend built assets
app.use(express.static(path.join(__dirname, "../frontend/dist")));

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

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
        const users = await User.find({}, { username: 1, _id: 1 });
        res.json(users);
    } catch (err) {
        res.status(401).json({ message: "Unauthorized" });
    }
});

const ROOMS = ["General chat", "Project chat", "Study chat"];

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
            return next();
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        socket.username = decoded.username;
        socket.userId = decoded.userId;
        socket.role = "user";
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

    // Calculate and emit initial unread counts
    (async () => {
        if (!socket.username) return;
        try {
            const unreadCounts = {};
            const unreadMessages = await Message.find({
                username: { $ne: socket.username },
                seenBy: { $ne: socket.username },
                deletedFor: { $ne: socket.username }
            });

            for (const msg of unreadMessages) {
                const chatKey = msg.privateChatId || msg.room;
                if (!chatKey) continue;
                const clearedAt = await getChatClearedAt(socket.username, chatKey);
                if (clearedAt && msg.createdAt <= clearedAt) {
                    continue;
                }
                unreadCounts[chatKey] = (unreadCounts[chatKey] || 0) + 1;
            }
            socket.emit("unreadCounts", unreadCounts);
        } catch (err) {
            console.error("Error calculating unread counts on connection:", err);
        }
    })();



    // Join a chat room
    socket.on("joinRoom", async (room) => {
        if (!canAccessRoom(socket.role, room)) {
            socket.emit("error", { message: "Access denied. Login required." });
            return;
        }

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

        io.to(room).emit("reply", {
            username: "System",
            text: `${socket.username} joined #${room}`,
            room
        });
    });

    // Join private chat
    socket.on("joinPrivateChat", async ({ otherUsername }) => {
        if (socket.role === "guest") {
            socket.emit("error", { message: "Access denied. Login required." });
            return;
        }

        const users = [socket.username.toLowerCase(), otherUsername.toLowerCase()].sort();
        const privateChatId = users.join("_");

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
            { $push: { seenBy: socket.username } }
        );
        // Notify sender their messages were seen
        const updatedMsgs = await Message.find({ privateChatId }).sort({ createdAt: 1 });
        io.to(`private_${privateChatId}`).emit("messagesSeenUpdate", updatedMsgs);
    });

    // Typing
    socket.on("typing", ({ room, privateChatId }) => {
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
            const targetRoom = room || "General chat";
            if (!canAccessRoom(socket.role, targetRoom)) return;
            socket.to(targetRoom).emit("typing", {
                username: socket.username,
                role: socket.role,
                displayName: socket.displayName || socket.username,
                avatar: socket.avatar || "",
                room: targetRoom,
                privateChatId: null
            });
        }
    });

    // Stop Typing
    socket.on("stopTyping", ({ room, privateChatId }) => {
        if (privateChatId) {
            if (socket.role === "guest") return;
            socket.to(`private_${privateChatId}`).emit("stopTyping", {
                username: socket.username,
                room: null,
                privateChatId
            });
        } else {
            const targetRoom = room || "General chat";
            socket.to(targetRoom).emit("stopTyping", {
                username: socket.username,
                room: targetRoom,
                privateChatId: null
            });
        }
    });

    // Send message (room or private)
    socket.on("message", async (data) => {
        try {
            if (data.privateChatId) {
                if (socket.role === "guest") {
                    socket.emit("error", { message: "Access denied. Login required." });
                    return;
                }
            } else {
                const room = data.room || "General chat";
                if (!canAccessRoom(socket.role, room)) {
                    socket.emit("error", { message: "Access denied. Login required." });
                    return;
                }
            }

            const targetRoomName = data.privateChatId
                ? `private_${data.privateChatId}`
                : (data.room || "General chat");

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
                text: data.text,
                isGuest: socket.role === "guest",
                seenBy: activeUsernames,
                avatar: socket.avatar || "",
                displayName: socket.displayName || socket.username,
                fileUrl: data.fileUrl || null,
                fileName: data.fileName || null,
                fileSize: data.fileSize || null,
                fileType: data.fileType || null,
                fileQuality: data.fileQuality || null
            };

            if (data.privateChatId) {
                msgData.privateChatId = data.privateChatId;
                msgData.room = null;
            } else {
                msgData.room = data.room || "General chat";
                msgData.privateChatId = null;
            }

            const savedMessage = await Message.create(msgData);

            if (data.privateChatId) {
                io.to(`private_${data.privateChatId}`).emit("reply", savedMessage);

                // Also notify the recipient if they are online (so their sidebar gets updated with unread count)
                const parts = data.privateChatId.split("_");
                const recipient = parts.find(u => u !== socket.username.toLowerCase());
                if (recipient) {
                    io.to(`user_${recipient.toLowerCase()}`).emit("reply", savedMessage);
                }
            } else {
                io.to(msgData.room).emit("reply", savedMessage);
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
                { $addToSet: { seenBy: socket.username } },
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

            // Block guests from editing message outside General chat
            if (socket.role === "guest" && msg.room !== "General chat") {
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
    socket.on("deleteMessage", async ({ messageId, deleteFor }) => {
        try {
            const msg = await Message.findById(messageId);
            if (!msg) return;

            // Block guests from deleting message outside General chat
            if (socket.role === "guest" && msg.room !== "General chat") {
                return;
            }

            if (deleteFor === "everyone" && msg.username?.toLowerCase() === socket.username?.toLowerCase()) {
                msg.isDeleted = true;
                msg.text = "This message was deleted";
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

    // Clear chat only for current user
    socket.on("clearChat", async ({ chatId }) => {
        try {
            if (!socket.username || !chatId) return;

            await ClearedChat.findOneAndUpdate(
                { username: socket.username, chatId },
                { clearedAt: new Date() },
                { upsert: true, new: true }
            );

            const isPrivate = chatId.includes("_");
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

        if (socket.username) {
            io.emit("reply", {
                username: "System",
                text: `${socket.username} left the chat`,
                room: "General chat"
            });
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

server.listen(5000, () => {
    console.log("Server started on port 5000");
});
