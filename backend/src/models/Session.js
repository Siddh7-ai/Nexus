const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    token: {
        type: String,
        required: true,
        index: true
    },
    familyId: {
        type: String,
        required: true,
        index: true
    },
    isRevoked: {
        type: Boolean,
        default: false
    },
    ip: {
        type: String,
        default: ""
    },
    userAgent: {
        type: String,
        default: ""
    },
    deviceInfo: {
        type: String,
        default: ""
    },
    mfaVerified: {
        type: Boolean,
        default: false
    },
    expiresAt: {
        type: Date,
        required: true
    }
}, { timestamps: true });

// Production-Grade TTL Index to automatically prune expired sessions
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Session", sessionSchema);
