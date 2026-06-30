const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    avatar: {
        type: String,
        default: ""
    },
    displayName: {
        type: String,
        default: ""
    },
    bio: {
        type: String,
        maxlength: 50,
        default: ""
    },
    status: {
        type: String,
        enum: ["Online", "Away", "Busy", "Offline"],
        default: "Online"
    },
    lastSeen: {
        type: Date,
        default: Date.now
    },
    privacyLastSeen: {
        type: String,
        enum: ["Everyone", "Friends", "Nobody"],
        default: "Everyone"
    },
    privacyAvatar: {
        type: String,
        enum: ["Everyone", "Friends", "Nobody"],
        default: "Everyone"
    },
    privacyPrivateMessages: {
        type: String,
        enum: ["Everyone", "Friends", "Nobody"],
        default: "Everyone"
    },
    friends: {
        type: [String],
        default: []
    },
    blockedUsers: {
        type: [String],
        default: []
    },
    deletedSystemRooms: {
        type: [String],
        default: []
    },
    totalMessagesSent: {
        type: Number,
        default: 0
    },
    identityPublicKey: {
        type: String,
        default: null
    },
    signedPrekey: {
        publicKey: { type: String, default: null },
        signature: { type: String, default: null },
        createdAt: { type: Date, default: null }
    },
    oneTimePrekeys: {
        type: [{
            keyId: { type: String, required: true },
            publicKey: { type: String, required: true }
        }],
        default: []
    },
    encryptedIdentityPrivateKey: {
        nonce: { type: String, default: null },
        ciphertext: { type: String, default: null }
    },
    encryptedSignedPrekeyPrivateKey: {
        nonce: { type: String, default: null },
        ciphertext: { type: String, default: null }
    },
    encryptedOneTimePrekeys: {
        nonce: { type: String, default: null },
        ciphertext: { type: String, default: null }
    },
    encryptedSessions: {
        type: [{
            chatId: { type: String, required: true },
            nonce: { type: String, required: true },
            ciphertext: { type: String, required: true }
        }],
        default: []
    }
}, { timestamps: true });

module.exports = mongoose.model(
    "User",
    userSchema
);