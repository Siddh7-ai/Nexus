const mongoose = require("mongoose");

const stickerPackSchema = new mongoose.Schema({
    packId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    emoji: { type: String, required: true },
    stickers: [{
        stickerId: { type: String, required: true },
        url: { type: String, required: true },
        order: { type: Number, required: true }
    }],
    isSystem: { type: Boolean, default: false },
    createdBy: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model("StickerPack", stickerPackSchema);
