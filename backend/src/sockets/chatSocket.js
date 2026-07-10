const mongoose = require("mongoose");
const Message = require("../models/Message");
const ClearedChat = require("../models/ClearedChat");
const Room = require("../models/Room");
const VaultItem = require("../models/VaultItem");
const VaultPin = require("../models/VaultPin");
const StickerPack = require("../models/StickerPack");
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const { canAccessRoom } = require("../permissions");
const logger = require("../utils/logger");

const JWT_SECRET = process.env.JWT_SECRET || "mysecretkey";

function initSockets(io) {
const STICKER_HEX_MAP = {
    funny: [
        "1f602", "1f923", "1f606", "1f61c", "1f61d", "1f92a", "1f921", "1f917", "1f92d", "1f92f",
        "1f60f", "1f60e", "1f92c", "1f922", "1f92e", "1f92b", "1f920", "1f61b", "1f601", "1f60a"
    ],
    love: [
        "1f970", "1f60d", "1f618", "1f496", "1f49d", "1f49e", "1f49f", "1f48b", "1f495", "1f493",
        "1f494", "1f49c", "1f49a", "1f49b", "1f9e1", "1f90e", "1f5a4", "1f90f", "1f48d", "1f498"
    ],
    celebrate: [
        "1f389", "1f38a", "1f382", "1f3c6", "1f3c5", "1f388", "1f381", "1f973", "1f525", "1f387",
        "1f386", "1f514", "1f4d6", "1f4e3", "1f4e2", "1f51e", "1f4bb", "1f4c8", "1f4b0", "1f385"
    ],
    mood: [
        "1f620", "1f621", "1f624", "1f62d", "1f622", "1f62a", "1f634", "1f927", "1f97a", "1f631",
        "1f628", "1f627", "1f625", "1f612", "1f614", "1f61e", "1f62f", "1f62b", "1f629", "1f976"
    ],
    thanks: [
        "1f64f", "1f44d", "1f44c", "1f44f", "1f4aa", "1f91d", "1f44e", "1f446", "1f447", "1f918",
        "1f596", "1f590", "1f595", "1f91f", "1f44b"
    ],
    greetings: [
        "1f44b", "1f600", "1f604", "1f609", "1f607", "1f31e", "1f31c", "1f305", "1f307", "1f4ac",
        "1f441", "1f47d", "1f47e", "1f480", "1f916"
    ],
    animals: [
        "1f436", "1f431", "1f98a", "1f43b", "1f438", "1f43c", "1f428", "1f42f", "1f435", "1f414",
        "1f41f", "1f419", "1f41d", "1f40c", "1f40e", "1f410", "1f411", "1f404", "1f412", "1f407"
    ],
    aesthetic: [
        "2728", "2b50", "1f308", "1f319", "1f49f", "1f380", "1f338", "1f33f", "1f340", "1f341",
        "1f302", "1f30a", "1f324", "1f327", "1f32a"
    ]
};

async function seedSystemStickers() {
    const packsData = [
        { packId: 'funny', name: 'Funny', emoji: '😂', isSystem: true, stickersCount: 20 },
        { packId: 'love', name: 'Love', emoji: '❤️', isSystem: true, stickersCount: 20 },
        { packId: 'celebrate', name: 'Celebrate', emoji: '🎉', isSystem: true, stickersCount: 20 },
        { packId: 'mood', name: 'Mood', emoji: '😤', isSystem: true, stickersCount: 20 },
        { packId: 'thanks', name: 'Thanks', emoji: '🙏', isSystem: true, stickersCount: 15 },
        { packId: 'greetings', name: 'Greetings', emoji: '👋', isSystem: true, stickersCount: 15 },
        { packId: 'animals', name: 'Animals', emoji: '🐶', isSystem: true, stickersCount: 20 },
        { packId: 'aesthetic', name: 'Aesthetic', emoji: '✨', isSystem: true, stickersCount: 15 }
    ];

    try {
        for (const data of packsData) {
            const stickers = [];
            const hexes = STICKER_HEX_MAP[data.packId] || [];
            for (let i = 1; i <= data.stickersCount; i++) {
                const hex = hexes[i - 1] || "1f600";
                stickers.push({
                    stickerId: `${data.packId}_sticker_${i}`,
                    url: `https://fonts.gstatic.com/s/e/notoemoji/latest/${hex}/512.webp`,
                    order: i
                });
            }

            await StickerPack.findOneAndUpdate(
                { packId: data.packId },
                {
                    packId: data.packId,
                    name: data.name,
                    emoji: data.emoji,
                    isSystem: true,
                    stickers
                },
                { upsert: true, new: true }
            );
        }
        console.log("System sticker packs seeded successfully with Google Noto Emoji CDN.");
    } catch (err) {
        console.error("Error seeding system sticker packs:", err);
    }
}

// Trigger sticker seeding when socket server initializes
seedSystemStickers();

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
    const token = socket.handshake?.auth?.token;
    if (!token) {
        return next(new Error("Authentication required"));
    }

    try {
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
        const logger = require("../utils/logger");
        logger.error(`[JWT Verify Error] chatSocket: ${err.message}. Token: ${token}`);
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

                // Passive unpin of expired messages in room
                try {
                    const now = new Date();
                    const expiredQuery = {
                        room: uniqueRoomId,
                        privateChatId: null,
                        isPinned: true,
                        pinnedUntil: { $lte: now }
                    };
                    const expired = await Message.find(expiredQuery);
                    for (const m of expired) {
                        m.isPinned = false;
                        m.pinnedUntil = null;
                        await m.save();
                        io.to(uniqueRoomId).emit("messageUpdated", m);
                    }
                } catch (expErr) {
                    console.error("Error clearing expired pins on room join:", expErr);
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

                // Passive unpin of expired messages in room
                try {
                    const now = new Date();
                    const expiredQuery = {
                        room,
                        privateChatId: null,
                        isPinned: true,
                        pinnedUntil: { $lte: now }
                    };
                    const expired = await Message.find(expiredQuery);
                    for (const m of expired) {
                        m.isPinned = false;
                        m.pinnedUntil = null;
                        await m.save();
                        io.to(room).emit("messageUpdated", m);
                    }
                } catch (expErr) {
                    console.error("Error clearing expired pins on room join:", expErr);
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

        // Passive unpin of expired messages in private chat
        try {
            const now = new Date();
            const expiredQuery = {
                privateChatId,
                isPinned: true,
                pinnedUntil: { $lte: now }
            };
            const expired = await Message.find(expiredQuery);
            for (const m of expired) {
                m.isPinned = false;
                m.pinnedUntil = null;
                await m.save();
                io.to(`private_${privateChatId}`).emit("messageUpdated", m);
            }
        } catch (expErr) {
            console.error("Error clearing expired pins on private chat join:", expErr);
        }

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
        
        const parts = privateChatId.split("_");
        parts.forEach(p => {
            if (p.toLowerCase() !== socket.username.toLowerCase()) {
                io.to(`user_${p.toLowerCase()}`).emit("sessionResetRequested", { privateChatId });
            }
        });
    });

    socket.on("requestSessionResetAndResend", ({ messageId, privateChatId }) => {
        if (!privateChatId || !messageId) return;
        socket.to(`private_${privateChatId}`).emit("sessionResetAndResendRequested", { messageId, privateChatId });

        const parts = privateChatId.split("_");
        parts.forEach(p => {
            if (p.toLowerCase() !== socket.username.toLowerCase()) {
                io.to(`user_${p.toLowerCase()}`).emit("sessionResetAndResendRequested", { messageId, privateChatId });
            }
        });
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
                replyTo: data.replyTo || null,
                sticker: data.sticker || null
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

            // Auto-complete task if emoji is ✅ and reactor has access
            if (emoji === "✅") {
                try {
                    const Task = require("./models/Task");
                    const linkedTasks = await Task.find({ "created_from.message_id": messageId });
                    for (const t of linkedTasks) {
                        let isAuthorized = false;
                        if (t.room_id) {
                            const Room = require("./models/Room");
                            const room = await Room.findById(t.room_id);
                            if (room) {
                                const isMember = room.admin.toString() === socket.userId ||
                                                 room.members.some(mId => mId.toString() === socket.userId);
                                if (isMember) {
                                    const isRoomAdmin = room.admin.toString() === socket.userId;
                                    const isCreatorOrAssignee = (t.created_by.toLowerCase() === socket.username.toLowerCase() || 
                                                                 t.assignee_id.toLowerCase() === socket.username.toLowerCase());
                                    if (isRoomAdmin || isCreatorOrAssignee) {
                                        isAuthorized = true;
                                    }
                                }
                            }
                        } else {
                            isAuthorized = (t.created_by.toLowerCase() === socket.username.toLowerCase() || 
                                            t.assignee_id.toLowerCase() === socket.username.toLowerCase());
                        }

                        if (isAuthorized) {
                            t.status = t.type === "issue" ? "resolved" : "completed";
                            await t.save();
                            // Notify clients of task update
                            io.emit("taskUpdated", t);
                        }
                    }
                } catch (taskErr) {
                    console.error("Error auto-completing task on reaction:", taskErr);
                }
            }

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

    // Pin message
    socket.on("pinMessage", async ({ messageId, duration }) => {
        try {
            const msg = await Message.findById(messageId);
            if (!msg) return;

            // Block guests from pinning messages outside Nexus Official
            if (socket.role === "guest" && msg.room !== "Nexus Official") {
                return;
            }

            const room = msg.privateChatId
                ? `private_${msg.privateChatId}`
                : msg.room;

            // Find how many messages are currently pinned in this room/chat
            const pinnedQuery = msg.privateChatId
                ? { privateChatId: msg.privateChatId, isPinned: true }
                : { room: msg.room, privateChatId: null, isPinned: true };

            const currentlyPinned = await Message.find(pinnedQuery).sort({ pinnedAt: 1 });

            // If we already have 5 pinned messages, unpin the oldest one
            if (currentlyPinned.length >= 5) {
                const oldest = currentlyPinned[0];
                oldest.isPinned = false;
                oldest.pinnedUntil = null;
                await oldest.save();
                io.to(room).emit("messageUpdated", oldest);
            }

            // Calculate pinnedUntil
            let durationMs = 7 * 24 * 60 * 60 * 1000; // default 7 days
            if (duration === "24h") durationMs = 24 * 60 * 60 * 1000;
            else if (duration === "7d") durationMs = 7 * 24 * 60 * 60 * 1000;
            else if (duration === "30d") durationMs = 30 * 24 * 60 * 60 * 1000;

            msg.isPinned = true;
            msg.pinnedAt = new Date();
            msg.pinnedUntil = new Date(Date.now() + durationMs);
            await msg.save();

            // Emit update to all clients
            io.to(room).emit("messageUpdated", msg);

            // Create a system message notifying the pin
            const systemMsgData = {
                username: "System",
                displayName: "System",
                text: `${socket.displayName || socket.username} pinned a message`,
                createdAt: new Date()
            };

            if (msg.privateChatId) {
                systemMsgData.privateChatId = msg.privateChatId;
                systemMsgData.room = null;
            } else {
                systemMsgData.room = msg.room;
                systemMsgData.privateChatId = null;
            }

            const savedSystemMsg = await Message.create(systemMsgData);

            if (msg.privateChatId) {
                io.to(`private_${msg.privateChatId}`).emit("reply", savedSystemMsg);

                // Also notify recipient if online
                const parts = msg.privateChatId.split("_");
                const recipient = parts.find(u => u !== socket.username.toLowerCase());
                if (recipient) {
                    io.to(`user_${recipient.toLowerCase()}`).emit("reply", savedSystemMsg);
                }
            } else {
                const clientMsg = savedSystemMsg.toObject();
                clientMsg.room = msg.room;
                io.to(room).emit("reply", clientMsg);
            }

        } catch (err) {
            console.error("Error pinning message:", err);
        }
    });

    // Unpin message
    socket.on("unpinMessage", async ({ messageId }) => {
        try {
            const msg = await Message.findById(messageId);
            if (!msg) return;

            // Block guests from unpinning messages outside Nexus Official
            if (socket.role === "guest" && msg.room !== "Nexus Official") {
                return;
            }

            msg.isPinned = false;
            msg.pinnedUntil = null;
            await msg.save();

            const room = msg.privateChatId
                ? `private_${msg.privateChatId}`
                : msg.room;
            io.to(room).emit("messageUpdated", msg);

        } catch (err) {
            console.error("Error unpinning message:", err);
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

            // Pull the leaving member first
            await Room.findByIdAndUpdate(room._id, { $pull: { members: userId } });
            socket.leave(uniqueRoomId);
            console.log(`User ${username} left room: ${realRoomName}`);

            // Fetch updated room
            let updatedRoom = await Room.findById(room._id);
            if (!updatedRoom || updatedRoom.members.length === 0) {
                // No members left, delete room and its tasks
                await Room.findByIdAndDelete(room._id);
                const Task = require("./models/Task");
                await Task.deleteMany({ room_id: room._id });
                console.log(`Room ${realRoomName} deleted because it has zero members.`);
                io.to(uniqueRoomId).emit("roomDeleted", { roomName: realRoomName });
            } else {
                // There are members left
                if (room.admin.toString() === userId.toString()) {
                    // Admin left without transferring. Promote oldest member
                    const oldestMemberId = updatedRoom.members[0];
                    updatedRoom.admin = oldestMemberId;
                    await updatedRoom.save();
                    console.log(`Admin left room ${realRoomName}. Promoted oldest member ${oldestMemberId} to admin.`);
                }

                // Populate and emit updates
                const populatedRoom = await Room.findById(updatedRoom._id)
                    .populate("admin", "username displayName avatar")
                    .populate("members", "username displayName avatar _id status");
                io.to(uniqueRoomId).emit("roomMemberUpdate", populatedRoom);
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

    socket.on("transferRoomAdmin", async ({ roomName, newAdminUsername }) => {
        if (!userGuard(socket)) return;
        try {
            const userId = socket.request.user.id;
            
            let room = null;
            if (mongoose.Types.ObjectId.isValid(roomName)) {
                room = await Room.findById(roomName);
            } else {
                room = await Room.findOne({ name: roomName });
            }

            if (!room) {
                socket.emit("error", { message: "Room not found." });
                return;
            }

            if (room.admin.toString() !== userId.toString()) {
                socket.emit("error", { message: "Unauthorized. Only room admin can transfer ownership." });
                return;
            }

            const newAdminUser = await User.findOne({ username: newAdminUsername });
            if (!newAdminUser) {
                socket.emit("error", { message: "New admin user not found." });
                return;
            }

            const isMember = room.members.some(mId => mId.toString() === newAdminUser._id.toString());
            if (!isMember) {
                socket.emit("error", { message: "New admin must be a member of the room." });
                return;
            }

            room.admin = newAdminUser._id;
            await room.save();

            const updatedRoom = await Room.findById(room._id)
                .populate("admin", "username displayName avatar")
                .populate("members", "username displayName avatar _id status");
            io.to(room._id.toString()).emit("roomMemberUpdate", updatedRoom);
            
            const roomsList = await Room.find({ members: userId })
                .sort({ createdAt: -1 })
                .populate("admin", "username");
            socket.emit("customRoomsList", roomsList);
        } catch (err) {
            console.error("Error transferring room admin:", err);
            socket.emit("error", { message: "Failed to transfer room admin." });
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
            // Cascade delete room tasks
            const Task = require("./models/Task");
            await Task.deleteMany({ room_id: room._id });
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

}

module.exports = { initSockets };
