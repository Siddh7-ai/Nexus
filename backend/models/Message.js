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
    text: {
        type: String,
        required: true
    },
    room: {
        type: String,
        default: "General chat"
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
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Message", messageSchema);