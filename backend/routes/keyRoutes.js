const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "mysecretkey";

// Auth Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "No token provided" });
    const token = authHeader.split(" ")[1];

    if (token.startsWith("guest:")) {
        req.user = {
            username: token.split(":")[1],
            isGuest: true
        };
        return next();
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = {
            userId: decoded.userId,
            username: decoded.username,
            isGuest: false
        };
        next();
    } catch (err) {
        return res.status(403).json({ message: "Invalid or expired token" });
    }
}

// 1. Upload prekey bundle (initial setup or new device)
router.post("/upload", authenticateToken, async (req, res) => {
    try {
        if (req.user.isGuest) {
            return res.status(403).json({ message: "Guests cannot configure cryptographic keys" });
        }

        const { identityPublicKey, signedPrekey, oneTimePrekeys } = req.body;
        if (!identityPublicKey || !signedPrekey || !Array.isArray(oneTimePrekeys)) {
            return res.status(400).json({ message: "Missing required key fields" });
        }

        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        user.identityPublicKey = identityPublicKey;
        user.signedPrekey = {
            publicKey: signedPrekey.publicKey,
            signature: signedPrekey.signature,
            createdAt: new Date()
        };
        user.oneTimePrekeys = oneTimePrekeys.map(k => ({
            keyId: k.keyId,
            publicKey: k.publicKey
        }));

        await user.save();
        res.status(200).json({ message: "Prekey bundle uploaded successfully" });
    } catch (error) {
        console.error("Error uploading prekey bundle:", error);
        res.status(500).json({ message: "Server error" });
    }
});

// 2. Fetch prekey bundle for a target user and consume a one-time prekey
router.get("/bundle/:username", authenticateToken, async (req, res) => {
    try {
        const { username } = req.params;
        const targetUser = await User.findOne({
            username: { $regex: new RegExp(`^${username}$`, "i") }
        });

        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }

        if (!targetUser.identityPublicKey) {
            return res.status(400).json({ message: "User has not set up E2EE keys" });
        }

        // Consume one one-time prekey
        let oneTimePrekey = null;
        if (targetUser.oneTimePrekeys && targetUser.oneTimePrekeys.length > 0) {
            oneTimePrekey = targetUser.oneTimePrekeys.shift(); // Remove the first one
            await targetUser.save();
        }

        res.status(200).json({
            identityPublicKey: targetUser.identityPublicKey,
            signedPrekey: {
                publicKey: targetUser.signedPrekey.publicKey,
                signature: targetUser.signedPrekey.signature
            },
            oneTimePrekey: oneTimePrekey ? {
                keyId: oneTimePrekey.keyId,
                publicKey: oneTimePrekey.publicKey
            } : null
        });
    } catch (error) {
        console.error("Error fetching prekey bundle:", error);
        res.status(500).json({ message: "Server error" });
    }
});

// 3. Get key status (checks count of remaining one-time prekeys)
router.get("/status", authenticateToken, async (req, res) => {
    try {
        if (req.user.isGuest) {
            return res.status(200).json({ identityPublicKeyExists: false, oneTimePrekeysCount: 0 });
        }

        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({
            identityPublicKeyExists: !!user.identityPublicKey,
            oneTimePrekeysCount: user.oneTimePrekeys ? user.oneTimePrekeys.length : 0
        });
    } catch (error) {
        console.error("Error fetching key status:", error);
        res.status(500).json({ message: "Server error" });
    }
});

// 4. Replenish one-time prekeys
router.post("/replenish", authenticateToken, async (req, res) => {
    try {
        if (req.user.isGuest) {
            return res.status(403).json({ message: "Guests cannot configure cryptographic keys" });
        }

        const { oneTimePrekeys } = req.body;
        if (!Array.isArray(oneTimePrekeys)) {
            return res.status(400).json({ message: "Invalid oneTimePrekeys format" });
        }

        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Add the new keys, capping the total at 100 to prevent database bloat
        const currentKeys = user.oneTimePrekeys || [];
        const addedKeys = oneTimePrekeys.map(k => ({
            keyId: k.keyId,
            publicKey: k.publicKey
        }));

        const combined = [...currentKeys, ...addedKeys];
        user.oneTimePrekeys = combined.slice(0, 100);

        await user.save();
        res.status(200).json({
            message: "One-time prekeys replenished successfully",
            oneTimePrekeysCount: user.oneTimePrekeys.length
        });
    } catch (error) {
        console.error("Error replenishing one-time prekeys:", error);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;
