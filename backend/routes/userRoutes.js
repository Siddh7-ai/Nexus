const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Message = require("../models/Message");
const Report = require("../models/Report");
const ClearedChat = require("../models/ClearedChat");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "mysecretkey";

// Authentication Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "No token provided" });
    const token = authHeader.split(" ")[1];

    if (token.startsWith("guest:")) {
        // Guest user info extraction (read-only guest)
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
        return res.status(401).json({ message: "Invalid or expired token" });
    }
}

// 1. Get User Profile (supports guest viewing general details, respects privacy)
router.get("/profile/:username", authenticateToken, async (req, res) => {
    try {
        const { username } = req.params;
        const requester = req.user; // { username, isGuest, userId }

        const targetUser = await User.findOne({ username });
        if (!targetUser) {
            // Check if this is a guest user
            const isGuestMsg = await Message.findOne({ username, isGuest: true });
            if (isGuestMsg || username.startsWith("guest_") || (requester && requester.username === username)) {
                const msgCount = await Message.countDocuments({ username, isGuest: true });
                return res.json({
                    username,
                    displayName: username,
                    status: "Online",
                    isGuest: true,
                    bio: "Guest User",
                    totalMessagesSent: msgCount,
                    canDM: false,
                    avatar: "",
                    joinDate: isGuestMsg ? isGuestMsg.createdAt : new Date()
                });
            }
            return res.status(404).json({ message: "User not found" });
        }

        const isSelf = requester && !requester.isGuest && requester.username === targetUser.username;

        // Count messages sent
        const msgCount = await Message.countDocuments({ username: targetUser.username, isGuest: false });

        // Privacy details checks
        const isRequesterBlocked = targetUser.blockedUsers.includes(requester?.username);
        const amIBlockingRequester = requester && !requester.isGuest 
            ? (await User.findOne({ username: requester.username }))?.blockedUsers.includes(targetUser.username)
            : false;
        
        const isFriend = targetUser.friends.includes(requester?.username);

        // Prepare return payload based on privacy visibility
        const responseData = {
            _id: targetUser._id,
            username: targetUser.username,
            displayName: targetUser.displayName || targetUser.username,
            status: targetUser.status,
            joinDate: targetUser.createdAt,
            totalMessagesSent: msgCount,
            friendsCount: targetUser.friends ? targetUser.friends.length : 0,
            isSelf
        };

        // Determine if they can DM
        let canDM = !requester?.isGuest;
        if (targetUser.privacyPrivateMessages === "Nobody") canDM = false;
        if (targetUser.privacyPrivateMessages === "Friends" && !isFriend) canDM = false;
        if (isRequesterBlocked || amIBlockingRequester) canDM = false;
        responseData.canDM = canDM;

        // Add additional profile details based on privacy filters
        // Avatar Privacy
        let showAvatar = true;
        if (targetUser.privacyAvatar === "Nobody") showAvatar = false;
        if (targetUser.privacyAvatar === "Friends" && !isFriend) showAvatar = false;
        if (isRequesterBlocked) showAvatar = false; // Blocked users don't see avatar
        if (isSelf) showAvatar = true;

        responseData.avatar = showAvatar ? targetUser.avatar : "";

        // Bio Visibility (always public unless blocked)
        responseData.bio = isRequesterBlocked ? "" : targetUser.bio;

        // Last Seen Privacy
        let showLastSeen = true;
        if (targetUser.privacyLastSeen === "Nobody") showLastSeen = false;
        if (targetUser.privacyLastSeen === "Friends" && !isFriend) showLastSeen = false;
        if (isRequesterBlocked) showLastSeen = false;
        if (isSelf) showLastSeen = true;

        if (showLastSeen) {
            responseData.lastSeen = targetUser.lastSeen;
        }

        // Include privacy settings for own user so they can populate form
        if (isSelf) {
            responseData.email = targetUser.email;
            responseData.privacyLastSeen = targetUser.privacyLastSeen;
            responseData.privacyAvatar = targetUser.privacyAvatar;
            responseData.privacyPrivateMessages = targetUser.privacyPrivateMessages;
            responseData.blockedUsers = targetUser.blockedUsers;
            responseData.friends = targetUser.friends;
        } else {
            // Include block and friend status for the requester
            responseData.isBlocked = isRequesterBlocked;
            responseData.isFriend = isFriend;
        }

        res.json(responseData);
    } catch (err) {
        console.error("Error fetching profile:", err);
        res.status(500).json({ message: "Server error fetching profile" });
    }
});

// 2. Update User Profile (registered users only)
router.put("/profile", authenticateToken, async (req, res) => {
    try {
        if (req.user.isGuest) {
            return res.status(403).json({ message: "Access denied. Guests cannot edit profile." });
        }

        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const {
            displayName,
            bio,
            avatar,
            status,
            privacyLastSeen,
            privacyAvatar,
            privacyPrivateMessages,
            username
        } = req.body;

        // Update fields if provided
        if (displayName !== undefined) user.displayName = displayName;
        if (bio !== undefined) user.bio = bio.slice(0, 50); // limit to 50 characters
        if (avatar !== undefined) user.avatar = avatar;
        if (status !== undefined) user.status = status;
        if (privacyLastSeen !== undefined) user.privacyLastSeen = privacyLastSeen;
        if (privacyAvatar !== undefined) user.privacyAvatar = privacyAvatar;
        if (privacyPrivateMessages !== undefined) user.privacyPrivateMessages = privacyPrivateMessages;

        let newToken = null;
        if (username && username.trim() !== user.username) {
            const trimmedUsername = username.trim();
            
            // Validate username formatting
            const isInputValid = trimmedUsername.length >= 3 && 
                                 trimmedUsername.length <= 20 && 
                                 /^[A-Za-z0-9_]+$/.test(trimmedUsername);
            if (!isInputValid) {
                return res.status(400).json({ message: "Invalid username format. 3–20 alphanumeric characters." });
            }

            const BANNED_WORDS = ["admin", "system", "moderator", "guest", "banned", "support", "staff"];
            if (BANNED_WORDS.includes(trimmedUsername.toLowerCase())) {
                return res.status(400).json({ message: "This username is reserved or not allowed." });
            }

            // Uniqueness validation (exclude self)
            const existingUser = await User.findOne({ 
                username: { $regex: new RegExp(`^${trimmedUsername}$`, "i") },
                _id: { $ne: user._id }
            });
            if (existingUser) {
                return res.status(400).json({ message: "Username is already taken." });
            }

            const oldUsername = user.username;
            user.username = trimmedUsername;

            // Cascade update messages
            await Message.updateMany(
                { username: oldUsername },
                { username: trimmedUsername, avatar: user.avatar, displayName: user.displayName || trimmedUsername }
            );

            // Cascade update cleared chats
            await ClearedChat.updateMany(
                { username: oldUsername },
                { username: trimmedUsername }
            );

            // Update friends and blocked arrays
            await User.updateMany(
                { friends: oldUsername },
                { $set: { "friends.$[elem]": trimmedUsername } },
                { arrayFilters: [{ elem: oldUsername }] }
            );

            await User.updateMany(
                { blockedUsers: oldUsername },
                { $set: { "blockedUsers.$[elem]": trimmedUsername } },
                { arrayFilters: [{ elem: oldUsername }] }
            );

            // Generate new token
            newToken = jwt.sign(
                { userId: user._id, username: trimmedUsername },
                JWT_SECRET,
                { expiresIn: "1d" }
            );
        } else {
            // If username did not change, just update messages' avatar/displayName
            await Message.updateMany(
                { username: user.username },
                { avatar: user.avatar, displayName: user.displayName || user.username }
            );
        }

        await user.save();

        res.json({
            message: "Profile updated successfully",
            token: newToken,
            user: {
                username: user.username,
                displayName: user.displayName || user.username,
                avatar: user.avatar,
                bio: user.bio,
                status: user.status,
                privacyLastSeen: user.privacyLastSeen,
                privacyAvatar: user.privacyAvatar,
                privacyPrivateMessages: user.privacyPrivateMessages
            }
        });
    } catch (err) {
        console.error("Error updating profile:", err);
        res.status(500).json({ message: "Server error updating profile" });
    }
});

// 3. Friend Management - Add Friend
router.post("/add-friend", authenticateToken, async (req, res) => {
    try {
        if (req.user.isGuest) return res.status(403).json({ message: "Guests cannot add friends" });
        const { targetUsername } = req.body;
        if (!targetUsername) return res.status(400).json({ message: "Target username required" });

        const user = await User.findById(req.user.userId);
        if (!user.friends.includes(targetUsername)) {
            user.friends.push(targetUsername);
            await user.save();
        }
        res.json({ friends: user.friends });
    } catch (err) {
        res.status(500).json({ message: "Server error adding friend" });
    }
});

// 4. Friend Management - Remove Friend
router.post("/remove-friend", authenticateToken, async (req, res) => {
    try {
        if (req.user.isGuest) return res.status(403).json({ message: "Guests cannot remove friends" });
        const { targetUsername } = req.body;
        if (!targetUsername) return res.status(400).json({ message: "Target username required" });

        const user = await User.findById(req.user.userId);
        user.friends = user.friends.filter(f => f !== targetUsername);
        await user.save();
        res.json({ friends: user.friends });
    } catch (err) {
        res.status(500).json({ message: "Server error removing friend" });
    }
});

// 5. Block User
router.post("/block", authenticateToken, async (req, res) => {
    try {
        if (req.user.isGuest) return res.status(403).json({ message: "Guests cannot block users" });
        const { targetUsername } = req.body;
        if (!targetUsername) return res.status(400).json({ message: "Target username required" });

        const user = await User.findById(req.user.userId);
        if (!user.blockedUsers.includes(targetUsername)) {
            user.blockedUsers.push(targetUsername);
            await user.save();
        }
        res.json({ blockedUsers: user.blockedUsers });
    } catch (err) {
        res.status(500).json({ message: "Server error blocking user" });
    }
});

// 6. Unblock User
router.post("/unblock", authenticateToken, async (req, res) => {
    try {
        if (req.user.isGuest) return res.status(403).json({ message: "Guests cannot unblock users" });
        const { targetUsername } = req.body;
        if (!targetUsername) return res.status(400).json({ message: "Target username required" });

        const user = await User.findById(req.user.userId);
        user.blockedUsers = user.blockedUsers.filter(u => u !== targetUsername);
        await user.save();
        res.json({ blockedUsers: user.blockedUsers });
    } catch (err) {
        res.status(500).json({ message: "Server error unblocking user" });
    }
});

// 7. Report User
router.post("/report", authenticateToken, async (req, res) => {
    try {
        const { targetUsername, reason } = req.body;
        if (!targetUsername || !reason) {
            return res.status(400).json({ message: "Target username and reason are required" });
        }

        await Report.create({
            reporter: req.user.username,
            reported: targetUsername,
            reason
        });

        res.json({ message: "User reported successfully" });
    } catch (err) {
        console.error("Error creating report:", err);
        res.status(500).json({ message: "Server error reporting user" });
    }
});

module.exports = router;
