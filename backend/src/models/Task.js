const mongoose = require("mongoose");

const TaskSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: ""
    },
    type: {
        type: String,
        enum: ["task", "issue"],
        default: "task"
    },
    visibility: {
        type: String,
        enum: ["private", "room", "nextask"],
        default: "nextask"
    },
    created_from: {
        chat_id: {
            type: String,
            default: null
        },
        message_id: {
            type: String,
            default: null
        },
        sender_id: {
            type: String,
            default: null
        }
    },
    start_date: {
        type: Date,
        default: null
    },
    due_date: {
        type: Date,
        default: null
    },
    assignee_id: {
        type: String,
        required: false,
        default: "",
        trim: true
    },
    assignees: {
        type: [String],
        default: []
    },
    encryptedPayload: {
        nonce: { type: String, default: null },
        ciphertext: { type: String, default: null }
    },
    priority: {
        type: String,
        enum: ["low", "medium", "high", "critical"],
        default: "medium"
    },
    status: {
        type: String,
        enum: ["open", "in_progress", "completed", "investigating", "resolved"],
        default: "open"
    },
    severity: {
        type: String,
        enum: ["low", "medium", "high", "critical"],
        default: "medium"
    },
    reported_by: {
        type: String,
        default: null
    },
    created_by: {
        type: String,
        required: true,
        trim: true
    },
    room_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Room",
        default: null
    },
    checklist: [{
        text: { type: String, required: true },
        completed: { type: Boolean, default: false }
    }]
}, { timestamps: true });

// Production-Grade Indexes to optimize Kanban boards and dashboard retrievals
TaskSchema.index({ room_id: 1, status: 1 });
TaskSchema.index({ assignee_id: 1, status: 1 });
TaskSchema.index({ created_by: 1 });

module.exports = mongoose.model("Task", TaskSchema);
