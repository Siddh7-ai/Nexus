const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Message = require("../models/Message");
const Report = require("../models/Report");
const ClearedChat = require("../models/ClearedChat");
const FriendRequest = require("../models/FriendRequest");
const bcrypt = require("bcryptjs");

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
        const logger = require("../utils/logger");
        logger.error(`[JWT Verify Error] userRoutes: ${err.message}. Token: ${token}`);
        return res.status(401).json({ message: "Invalid or expired token" });
    }
}

// 0. Search Users (supports both registered users and guests searching for users to connect)
router.get("/search", authenticateToken, async (req, res) => {
    try {
        const query = (req.query.q || "").trim();
        if (!query) {
            return res.json({ users: [] });
        }

        const regex = new RegExp(query, "i");
        const users = await User.find(
            {
                $or: [
                    { username: regex },
                    { displayName: regex }
                ]
            },
            "username displayName avatar status bio createdAt friends"
        ).limit(20);

        const results = users.map(u => ({
            _id: u._id,
            username: u.username,
            displayName: u.displayName || u.username,
            avatar: u.avatar || "",
            status: u.status || "Online",
            bio: u.bio || "",
            friendsCount: u.friends ? u.friends.length : 0,
            isGuest: false
        }));

        res.json({ users: results });
    } catch (err) {
        console.error("Error searching users:", err);
        res.status(500).json({ message: "Server error searching users" });
    }
});

// Get User's Friends List (populated with profile details)
router.get("/friends/:username", authenticateToken, async (req, res) => {
    try {
        const { username } = req.params;
        const targetUser = await User.findOne({ username });
        if (!targetUser) {
            return res.json({ friends: [] });
        }

        const friendUsernames = targetUser.friends || [];
        const friendsDocs = await User.find(
            { username: { $in: friendUsernames } },
            "username displayName avatar status bio createdAt"
        );

        const friends = friendsDocs.map(f => ({
            _id: f._id,
            username: f.username,
            displayName: f.displayName || f.username,
            avatar: f.avatar || "",
            status: f.status || "Online",
            bio: f.bio || ""
        }));

        res.json({ friends });
    } catch (err) {
        console.error("Error fetching user friends:", err);
        res.status(500).json({ message: "Server error fetching friends" });
    }
});

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
        
        let isFriend = false;
        if (requester && !requester.isGuest) {
            const requesterUser = await User.findOne({ username: requester.username });
            isFriend = targetUser.friends.includes(requester.username) && requesterUser && requesterUser.friends.includes(targetUser.username);
        }

        let friendshipStatus = "none";
        if (isSelf) {
            friendshipStatus = "none";
        } else if (isFriend) {
            friendshipStatus = "friends";
        } else if (requester && !requester.isGuest) {
            const outgoingReq = await FriendRequest.findOne({ sender: requester.username, receiver: targetUser.username, status: "pending" });
            if (outgoingReq) {
                friendshipStatus = "requested";
            } else {
                const incomingReq = await FriendRequest.findOne({ sender: targetUser.username, receiver: requester.username, status: "pending" });
                if (incomingReq) {
                    friendshipStatus = "pending_approval";
                }
            }
        }

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
            responseData.deletedSystemRooms = targetUser.deletedSystemRooms || [];
        } else {
            // Include block and friend status for the requester
            responseData.isBlocked = isRequesterBlocked;
            responseData.isFriend = isFriend;
            responseData.friendshipStatus = friendshipStatus;
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
            username,
            email,
            currentPassword,
            newPassword
        } = req.body;

        // Update fields if provided
        if (displayName !== undefined) user.displayName = displayName;
        if (bio !== undefined) user.bio = bio.slice(0, 50); // limit to 50 characters
        if (avatar !== undefined) user.avatar = avatar;
        if (status !== undefined) user.status = status;
        if (privacyLastSeen !== undefined) user.privacyLastSeen = privacyLastSeen;
        if (privacyAvatar !== undefined) user.privacyAvatar = privacyAvatar;
        if (privacyPrivateMessages !== undefined) user.privacyPrivateMessages = privacyPrivateMessages;

        // Update email if provided and changed
        if (email && email.trim() !== user.email) {
            const trimmedEmail = email.trim();
            if (!trimmedEmail.includes("@")) {
                return res.status(400).json({ message: "Invalid email format." });
            }

            const existingEmail = await User.findOne({
                email: { $regex: new RegExp(`^${trimmedEmail}$`, "i") },
                _id: { $ne: user._id }
            });
            if (existingEmail) {
                return res.status(400).json({ message: "Email is already registered by another account." });
            }

            user.email = trimmedEmail;
        }

        // Validate and update password
        if (currentPassword && currentPassword.trim() !== "") {
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                return res.status(400).json({ message: "Incorrect current password." });
            }

            if (newPassword && newPassword.trim() !== "") {
                const hashedPassword = await bcrypt.hash(newPassword, 10);
                user.password = hashedPassword;
            }
        } else if (newPassword && newPassword.trim() !== "") {
            return res.status(400).json({ message: "Current password is required to change password." });
        }

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
                privacyPrivateMessages: user.privacyPrivateMessages,
                email: user.email
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

// Send Friend Request
router.post("/friend-request/send", authenticateToken, async (req, res) => {
    try {
        if (req.user.isGuest) return res.status(403).json({ message: "Guests cannot send friend requests" });
        const { targetUsername } = req.body;
        if (!targetUsername) return res.status(400).json({ message: "Target username required" });
        if (targetUsername.toLowerCase() === req.user.username.toLowerCase()) {
            return res.status(400).json({ message: "You cannot send a friend request to yourself" });
        }

        const targetUser = await User.findOne({ username: targetUsername });
        if (!targetUser) return res.status(404).json({ message: "Target user not found" });

        // Check if blocked
        if (targetUser.blockedUsers.includes(req.user.username)) {
            return res.status(403).json({ message: "You are blocked by this user" });
        }

        // Check if already friends
        const senderUser = await User.findOne({ username: req.user.username });
        const alreadyFriends = targetUser.friends.includes(req.user.username) && senderUser.friends.includes(targetUsername);
        if (alreadyFriends) {
            return res.status(400).json({ message: "You are already friends with this user" });
        }

        // Check if there is an incoming request from them - if so, auto-accept!
        const incomingReq = await FriendRequest.findOne({ sender: targetUsername, receiver: req.user.username, status: "pending" });
        if (incomingReq) {
            // Auto accept
            if (!senderUser.friends.includes(targetUsername)) senderUser.friends.push(targetUsername);
            if (!targetUser.friends.includes(req.user.username)) targetUser.friends.push(req.user.username);
            await Promise.all([senderUser.save(), targetUser.save(), FriendRequest.deleteOne({ _id: incomingReq._id })]);

            // Notify via socket
            const io = req.app.get("io");
            if (io) {
                io.to(`user_${req.user.username.toLowerCase()}`).emit("friendRequestUpdated");
                io.to(`user_${targetUsername.toLowerCase()}`).emit("friendRequestUpdated");
            }
            return res.json({ message: "Friend request automatically accepted (mutual request)", friendshipStatus: "friends" });
        }

        // Check if request already sent
        const existingReq = await FriendRequest.findOne({ sender: req.user.username, receiver: targetUsername });
        if (existingReq) {
            return res.status(400).json({ message: "Friend request already sent" });
        }

        // Create new request
        await FriendRequest.create({
            sender: req.user.username,
            receiver: targetUsername,
            status: "pending"
        });

        // Notify receiver via socket
        const io = req.app.get("io");
        if (io) {
            io.to(`user_${targetUsername.toLowerCase()}`).emit("friendRequestUpdated");
        }

        res.json({ message: "Friend request sent successfully", friendshipStatus: "requested" });
    } catch (err) {
        console.error("Error sending friend request:", err);
        res.status(500).json({ message: "Server error sending friend request" });
    }
});

// Accept Friend Request
router.post("/friend-request/accept", authenticateToken, async (req, res) => {
    try {
        if (req.user.isGuest) return res.status(403).json({ message: "Guests cannot accept requests" });
        const { targetUsername } = req.body;
        if (!targetUsername) return res.status(400).json({ message: "Target username required" });

        const pendingReq = await FriendRequest.findOne({ sender: targetUsername, receiver: req.user.username, status: "pending" });
        if (!pendingReq) {
            return res.status(404).json({ message: "No pending friend request found from this user" });
        }

        const [user, senderUser] = await Promise.all([
            User.findById(req.user.userId),
            User.findOne({ username: targetUsername })
        ]);

        if (!user || !senderUser) {
            return res.status(404).json({ message: "User not found" });
        }

        // Add to friends lists mutually
        if (!user.friends.includes(targetUsername)) {
            user.friends.push(targetUsername);
        }
        if (!senderUser.friends.includes(req.user.username)) {
            senderUser.friends.push(req.user.username);
        }

        await Promise.all([
            user.save(),
            senderUser.save(),
            FriendRequest.deleteOne({ _id: pendingReq._id })
        ]);

        // Notify both via socket
        const io = req.app.get("io");
        if (io) {
            io.to(`user_${req.user.username.toLowerCase()}`).emit("friendRequestUpdated");
            io.to(`user_${targetUsername.toLowerCase()}`).emit("friendRequestUpdated");
        }

        res.json({ message: "Friend request accepted successfully", friendshipStatus: "friends" });
    } catch (err) {
        console.error("Error accepting friend request:", err);
        res.status(500).json({ message: "Server error accepting request" });
    }
});

// Decline Friend Request
router.post("/friend-request/decline", authenticateToken, async (req, res) => {
    try {
        if (req.user.isGuest) return res.status(403).json({ message: "Guests cannot decline requests" });
        const { targetUsername } = req.body;
        if (!targetUsername) return res.status(400).json({ message: "Target username required" });

        const pendingReq = await FriendRequest.findOne({ sender: targetUsername, receiver: req.user.username, status: "pending" });
        if (!pendingReq) {
            return res.status(404).json({ message: "No pending friend request found from this user" });
        }

        await FriendRequest.deleteOne({ _id: pendingReq._id });

        // Notify both via socket
        const io = req.app.get("io");
        if (io) {
            io.to(`user_${req.user.username.toLowerCase()}`).emit("friendRequestUpdated");
            io.to(`user_${targetUsername.toLowerCase()}`).emit("friendRequestUpdated");
        }

        res.json({ message: "Friend request declined", friendshipStatus: "none" });
    } catch (err) {
        console.error("Error declining friend request:", err);
        res.status(500).json({ message: "Server error declining request" });
    }
});

// Cancel Friend Request
router.post("/friend-request/cancel", authenticateToken, async (req, res) => {
    try {
        if (req.user.isGuest) return res.status(403).json({ message: "Guests cannot cancel requests" });
        const { targetUsername } = req.body;
        if (!targetUsername) return res.status(400).json({ message: "Target username required" });

        const pendingReq = await FriendRequest.findOne({ sender: req.user.username, receiver: targetUsername, status: "pending" });
        if (!pendingReq) {
            return res.status(404).json({ message: "No pending friend request found to this user" });
        }

        await FriendRequest.deleteOne({ _id: pendingReq._id });

        // Notify both via socket
        const io = req.app.get("io");
        if (io) {
            io.to(`user_${req.user.username.toLowerCase()}`).emit("friendRequestUpdated");
            io.to(`user_${targetUsername.toLowerCase()}`).emit("friendRequestUpdated");
        }

        res.json({ message: "Friend request cancelled", friendshipStatus: "none" });
    } catch (err) {
        console.error("Error cancelling friend request:", err);
        res.status(500).json({ message: "Server error cancelling request" });
    }
});

// Remove Friend (Mutual)
router.post("/friend-request/remove", authenticateToken, async (req, res) => {
    try {
        if (req.user.isGuest) return res.status(403).json({ message: "Guests cannot remove friends" });
        const { targetUsername } = req.body;
        if (!targetUsername) return res.status(400).json({ message: "Target username required" });

        const [user, targetUser] = await Promise.all([
            User.findById(req.user.userId),
            User.findOne({ username: targetUsername })
        ]);

        if (user) {
            user.friends = user.friends.filter(f => f !== targetUsername);
            await user.save();
        }
        if (targetUser) {
            targetUser.friends = targetUser.friends.filter(f => f !== req.user.username);
            await targetUser.save();
        }

        // Notify both via socket
        const io = req.app.get("io");
        if (io) {
            io.to(`user_${req.user.username.toLowerCase()}`).emit("friendRequestUpdated");
            io.to(`user_${targetUsername.toLowerCase()}`).emit("friendRequestUpdated");
        }

        res.json({ message: "Friend removed successfully", friendshipStatus: "none" });
    } catch (err) {
        console.error("Error removing friend:", err);
        res.status(500).json({ message: "Server error removing friend" });
    }
});

// Get Pending Friend Requests List (Incoming)
router.get("/friend-requests/pending", authenticateToken, async (req, res) => {
    try {
        if (req.user.isGuest) return res.json({ incoming: [] });

        const pendingIncoming = await FriendRequest.find({ receiver: req.user.username, status: "pending" });
        
        // Fetch sender profiles (avatar, displayName) for each request
        const incomingWithProfiles = await Promise.all(pendingIncoming.map(async (reqItem) => {
            const senderUser = await User.findOne({ username: reqItem.sender });
            return {
                _id: reqItem._id,
                sender: reqItem.sender,
                displayName: senderUser ? (senderUser.displayName || reqItem.sender) : reqItem.sender,
                avatar: senderUser ? senderUser.avatar : "",
                createdAt: reqItem.createdAt
            };
        }));

        res.json({ incoming: incomingWithProfiles });
    } catch (err) {
        console.error("Error fetching pending requests:", err);
        res.status(500).json({ message: "Server error fetching pending requests" });
    }
});

// 13. Get all registered users in the system for task assignee selection
router.get("/list", authenticateToken, async (req, res) => {
    try {
        const users = await User.find({}, "username displayName avatar");
        res.json({ users });
    } catch (err) {
        console.error("Error fetching users list:", err);
        res.status(500).json({ message: "Server error fetching user list" });
    }
});

router.authenticateToken = authenticateToken;
module.exports = router;
