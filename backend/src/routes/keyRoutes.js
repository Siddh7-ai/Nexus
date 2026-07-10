const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "mysecretkey";

// Helper to save a user document with optimistic concurrency retries
async function saveUserWithRetry(userId, updateFn, maxRetries = 5) {
    let attempts = 0;
    while (attempts < maxRetries) {
        try {
            const user = await User.findById(userId);
            if (!user) {
                return null;
            }
            await updateFn(user);
            await user.save();
            return user;
        } catch (err) {
            if (err.name === "VersionError" && attempts < maxRetries - 1) {
                attempts++;
                // Add a small random delay to avoid stampeding herd effect
                await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 10));
            } else {
                throw err;
            }
        }
    }
}

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
        const logger = require("../utils/logger");
        logger.error(`[JWT Verify Error] keyRoutes: ${err.message}. Token: ${token}`);
        return res.status(403).json({ message: "Invalid or expired token" });
    }
}

// 1. Upload prekey bundle (initial setup or new device)
router.post("/upload", authenticateToken, async (req, res) => {
    try {
        if (req.user.isGuest) {
            return res.status(403).json({ message: "Guests cannot configure cryptographic keys" });
        }

        const { 
            identityPublicKey, 
            signedPrekey, 
            oneTimePrekeys,
            encryptedIdentityPrivateKey,
            encryptedSignedPrekeyPrivateKey,
            encryptedOneTimePrekeys
        } = req.body;
        if (!identityPublicKey || !signedPrekey || !Array.isArray(oneTimePrekeys)) {
            return res.status(400).json({ message: "Missing required key fields" });
        }

        const user = await saveUserWithRetry(req.user.userId, (u) => {
            u.identityPublicKey = identityPublicKey;
            u.signedPrekey = {
                publicKey: signedPrekey.publicKey,
                signature: signedPrekey.signature,
                createdAt: new Date()
            };
            u.oneTimePrekeys = oneTimePrekeys.map(k => ({
                keyId: k.keyId,
                publicKey: k.publicKey
            }));

            if (encryptedIdentityPrivateKey) {
                u.encryptedIdentityPrivateKey = encryptedIdentityPrivateKey;
            }
            if (encryptedSignedPrekeyPrivateKey) {
                u.encryptedSignedPrekeyPrivateKey = encryptedSignedPrekeyPrivateKey;
            }
            if (encryptedOneTimePrekeys) {
                u.encryptedOneTimePrekeys = encryptedOneTimePrekeys;
            }
        });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

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
            await saveUserWithRetry(targetUser._id, (u) => {
                if (u.oneTimePrekeys && u.oneTimePrekeys.length > 0) {
                    oneTimePrekey = u.oneTimePrekeys.shift();
                } else {
                    oneTimePrekey = null;
                }
            });
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
            identityPublicKey: user.identityPublicKey || null,
            signedPrekeyPublicKey: user.signedPrekey?.publicKey || null,
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

        const user = await saveUserWithRetry(req.user.userId, (u) => {
            // Add the new keys, capping the total at 100 to prevent database bloat
            const currentKeys = u.oneTimePrekeys || [];
            const addedKeys = oneTimePrekeys.map(k => ({
                keyId: k.keyId,
                publicKey: k.publicKey
            }));

            const combined = [...currentKeys, ...addedKeys];
            u.oneTimePrekeys = combined.slice(0, 100);
        });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({
            message: "One-time prekeys replenished successfully",
            oneTimePrekeysCount: user.oneTimePrekeys.length
        });
    } catch (error) {
        console.error("Error replenishing one-time prekeys:", error);
        res.status(500).json({ message: "Server error" });
    }
});


// 5. Get E2EE key and session backup
router.get("/backup", authenticateToken, async (req, res) => {
    try {
        if (req.user.isGuest) {
            return res.status(403).json({ message: "Guests cannot access backups" });
        }

        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({
            encryptedIdentityPrivateKey: user.encryptedIdentityPrivateKey,
            encryptedSignedPrekeyPrivateKey: user.encryptedSignedPrekeyPrivateKey,
            encryptedOneTimePrekeys: user.encryptedOneTimePrekeys,
            identityPublicKey: user.identityPublicKey,
            signedPrekey: user.signedPrekey,
            encryptedSessions: user.encryptedSessions || []
        });
    } catch (error) {
        console.error("Error fetching E2EE backup:", error);
        res.status(500).json({ message: "Server error" });
    }
});

// 6. Save/update encrypted Double Ratchet session state
router.post("/backup/session", authenticateToken, async (req, res) => {
    try {
        if (req.user.isGuest) {
            return res.status(403).json({ message: "Guests cannot back up sessions" });
        }

        const { chatId, nonce, ciphertext } = req.body;
        if (!chatId || !nonce || !ciphertext) {
            return res.status(400).json({ message: "Missing required backup fields" });
        }

        const user = await saveUserWithRetry(req.user.userId, (u) => {
            if (!u.encryptedSessions) {
                u.encryptedSessions = [];
            }

            // Find existing session or push new one
            const existingIdx = u.encryptedSessions.findIndex(s => s.chatId === chatId);
            if (existingIdx !== -1) {
                u.encryptedSessions[existingIdx] = { chatId, nonce, ciphertext };
            } else {
                u.encryptedSessions.push({ chatId, nonce, ciphertext });
            }
        });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({ message: "Session backed up successfully" });
    } catch (error) {
        console.error("Error backing up session:", error);
        res.status(500).json({ message: "Server error" });
    }
});

// 7. Delete an encrypted Double Ratchet session state
router.delete("/backup/session/:chatId", authenticateToken, async (req, res) => {
    try {
        if (req.user.isGuest) {
            return res.status(403).json({ message: "Guests cannot manage sessions" });
        }

        const { chatId } = req.params;
        if (!chatId) {
            return res.status(400).json({ message: "Missing chatId parameter" });
        }

        const user = await saveUserWithRetry(req.user.userId, (u) => {
            if (u.encryptedSessions) {
                u.encryptedSessions = u.encryptedSessions.filter(s => s.chatId !== chatId);
            }
        });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({ message: "Session backup deleted successfully" });
    } catch (error) {
        console.error("Error deleting session backup:", error);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;
