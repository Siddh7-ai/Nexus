const mongoose = require("mongoose");

const vaultPinSchema = new mongoose.Schema({
    pinId: {
        type: String,
        required: true,
        unique: true
    },
    salt: {
        type: String,
        required: true
    },
    encryptedVaultKey: {
        type: {
            nonce: { type: String, required: true },
            ciphertext: { type: String, required: true }
        },
        required: true
    },
    pinType: {
        type: String,
        required: true
    },
    pinHash: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("VaultPin", vaultPinSchema);
