const mongoose = require("mongoose");

const clearedChatSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true
    },
    chatId: {
        type: String,
        required: true
    },
    clearedAt: {
        type: Date,
        default: Date.now
    }
});

// Compound unique index to prevent duplicate entries and optimize queries
clearedChatSchema.index({ username: 1, chatId: 1 }, { unique: true });

module.exports = mongoose.model("ClearedChat", clearedChatSchema);
