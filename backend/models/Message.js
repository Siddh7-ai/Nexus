const mongoose = require("mongoose");

const reactionSchema = new mongoose.Schema({
    emoji: { type: String, required: true },
    username: { type: String, required: true }
}, { _id: false });

const messageSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true
    },
    tempId: {
        type: String,
        default: null
    },
    text: {
        type: String,
        default: ""
    },
    room: {
        type: String,
        default: "Nexus Official"
    },
    // For private messages: "userId1_userId2" (sorted)
    privateChatId: {
        type: String,
        default: null
    },
    reactions: {
        type: [reactionSchema],
        default: []
    },
    seenBy: {
        type: [String],
        default: []
    },
    isEdited: {
        type: Boolean,
        default: false
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    isGuest: {
        type: Boolean,
        default: false
    },
    avatar: {
        type: String,
        default: ""
    },
    displayName: {
        type: String,
        default: ""
    },
    // Usernames who deleted for themselves
    deletedFor: {
        type: [String],
        default: []
    },
    // Attachment details
    fileUrl: {
        type: String,
        default: null
    },
    fileName: {
        type: String,
        default: null
    },
    fileSize: {
        type: Number,
        default: null
    },
    fileType: {
        type: String,
        default: null
    },
    fileQuality: {
        type: String, // "HD" or "Normal"
        default: null
    },
    ratchetHeader: {
        type: {
            publicKey: { type: String, required: true },
            messageNumber: { type: Number, required: true },
            numberOfMessagesInPreviousSendingChain: { type: Number, required: true }
        },
        default: null
    },
    handshakePayload: {
        type: {
            aliceIdentityPublicKey: { type: String, required: true },
            aliceEphemeralPublicKey: { type: String, required: true },
            oneTimePrekeyId: { type: String, default: null }
        },
        default: null
    },
    senderCiphertext: {
        type: {
            nonce: { type: String },
            ciphertext: { type: String }
        },
        default: null
    },
    receiverCiphertext: {
        type: {
            nonce: { type: String },
            ciphertext: { type: String }
        },
        default: null
    },
    replyTo: {
        type: {
            messageId: { type: String, default: null },
            text: { type: String, default: "" },
            username: { type: String, default: "" }
        },
        default: null
    },
    isLocked: {
        type: Boolean,
        default: false
    },
    lockedItemId: {
        type: String,
        default: null
    },
    lockedBy: {
        type: String,
        default: null
    },
    lockedAt: {
        type: Date,
        default: null
    },
    voiceMessage: {
        type: {
            duration: { type: Number, default: 0 },
            waveform: { type: [Number], default: [] },
            hasTranscript: { type: Boolean, default: false },
            transcriptLanguage: { type: String, default: null }
        },
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Message", messageSchema);