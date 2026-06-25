const mongoose = require("mongoose");

const vaultItemSchema = new mongoose.Schema({
    privateChatId: {
        type: String,
        required: true
    },
    uploadedBy: {
        type: String,
        required: true
    },
    itemType: {
        type: String,
        enum: ["text", "file"],
        required: true
    },
    encryptedData: {
        type: {
            nonce: { type: String, required: true },
            ciphertext: { type: String, required: true }
        },
        required: true
    },
    fileRef: {
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
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("VaultItem", vaultItemSchema);
