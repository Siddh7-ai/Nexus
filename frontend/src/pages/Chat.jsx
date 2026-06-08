import React, { useState, useEffect, useRef, Suspense } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { io } from "socket.io-client";
import { motion, AnimatePresence, useMotionValue, useTransform, useVelocity } from "framer-motion";

import ChatHeader from "../components/ChatHeader";
import OnlineUsers from "../components/OnlineUsers";
import MessageList from "../components/MessageList";
import { getBackendUrl } from "../utils/config";
import TypingIndicator from "../components/TypingIndicator";
import MessageInput from "../components/MessageInput";
import RoomList from "../components/RoomList";

import "../App.css";

// Lazy-load emoji picker library to optimize bundle load times
const EmojiPicker = React.lazy(() => import("emoji-picker-react"));

function parseJWT(token) {
    try {
        const base64 = token.split(".")[1];
        return JSON.parse(atob(base64));
    } catch {
        return null;
    }
}

function getAuthToken() {
    let token = sessionStorage.getItem("token") || localStorage.getItem("token");
    if (!token) {
        const guestProfileStr = localStorage.getItem("guestProfile");
        if (guestProfileStr) {
            try {
                const profile = JSON.parse(guestProfileStr);
                if (profile && profile.username) {
                    token = `guest:${profile.username}`;
                    sessionStorage.setItem("token", token);
                }
            } catch (e) {
                console.error(e);
            }
        }
    }
    return token;
}

function Chat() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const isGuest = (() => {
        const token = getAuthToken();
        return token ? token.startsWith("guest:") : false;
    })();

    const [username, setUsername] = useState(() => {
        const token = getAuthToken();
        if (token && token.startsWith("guest:")) {
            return token.split(":")[1];
        }
        return parseJWT(token || "")?.username || "";
    });

    const [message, setMessage] = useState("");
    const [messages, setMessages] = useState([]);
    const [typingUser, setTypingUser] = useState("");
    const [onlineUsers, setOnlineUsers] = useState(0);
    const [onlineUserList, setOnlineUserList] = useState([]);

    const [activeRoom, setActiveRoom] = useState("General chat");
    const [activePrivate, setActivePrivate] = useState(null); // privateChatId
    const [activePrivateName, setActivePrivateName] = useState(""); // other username
    const [editingMsg, setEditingMsg] = useState(null); // { _id, text }
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [activeReactionMsgId, setActiveReactionMsgId] = useState(null); // Msg ID for custom reaction picker
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [showProfileSettings, setShowProfileSettings] = useState(false);
    const [newGuestName, setNewGuestName] = useState("");
    const [profileError, setProfileError] = useState("");
    const [profileLoading, setProfileLoading] = useState(false);

    // Registered User Profile Form states
    const [ownProfileData, setOwnProfileData] = useState(null);
    const [displayNameVal, setDisplayNameVal] = useState("");
    const [bioVal, setBioVal] = useState("");
    const [avatarVal, setAvatarVal] = useState("");
    const [statusVal, setStatusVal] = useState("Online");
    const [privacyLastSeenVal, setPrivacyLastSeenVal] = useState("Everyone");
    const [privacyAvatarVal, setPrivacyAvatarVal] = useState("Everyone");
    const [privacyPMVal, setPrivacyPMVal] = useState("Everyone");
    const [editUsernameVal, setEditUsernameVal] = useState("");
    const [currentUserProfile, setCurrentUserProfile] = useState(null);

    // Other user profile states
    const [selectedProfileUsername, setSelectedProfileUsername] = useState(null);
    const [selectedProfileData, setSelectedProfileData] = useState(null);
    const [loadingProfileCard, setLoadingProfileCard] = useState(false);
    const [profileCardError, setProfileCardError] = useState("");
    const [reportReason, setReportReason] = useState("");
    const [showReportForm, setShowReportForm] = useState(false);
    const [showOnlineList, setShowOnlineList] = useState(false);
    const [fullAvatarUrl, setFullAvatarUrl] = useState(null);

    // Framer Motion Values for interactive dragging and physical lanyard updates
    const cardX = useMotionValue(0);
    const cardY = useMotionValue(0);
    
    // Capture horizontal velocity to simulate realistic drag-induced rotation
    const xVelocity = useVelocity(cardX);
    const cardRotate = useTransform(xVelocity, [-2000, 2000], [-12, 12]);
    
    // Calculate woven lanyard tilt angle and vertical stretch dynamically
    const lanyardAngle = useTransform([cardX, cardY], ([cx, cy]) => {
        const targetY = 160 + cy;
        if (targetY <= 0) return 0;
        // Invert rotation sign so the bottom of the lanyard follows card offset coordinates correctly
        return -Math.atan2(cx, targetY) * (180 / Math.PI);
    });
    const lanyardHeight = useTransform([cardX, cardY], ([cx, cy]) => {
        const targetY = 160 + cy;
        if (targetY <= 0) return 0;
        return Math.sqrt(cx * cx + targetY * targetY);
    });
    
    // Calculate carabiner rotation relative to the card's rotation to point toward the lanyard loop
    const claspRotate = useTransform([lanyardAngle, cardRotate], ([la, cr]) => la - cr);

    // Reset card coordinates to resting state when profile card opens/closes
    useEffect(() => {
        cardX.set(0);
        cardY.set(0);
    }, [selectedProfileUsername, cardX, cardY]);

    // Avatar Canvas Cropper states
    const [cropImageSrc, setCropImageSrc] = useState(null);
    const [cropZoom, setCropZoom] = useState(1.0);
    const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
    const [isDraggingCrop, setIsDraggingCrop] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const socketRef = useRef(null);
    const messagesEndRef = useRef(null);
    const typingTimeoutRef = useRef(null);
    const activeRoomRef = useRef(activeRoom);
    const activePrivateRef = useRef(activePrivate);

    useEffect(() => {
        activeRoomRef.current = activeRoom;
    }, [activeRoom]);

    useEffect(() => {
        activePrivateRef.current = activePrivate;
    }, [activePrivate]);

    useEffect(() => {
        const token = getAuthToken();
        if (!token) {
            navigate("/login");
            return;
        }

        const newSocket = io(getBackendUrl(), { auth: { token } });
        socketRef.current = newSocket;

        newSocket.on("connect_error", () => {
            sessionStorage.removeItem("token");
            localStorage.removeItem("token");
            navigate("/login");
        });

        newSocket.on("currentUser", (user) => {
            if (user?.username) {
                setUsername(user.username);
                setCurrentUserProfile(user);
            }
        });

        newSocket.on("oldMessages", (oldMessages) => {
            setMessages(oldMessages);
        });

        newSocket.on("reply", (data) => {
            setMessages((prev) => [...prev, data]);
        });

        newSocket.on("typing", (typingData) => {
            if (!typingData || !typingData.username) return;
            const isMatch = typingData.privateChatId
                ? (activePrivateRef.current === typingData.privateChatId)
                : (activeRoomRef.current === typingData.room);
            if (!isMatch) return;

            setTypingUser(typingData);
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
            typingTimeoutRef.current = setTimeout(() => {
                setTypingUser(null);
            }, 1500);
        });

        newSocket.on("stopTyping", (data) => {
            if (data && data.username) {
                const isMatch = data.privateChatId
                    ? (activePrivateRef.current === data.privateChatId)
                    : (activeRoomRef.current === data.room);
                if (isMatch) {
                    setTypingUser(prev => (prev && prev.username === data.username) ? null : prev);
                }
            }
        });

        newSocket.on("onlineUsers", (count) => setOnlineUsers(count));
        newSocket.on("onlineUserList", (list) => setOnlineUserList(list));

        newSocket.on("messageUpdated", (updatedMsg) => {
            setMessages(prev =>
                prev.map(m => (m._id === updatedMsg._id ? updatedMsg : m))
            );
        });

        newSocket.on("messageDeletedForMe", (msgId) => {
            setMessages(prev => prev.filter(m => m._id !== msgId));
        });

        newSocket.on("messagesSeenUpdate", (updatedMsgs) => {
            setMessages(updatedMsgs);
        });

        // Parse search query params on socket connect
        const roomUrl = searchParams.get("room") || "General chat";
        const privateUrl = searchParams.get("private");

        if (isGuest) {
            // Guest route protection on mount
            if (roomUrl !== "General chat" || privateUrl) {
                setShowLoginModal(true);
                setSearchParams({ room: "General chat" });
                newSocket.emit("joinRoom", "General chat");
                setActiveRoom("General chat");
                setActivePrivate(null);
            } else {
                newSocket.emit("joinRoom", "General chat");
            }
        } else {
            // Normal user session restoration
            if (privateUrl) {
                const currentU = parseJWT(token)?.username || "";
                if (currentU) {
                    const pChatId = [currentU, privateUrl].sort().join("_");
                    setActiveRoom(null);
                    setActivePrivate(pChatId);
                    setActivePrivateName(privateUrl);
                    newSocket.emit("joinPrivateChat", { otherUsername: privateUrl });
                }
            } else {
                setSearchParams({ room: roomUrl });
                newSocket.emit("joinRoom", roomUrl);
                setActiveRoom(roomUrl);
                setActivePrivate(null);
            }
        }

        return () => {
            newSocket.disconnect();
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
        };
    }, [navigate, isGuest]); // Remove searchParams dependency to prevent reconnect loop

    useEffect(() => {
        if (isGuest && username) {
            setNewGuestName(username);
        }
    }, [username, isGuest]);

    useEffect(() => {
        if (!selectedProfileUsername) {
            setSelectedProfileData(null);
            setShowReportForm(false);
            setReportReason("");
            return;
        }

        async function fetchProfileCard() {
            setLoadingProfileCard(true);
            setProfileCardError("");
            try {
                const response = await fetch(`${getBackendUrl()}/api/user/profile/${selectedProfileUsername}`, {
                    headers: { "Authorization": `Bearer ${getAuthToken()}` }
                });
                const data = await response.json();
                if (response.ok) {
                    setSelectedProfileData(data);
                } else {
                    setProfileCardError(data.message || "Failed to fetch user profile.");
                }
            } catch (err) {
                console.error(err);
                setProfileCardError("Connection error loading profile.");
            } finally {
                setLoadingProfileCard(false);
            }
        }

        fetchProfileCard();
    }, [selectedProfileUsername]);

    // URL Query Parameter active protection
    useEffect(() => {
        const room = searchParams.get("room");
        const privateUser = searchParams.get("private");

        if (isGuest) {
            if ((room && room !== "General chat") || privateUser) {
                setShowLoginModal(true);
                setSearchParams({ room: "General chat" });
            }
        }
    }, [searchParams, isGuest, setSearchParams]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, typingUser]);

    function selectRoom(room) {
        if (isGuest && room !== "General chat") {
            setShowLoginModal(true);
            return;
        }
        setSearchParams({ room });
        setActiveRoom(room);
        setActivePrivate(null);
        setActivePrivateName("");
        setMessages([]);
        setSidebarOpen(false);
        setTypingUser(null);
        socketRef.current?.emit("joinRoom", room);
    }

    // Join direct private message conversation
    function selectPrivate(privateChatId, otherUsername) {
        if (isGuest) {
            setShowLoginModal(true);
            return;
        }
        setSearchParams({ private: otherUsername });
        setActivePrivate(privateChatId);
        setActivePrivateName(otherUsername);
        setActiveRoom(null);
        setMessages([]);
        setSidebarOpen(false);
        setTypingUser(null);
        socketRef.current?.emit("joinPrivateChat", { otherUsername });
    }

    function sendMessage() {
        if (!username || !message.trim() || !socketRef.current) return;

        const msgData = { text: message };
        if (activePrivate) {
            msgData.privateChatId = activePrivate;
        } else {
            msgData.room = activeRoom;
        }

        socketRef.current.emit("message", msgData);
        setMessage("");
        socketRef.current.emit("stopTyping", {
            room: activeRoom,
            privateChatId: activePrivate
        });
    }

    function emitTyping(value) {
        setMessage(value);
        if (!username) return;
        if (value.trim() === "") {
            socketRef.current?.emit("stopTyping", {
                room: activeRoom,
                privateChatId: activePrivate
            });
        } else {
            socketRef.current?.emit("typing", {
                room: activeRoom,
                privateChatId: activePrivate
            });
        }
    }

    function handleReact(messageId, emoji) {
        socketRef.current?.emit("reactMessage", { messageId, emoji });
    }

    function handleCustomReactionSelect(emoji) {
        if (!activeReactionMsgId || !socketRef.current) return;
        socketRef.current.emit("reactMessage", { messageId: activeReactionMsgId, emoji });
        setActiveReactionMsgId(null);
    }

    function handleClearChat() {
        const chatId = activePrivate ? activePrivate : activeRoom;
        if (!chatId) return;

        socketRef.current?.emit("clearChat", { chatId });
        setMessages([]);
        setShowClearConfirm(false);
    }

    function handleEdit(msg) {
        setEditingMsg({ _id: msg._id, text: msg.text });
        setMessage(msg.text);
    }

    function submitEdit() {
        if (!editingMsg || !message.trim()) return;
        socketRef.current?.emit("editMessage", { messageId: editingMsg._id, newText: message });
        setEditingMsg(null);
        setMessage("");
    }

    function cancelEdit() {
        setEditingMsg(null);
        setMessage("");
    }

    function handleDelete(messageId, deleteFor) {
        socketRef.current?.emit("deleteMessage", {
            messageId,
            deleteFor: deleteFor === "everyone" ? "everyone" : "me"
        });
    }

    async function openOwnProfileSettings() {
        setShowProfileSettings(true);
        setProfileError("");
        try {
            const response = await fetch(`${getBackendUrl()}/api/user/profile/${username}`, {
                headers: { "Authorization": `Bearer ${getAuthToken()}` }
            });
            const data = await response.json();
            if (response.ok) {
                setOwnProfileData(data);
                setDisplayNameVal(data.displayName || "");
                setBioVal(data.bio || "");
                setAvatarVal(data.avatar || "");
                setStatusVal(data.status || "Online");
                setPrivacyLastSeenVal(data.privacyLastSeen || "Everyone");
                setPrivacyAvatarVal(data.privacyAvatar || "Everyone");
                setPrivacyPMVal(data.privacyPrivateMessages || "Everyone");
                setEditUsernameVal(data.username || "");
            } else {
                setProfileError(data.message || "Failed to load profile.");
            }
        } catch (err) {
            console.error(err);
            setProfileError("Connection error loading profile.");
        }
    }

    async function handleOwnProfileUpdate(e) {
        if (e) e.preventDefault();
        setProfileLoading(true);
        setProfileError("");

        try {
            const response = await fetch(`${getBackendUrl()}/api/user/profile`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${getAuthToken()}`
                },
                body: JSON.stringify({
                    displayName: displayNameVal,
                    bio: bioVal,
                    avatar: avatarVal,
                    status: statusVal,
                    privacyLastSeen: privacyLastSeenVal,
                    privacyAvatar: privacyAvatarVal,
                    privacyPrivateMessages: privacyPMVal,
                    username: editUsernameVal
                })
            });
            const data = await response.json();

            if (response.ok) {
                if (data.token) {
                    sessionStorage.setItem("token", data.token);
                }
                setUsername(data.user.username);
                setCurrentUserProfile(prev => ({
                    ...prev,
                    username: data.user.username,
                    displayName: data.user.displayName,
                    avatar: data.user.avatar,
                    status: data.user.status
                }));
                
                socketRef.current?.emit("updateProfile", {
                    displayName: data.user.displayName,
                    avatar: data.user.avatar,
                    status: data.user.status
                });

                if (data.user.username !== username) {
                    socketRef.current?.emit("changeUsername", { newUsername: data.user.username });
                }

                setProfileLoading(false);
                setShowProfileSettings(false);
            } else {
                setProfileError(data.message || "Failed to update profile.");
                setProfileLoading(false);
            }
        } catch (err) {
            console.error(err);
            setProfileError("Connection error. Please try again.");
            setProfileLoading(false);
        }
    }

    // Cropper File Change
    function handleCropFileChange(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setCropImageSrc(event.target.result);
                setCropZoom(1.0);
                setCropOffset({ x: 0, y: 0 });
            };
            reader.readAsDataURL(file);
        }
    }

    // Save Crop utilizing Canvas
    function saveCroppedImage() {
        if (!cropImageSrc) return;
        const canvas = document.createElement("canvas");
        const canvasSize = 800; // Output high-quality resolution (800x800 pixels)
        canvas.width = canvasSize;
        canvas.height = canvasSize;
        
        const img = new Image();
        img.src = cropImageSrc;
        img.onload = () => {
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvasSize, canvasSize);

            // Enable high-quality image scaling
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";

            const uiSize = 200; // Viewport size in UI is 200px
            const scale = canvasSize / uiSize; // Scale factor (800 / 200 = 4)
            const imgRatio = img.width / img.height;

            // In the UI, the image height matches the viewport height (200px), 
            // and its width scales with the image aspect ratio (200px * imgRatio).
            const drawWidth = canvasSize * imgRatio * cropZoom;
            const drawHeight = canvasSize * cropZoom;

            const x = (canvasSize - drawWidth) / 2 + cropOffset.x * scale;
            const y = (canvasSize - drawHeight) / 2 + cropOffset.y * scale;

            ctx.drawImage(img, x, y, drawWidth, drawHeight);

            // Export as JPEG with 92% quality (excellent balance of clarity and file size)
            const compressedBase64 = canvas.toDataURL("image/jpeg", 0.92);
            setAvatarVal(compressedBase64);
            setCropImageSrc(null); // Close cropper
        };
    }

    // Other user actions
    async function handleBlockToggle() {
        if (!selectedProfileData) return;
        const endpoint = selectedProfileData.isBlocked ? "unblock" : "block";
        try {
            const response = await fetch(`${getBackendUrl()}/api/user/${endpoint}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${getAuthToken()}`
                },
                body: JSON.stringify({ targetUsername: selectedProfileData.username })
            });
            if (response.ok) {
                setSelectedProfileData(prev => ({
                    ...prev,
                    isBlocked: !prev.isBlocked,
                    canDM: prev.isBlocked ? true : false
                }));
            }
        } catch (err) {
            console.error(err);
        }
    }

    async function handleFriendToggle() {
        if (!selectedProfileData) return;
        const endpoint = selectedProfileData.isFriend ? "remove-friend" : "add-friend";
        try {
            const response = await fetch(`${getBackendUrl()}/api/user/${endpoint}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${getAuthToken()}`
                },
                body: JSON.stringify({ targetUsername: selectedProfileData.username })
            });
            if (response.ok) {
                // reload card
                const updatedResponse = await fetch(`${getBackendUrl()}/api/user/profile/${selectedProfileData.username}`, {
                    headers: { "Authorization": `Bearer ${getAuthToken()}` }
                });
                const updatedData = await updatedResponse.json();
                if (updatedResponse.ok) {
                    setSelectedProfileData(updatedData);
                }
            }
        } catch (err) {
            console.error(err);
        }
    }

    async function handleReportUser() {
        if (!selectedProfileData || !reportReason.trim()) return;
        try {
            const response = await fetch(`${getBackendUrl()}/api/user/report`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${getAuthToken()}`
                },
                body: JSON.stringify({
                    targetUsername: selectedProfileData.username,
                    reason: reportReason
                })
            });
            if (response.ok) {
                alert("User reported successfully.");
                setReportReason("");
                setShowReportForm(false);
            } else {
                const d = await response.json();
                alert(d.message || "Failed to report user.");
            }
        } catch (err) {
            console.error(err);
            alert("Connection error reporting user.");
        }
    }

    function handleStartPrivateChat() {
        if (!selectedProfileData) return;
        const targetUser = selectedProfileData.username;
        const token = getAuthToken();
        const currentU = isGuest ? "" : (parseJWT(token)?.username || "");
        if (!currentU) return;
        const pChatId = [currentU, targetUser].sort().join("_");
        selectPrivate(pChatId, targetUser);
        setSelectedProfileUsername(null);
    }

    function logout() {
        sessionStorage.removeItem("token");
        localStorage.removeItem("token");
        navigate("/login");
    }

    async function handleGuestNameChange(e) {
        if (e) e.preventDefault();
        const trimmed = newGuestName.trim();
        if (trimmed === username) {
            setShowProfileSettings(false);
            return;
        }

        const isInputValid = trimmed.length >= 3 && 
                             trimmed.length <= 20 && 
                             /^[A-Za-z0-9_]+$/.test(trimmed);
        
        if (!isInputValid) {
            setProfileError("Username must be 3–20 characters. Letters, numbers, and underscores only.");
            return;
        }

        const BANNED_WORDS = ["admin", "system", "moderator", "guest", "banned", "support", "staff"];
        if (BANNED_WORDS.includes(trimmed.toLowerCase())) {
            setProfileError("This username is reserved or not allowed. Please choose another.");
            return;
        }

        setProfileLoading(true);
        setProfileError("");

        try {
            const response = await fetch(`${getBackendUrl()}/api/auth/check-username`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: trimmed })
            });
            const data = await response.json();

            if (data.reserved) {
                setProfileError("This username is reserved by a registered user. Please choose another username.");
                setProfileLoading(false);
                return;
            }

            // Update guest profile in localStorage
            const guestProfileStr = localStorage.getItem("guestProfile");
            if (guestProfileStr) {
                try {
                    const profile = JSON.parse(guestProfileStr);
                    profile.username = trimmed;
                    localStorage.setItem("guestProfile", JSON.stringify(profile));
                } catch (e) {
                    console.error("Failed to update guestProfile in localStorage", e);
                }
            } else {
                const guestProfile = {
                    username: trimmed,
                    isGuest: true,
                    guestId: "guest_" + Math.random().toString(36).substr(2, 9)
                };
                localStorage.setItem("guestProfile", JSON.stringify(guestProfile));
            }

            // Update sessionStorage token
            sessionStorage.setItem("token", `guest:${trimmed}`);

            // Update React state
            setUsername(trimmed);

            // Emit socket event
            socketRef.current?.emit("changeUsername", { newUsername: trimmed });

            setProfileLoading(false);
            setShowProfileSettings(false);
        } catch (err) {
            console.error(err);
            setProfileError("Connection error. Please try again.");
            setProfileLoading(false);
        }
    }

    const chatTitle = activePrivate
        ? `${activePrivateName}`
        : `#${activeRoom}`;

    return (
        <div className="chat-wrapper">

            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
                <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
            )}

            <div className="chat-layout">

                {/* Sidebar */}
                <div className={`sidebar-panel ${sidebarOpen ? "open" : ""}`}>
                    <RoomList
                        activeRoom={activeRoom}
                        activePrivate={activePrivate}
                        onSelectRoom={selectRoom}
                        onSelectPrivate={selectPrivate}
                        onlineUserList={onlineUserList}
                        currentUser={username}
                        currentUserProfile={currentUserProfile}
                        isGuest={isGuest}
                        onProfileClick={isGuest ? () => setShowProfileSettings(true) : openOwnProfileSettings}
                        onUserProfileClick={(uname) => setSelectedProfileUsername(uname)}
                    />
                </div>

                {/* Main chat */}
                <div className="chat-container">

                    <ChatHeader
                        username={username}
                        onLogout={logout}
                        chatTitle={chatTitle}
                        onlineUsers={onlineUsers}
                        onMenuToggle={() => setSidebarOpen(v => !v)}
                        isGuest={isGuest}
                        onClearChatClick={() => setShowClearConfirm(true)}
                    />

                    <OnlineUsers
                        onlineUsers={onlineUsers}
                        onlineUserList={onlineUserList}
                        currentUser={username}
                        onUserProfileClick={(uname) => setSelectedProfileUsername(uname)}
                        onShowOnlineListClick={() => setShowOnlineList(true)}
                    />

                    <MessageList
                        messages={messages}
                        currentUser={username}
                        messagesEndRef={messagesEndRef}
                        onReact={handleReact}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        isPrivate={!!activePrivate}
                        onAddReactionClick={(msgId) => setActiveReactionMsgId(msgId)}
                        typingUser={typingUser}
                        onUserProfileClick={(uname) => setSelectedProfileUsername(uname)}
                    />

                    <MessageInput
                        message={message}
                        setMessage={setMessage}
                        sendMessage={editingMsg ? submitEdit : sendMessage}
                        username={username}
                        activeRoom={activeRoom}
                        activePrivate={activePrivate}
                        onTyping={emitTyping}
                        isEditing={!!editingMsg}
                        onCancelEdit={cancelEdit}
                        isGuest={isGuest}
                        onLockTrigger={() => setShowLoginModal(true)}
                    />

                </div>
            </div>

            {/* Central Login Required Modal */}
            {showLoginModal && (
                <div className="modal-overlay" onClick={() => setShowLoginModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header-section">
                            <h3>Login Required</h3>
                        </div>
                        <div className="modal-body-section">
                            <p>Please log in or create an account to access private chats and additional chat rooms.</p>
                        </div>
                        <div className="modal-footer-buttons">
                            <button className="modal-btn primary" onClick={() => navigate("/login")}>Login</button>
                            <button className="modal-btn secondary" onClick={() => navigate("/register")}>Create Account</button>
                            <button className="modal-btn cancel" onClick={() => setShowLoginModal(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Full-featured Emoji Picker Modal for Custom Reactions */}
            {activeReactionMsgId && (
                <div className="modal-overlay reaction-picker-modal" onClick={() => setActiveReactionMsgId(null)}>
                    <div className="modal-content reaction-picker-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header-section reaction-picker-header">
                            <h3>Add Reaction</h3>
                            <button className="close-picker-btn" onClick={() => setActiveReactionMsgId(null)}>×</button>
                        </div>
                        <div className="modal-body-section reaction-picker-body">
                            <Suspense fallback={<div className="emoji-picker-loader">Loading Picker...</div>}>
                                <EmojiPicker
                                    onEmojiClick={(emojiData) => handleCustomReactionSelect(emojiData.emoji)}
                                    autoFocusSearch={true}
                                    skinTonesDisabled={false}
                                    width="100%"
                                    height="360px"
                                />
                            </Suspense>
                        </div>
                    </div>
                </div>
            )}

            {/* Clear Chat Confirmation Modal */}
            {showClearConfirm && (
                <div className="modal-overlay" onClick={() => setShowClearConfirm(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header-section">
                            <h3>Clear Chat</h3>
                        </div>
                        <div className="modal-body-section">
                            <p>This will remove all messages from your view only. Other participants will still be able to see the conversation.</p>
                        </div>
                        <div className="modal-footer-buttons">
                            <button className="modal-btn danger" onClick={handleClearChat}>Clear Chat</button>
                            <button className="modal-btn cancel" onClick={() => setShowClearConfirm(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Registered User Profile Settings Modal */}
            {showProfileSettings && !isGuest && (
                <div className="modal-overlay" onClick={() => { if (!profileLoading) setShowProfileSettings(false); }}>
                    <div className="modal-content profile-settings-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(90%, 420px)' }}>
                        <div className="modal-header-section">
                            <h3>Profile Settings</h3>
                            <button className="close-picker-btn" onClick={() => setShowProfileSettings(false)} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', float: 'right' }}>×</button>
                        </div>
                        {ownProfileData ? (
                            <form onSubmit={handleOwnProfileUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto', maxHeight: '70vh', paddingRight: '4px' }}>
                                <div className="modal-body-section" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    {/* Avatar Upload */}
                                    <div className="profile-settings-avatar-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                        <div className="profile-settings-avatar-wrapper" style={{ position: 'relative' }}>
                                            {avatarVal ? (
                                                <img src={avatarVal} alt="Avatar Preview" className="profile-settings-avatar-img" style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover' }} />
                                            ) : (
                                                <div className="profile-settings-avatar-placeholder" style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg, #c8eeff, #bff7f2)', color: 'var(--accent-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: '800' }}>
                                                    {(editUsernameVal || username).charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                        <label className="change-avatar-btn" style={{ padding: '6px 12px', background: '#f1f2f4', border: '1px solid #cbd5e1', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                                            Change Photo
                                            <input type="file" accept="image/*" onChange={handleCropFileChange} style={{ display: 'none' }} />
                                        </label>
                                    </div>

                                    {/* Username & Display Name */}
                                    <div className="form-group-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                        <div>
                                            <label className="form-label" style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text)', display: 'block', marginBottom: '4px' }}>Username</label>
                                            <input
                                                type="text"
                                                value={editUsernameVal}
                                                onChange={(e) => { setEditUsernameVal(e.target.value); setProfileError(""); }}
                                                className="guest-username-input"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="form-label" style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text)', display: 'block', marginBottom: '4px' }}>Display Name</label>
                                            <input
                                                type="text"
                                                value={displayNameVal}
                                                onChange={(e) => setDisplayNameVal(e.target.value)}
                                                className="guest-username-input"
                                                placeholder="Set display name"
                                            />
                                        </div>
                                    </div>

                                    {/* Bio */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                            <label className="form-label" style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text)' }}>Bio / About Me</label>
                                            <small style={{ color: 'var(--muted)', fontSize: '11px' }}>{bioVal.length}/50</small>
                                        </div>
                                        <textarea
                                            value={bioVal}
                                            onChange={(e) => setBioVal(e.target.value.slice(0, 50))}
                                            placeholder="Write something about yourself..."
                                            className="guest-username-input"
                                            rows={2}
                                            style={{ resize: 'none' }}
                                        />
                                    </div>

                                    {/* Status Dropdown */}
                                    <div>
                                        <label className="form-label" style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text)', display: 'block', marginBottom: '4px' }}>My Status</label>
                                        <select value={statusVal} onChange={(e) => setStatusVal(e.target.value)} className="guest-username-input select-status">
                                            <option value="Online">Online</option>
                                            <option value="Away">Away</option>
                                            <option value="Busy">Busy</option>
                                            <option value="Offline">Offline</option>
                                        </select>
                                    </div>

                                    {/* Privacy Dropdowns */}
                                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                        <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Privacy Settings</h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span className="privacy-label" style={{ fontSize: '12px' }}>Last Seen Visibility</span>
                                                <select value={privacyLastSeenVal} onChange={(e) => setPrivacyLastSeenVal(e.target.value)} className="privacy-select" style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '6px' }}>
                                                    <option value="Everyone">Everyone</option>
                                                    <option value="Friends">Friends</option>
                                                    <option value="Nobody">Nobody</option>
                                                </select>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span className="privacy-label" style={{ fontSize: '12px' }}>Profile Picture Visibility</span>
                                                <select value={privacyAvatarVal} onChange={(e) => setPrivacyAvatarVal(e.target.value)} className="privacy-select" style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '6px' }}>
                                                    <option value="Everyone">Everyone</option>
                                                    <option value="Friends">Friends</option>
                                                    <option value="Nobody">Nobody</option>
                                                </select>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span className="privacy-label" style={{ fontSize: '12px' }}>Private Message Permissions</span>
                                                <select value={privacyPMVal} onChange={(e) => setPrivacyPMVal(e.target.value)} className="privacy-select" style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '6px' }}>
                                                    <option value="Everyone">Everyone</option>
                                                    <option value="Friends">Friends</option>
                                                    <option value="Nobody">Nobody</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Blocked Users Management */}
                                    {ownProfileData.blockedUsers && ownProfileData.blockedUsers.length > 0 && (
                                        <div style={{ background: '#fef2f2', padding: '12px', borderRadius: '10px', border: '1px solid #fecaca' }}>
                                            <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: '800', color: '#b91c1c' }}>Blocked Users</h4>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '100px', overflowY: 'auto' }}>
                                                {ownProfileData.blockedUsers.map(uname => (
                                                    <div key={uname} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '12px', color: '#1e293b' }}>@{uname}</span>
                                                        <button
                                                            type="button"
                                                            onClick={async () => {
                                                                try {
                                                                    await fetch(`${getBackendUrl()}/api/user/unblock`, {
                                                                        method: "POST",
                                                                        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getAuthToken()}` },
                                                                        body: JSON.stringify({ targetUsername: uname })
                                                                    });
                                                                    setOwnProfileData(prev => ({
                                                                        ...prev,
                                                                        blockedUsers: prev.blockedUsers.filter(x => x !== uname)
                                                                    }));
                                                                } catch(e) {}
                                                            }}
                                                            style={{ fontSize: '11px', color: '#b91c1c', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 'bold' }}
                                                        >
                                                            Unblock
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Account Stats */}
                                    <div className="profile-stats-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: '#f8fafc', padding: '10px', borderRadius: '10px' }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Messages Sent</div>
                                            <div style={{ fontSize: '16px', fontWeight: '800' }}>{ownProfileData.totalMessagesSent.toLocaleString()}</div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Member Since</div>
                                            <div style={{ fontSize: '13px', fontWeight: '700', marginTop: '2px' }}>
                                                {new Date(ownProfileData.joinDate).toLocaleDateString([], { month: 'short', year: 'numeric' })}
                                            </div>
                                        </div>
                                    </div>

                                    {profileError && (
                                        <div className="guest-error-alert" style={{ margin: 0 }}>
                                            {profileError}
                                        </div>
                                    )}
                                </div>
                                <div className="modal-footer-buttons" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    <button type="submit" className="modal-btn primary" disabled={profileLoading || editUsernameVal.trim() === ""}>
                                        {profileLoading ? "Saving..." : "Save Changes"}
                                    </button>
                                    <button type="button" className="modal-btn cancel" onClick={() => setShowProfileSettings(false)} disabled={profileLoading}>
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <div className="emoji-picker-loader" style={{ padding: '24px 0' }}>Loading profile...</div>
                        )}
                    </div>
                </div>
            )}

            {/* Guest Profile Settings Modal */}
            {showProfileSettings && isGuest && (
                <div className="modal-overlay" onClick={() => { if (!profileLoading) setShowProfileSettings(false); }}>
                    <div className="modal-content guest-profile-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header-section">
                            <h3>Guest Profile Settings</h3>
                        </div>
                        <form onSubmit={handleGuestNameChange}>
                            <div className="modal-body-section">
                                <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>
                                    Modify your guest username. This change will be visible to all online users instantly.
                                </p>
                                <div className="guest-input-wrap">
                                    <input
                                        type="text"
                                        placeholder="Enter new username"
                                        value={newGuestName}
                                        onChange={(e) => {
                                            setNewGuestName(e.target.value);
                                            setProfileError("");
                                        }}
                                        autoFocus
                                        maxLength={20}
                                        disabled={profileLoading}
                                        className="guest-username-input"
                                    />
                                    <small style={{ display: 'block', marginTop: '6px', color: 'var(--muted)', fontSize: '11px' }}>
                                        3–20 characters. Letters, numbers, and underscores only.
                                    </small>
                                </div>
                                {profileError && (
                                    <div className="guest-error-alert" style={{ marginTop: '12px' }}>
                                        {profileError}
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer-buttons">
                                <button
                                    type="submit"
                                    className="modal-btn primary"
                                    disabled={newGuestName.trim() === username || newGuestName.trim().length < 3 || profileLoading}
                                >
                                    {profileLoading ? "Updating..." : "Save Changes"}
                                </button>
                                <button
                                    type="button"
                                    className="modal-btn cancel"
                                    onClick={() => {
                                        setShowProfileSettings(false);
                                        setNewGuestName(username);
                                        setProfileError("");
                                    }}
                                    disabled={profileLoading}
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Avatar Canvas Cropper Overlay */}
            {cropImageSrc && (
                <div className="modal-overlay" style={{ zIndex: 10005 }} onClick={() => setCropImageSrc(null)}>
                    <div className="modal-content cropper-modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 'min(90%, 340px)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div className="modal-header-section">
                            <h3>Adjust Profile Picture</h3>
                        </div>
                        <div className="modal-body-section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                            <div
                                className="cropper-viewport-wrapper"
                                onMouseDown={(e) => {
                                    setIsDraggingCrop(true);
                                    setDragStart({ x: e.clientX - cropOffset.x, y: e.clientY - cropOffset.y });
                                }}
                                onMouseMove={(e) => {
                                    if (!isDraggingCrop) return;
                                    setCropOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
                                }}
                                onMouseUp={() => setIsDraggingCrop(false)}
                                onMouseLeave={() => setIsDraggingCrop(false)}
                                onTouchStart={(e) => {
                                    const touch = e.touches[0];
                                    setIsDraggingCrop(true);
                                    setDragStart({ x: touch.clientX - cropOffset.x, y: touch.clientY - cropOffset.y });
                                }}
                                onTouchMove={(e) => {
                                    if (!isDraggingCrop) return;
                                    const touch = e.touches[0];
                                    setCropOffset({ x: touch.clientX - dragStart.x, y: touch.clientY - dragStart.y });
                                }}
                                onTouchEnd={() => setIsDraggingCrop(false)}
                                style={{
                                    width: '200px',
                                    height: '200px',
                                    borderRadius: '50%',
                                    overflow: 'hidden',
                                    border: '3px solid var(--accent)',
                                    cursor: 'move',
                                    position: 'relative',
                                    backgroundColor: '#f1f2f4',
                                    boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                                    zIndex: 5
                                }}
                            >
                                <img
                                    src={cropImageSrc}
                                    alt="Cropping source"
                                    style={{
                                        position: 'absolute',
                                        left: '50%',
                                        top: '50%',
                                        transform: `translate(calc(-50% + ${cropOffset.x}px), calc(-50% + ${cropOffset.y}px)) scale(${cropZoom})`,
                                        maxHeight: '100%',
                                        maxWidth: 'none',
                                        userSelect: 'none',
                                        pointerEvents: 'none'
                                    }}
                                />
                            </div>

                            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text)' }}>Zoom</label>
                                <input
                                    type="range"
                                    min="1.0"
                                    max="3.0"
                                    step="0.05"
                                    value={cropZoom}
                                    onChange={(e) => setCropZoom(parseFloat(e.target.value))}
                                    style={{ width: '100%' }}
                                />
                            </div>
                            <small style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center' }}>
                                Drag the photo to center it inside the circle.
                            </small>
                        </div>
                        <div className="modal-footer-buttons" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <button type="button" className="modal-btn primary" onClick={saveCroppedImage}>
                                Apply Crop
                            </button>
                            <button type="button" className="modal-btn cancel" onClick={() => setCropImageSrc(null)}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Other User Profile Card Modal */}
            <AnimatePresence>
                {selectedProfileUsername && (
                    <motion.div 
                        className="nexus-id-overlay"
                        key="nexus-id-pass-modal"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div 
                            className="nexus-id-backdrop" 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            onClick={() => setSelectedProfileUsername(null)} 
                        />
                        <div className="badge-container" onClick={(e) => e.stopPropagation()}>
                            {/* Woven Lanyard */}
                            <motion.div 
                                className="woven-lanyard"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                style={{ 
                                    rotate: lanyardAngle,
                                    height: lanyardHeight,
                                    transformOrigin: "top center"
                                }}
                                transition={{ 
                                    type: "spring",
                                    stiffness: 90,
                                    damping: 15
                                }}
                            >
                                <div className="lanyard-text">
                                    {selectedProfileData ? (selectedProfileData.displayName || selectedProfileData.username).split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : "NX"}
                                </div>
                                <div className="lanyard-metal-loop" />
                            </motion.div>

                            {loadingProfileCard ? (
                                <motion.div 
                                    className="cyber-badge-card"
                                    initial={{ y: -800, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    exit={{ y: -800, opacity: 0 }}
                                    transition={{ type: "spring", stiffness: 90, damping: 15 }}
                                    style={{ justifyContent: 'center', minHeight: '220px' }}
                                >
                                    <div className="cyber-card-grid" />
                                    <div className="emoji-picker-loader" style={{ padding: '48px 0', color: 'var(--accent)', fontFamily: 'monospace', fontSize: '12px', letterSpacing: '1px' }}>
                                        ESTABLISHING SECURE CONNECTION...
                                    </div>
                                </motion.div>
                            ) : profileCardError ? (
                                <motion.div 
                                    className="cyber-badge-card"
                                    initial={{ y: -800, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    exit={{ y: -800, opacity: 0 }}
                                    transition={{ type: "spring", stiffness: 90, damping: 15 }}
                                    style={{ justifyContent: 'center', padding: '24px', textAlign: 'center', minHeight: '200px' }}
                                >
                                    <div className="cyber-card-grid" />
                                    <p style={{ color: 'var(--danger)', fontWeight: 'bold', fontSize: '13px', fontFamily: 'monospace', marginBottom: '20px' }}>
                                        {profileCardError}
                                    </p>
                                    <button className="cyber-badge-btn primary" style={{ width: '120px', height: '36px' }} onClick={() => setSelectedProfileUsername(null)}>CLOSE</button>
                                </motion.div>
                            ) : selectedProfileData ? (
                                <motion.div 
                                    className="cyber-badge-card"
                                    drag
                                    dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                                    dragElastic={1.0}
                                    initial={{ y: -800, rotate: 22, opacity: 0 }}
                                    animate={{ y: 0, rotate: 0, opacity: 1 }}
                                    exit={{ y: -800, rotate: -22, opacity: 0 }}
                                    style={{
                                        x: cardX,
                                        y: cardY,
                                        rotate: cardRotate
                                    }}
                                    transition={{
                                        type: "spring",
                                        stiffness: 90,
                                        damping: 14,
                                        mass: 1.1
                                    }}
                                >
                                    {/* Punched Hole with Chrome Grommet */}
                                    <div className="card-grommet-hole" />
                                    
                                    {/* Corner Bracket Accent Indicators */}
                                    <div className="card-corner-bracket top-left" />
                                    <div className="card-corner-bracket top-right" />
                                    <div className="card-corner-bracket bottom-left" />
                                    <div className="card-corner-bracket bottom-right" />

                                    {/* Carabiner Chrome Clasp (dynamic rotation pointing to the lanyard pivot) */}
                                    <motion.div 
                                        className="chrome-clasp-wrapper"
                                        style={{
                                            rotate: claspRotate,
                                            transformOrigin: "center 38px"
                                        }}
                                    >
                                        <svg width="32" height="48" viewBox="0 0 32 48" fill="none">
                                            <defs>
                                                <linearGradient id="chromeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                                    <stop offset="0%" stopColor="#f8fafc" />
                                                    <stop offset="20%" stopColor="#cbd5e1" />
                                                    <stop offset="40%" stopColor="#475569" />
                                                    <stop offset="60%" stopColor="#cbd5e1" />
                                                    <stop offset="80%" stopColor="#94a3b8" />
                                                    <stop offset="100%" stopColor="#1e293b" />
                                                </linearGradient>
                                            </defs>
                                            {/* Carabiner main hook body */}
                                            <path d="M16 2 C10 2 6 6 6 12 C6 15 8 18 10 20 L10 32 C10 34 12 36 14 36 L18 36 C20 34 22 32 22 30 L22 20 C24 18 26 15 26 12 C26 6 22 2 16 2 Z" fill="url(#chromeGradient)" filter="drop-shadow(0 2px 3px rgba(0,0,0,0.5))" />
                                            {/* Carabiner inner void */}
                                            <path d="M16 6 C13 6 10 8 10 12 C10 14 11 16 13 18 L13 30 C13 31 14 32 15 32 L17 32 C18 32 19 31 19 30 L19 18 C21 16 22 14 22 12 C22 8 19 6 16 6 Z" fill="#030407" />
                                            {/* Security latch wire gate */}
                                            <path d="M10 14 L22 19" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
                                            {/* Grommet anchor ring hook */}
                                            <circle cx="16" cy="38" r="4" fill="#475569" stroke="#94a3b8" strokeWidth="1.5" />
                                        </svg>
                                    </motion.div>

                                    {/* Laser Engraved Tech Grid */}
                                    <div className="cyber-card-grid" />

                                    {/* CARD HEADER SECTION */}
                                    <div className="cyber-card-header" style={{ marginTop: '14px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div className="cyber-logo-text">NEXUS</div>
                                            <div 
                                                style={{ 
                                                    width: '6px', 
                                                    height: '6px', 
                                                    borderRadius: '50%', 
                                                    backgroundColor: selectedProfileData.status === "Online" ? '#10b981' :
                                                                     selectedProfileData.status === "Away" ? '#ffb020' :
                                                                     selectedProfileData.status === "Busy" ? '#ef4444' : '#6b7280',
                                                    boxShadow: selectedProfileData.status === "Online" ? '0 0 8px #10b981' :
                                                               selectedProfileData.status === "Away" ? '0 0 8px #ffb020' :
                                                               selectedProfileData.status === "Busy" ? '0 0 8px #ef4444' : 'none'
                                                }} 
                                            />
                                        </div>
                                        <div className="cyber-barcode">
                                            <span>NEXUS_ID:{selectedProfileData._id?.substring(selectedProfileData._id.length - 8).toUpperCase()}</span>
                                        </div>
                                        <button className="cyber-close-btn" onClick={() => setSelectedProfileUsername(null)}>×</button>
                                    </div>

                                    {/* AVATAR + ACTIVE GLOW ZONE */}
                                    <div className="cyber-avatar-zone">
                                        <div 
                                            className="cyber-avatar-wrapper"
                                            onClick={() => {
                                                if (selectedProfileData.avatar) {
                                                    setFullAvatarUrl(selectedProfileData.avatar);
                                                }
                                            }}
                                            style={{ cursor: selectedProfileData.avatar ? 'zoom-in' : 'default' }}
                                        >
                                            {selectedProfileData.avatar ? (
                                                <img src={selectedProfileData.avatar} alt="Avatar" className="cyber-avatar-img" />
                                            ) : (
                                                <div className="cyber-avatar-placeholder">
                                                    {selectedProfileData.username.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            {/* Neon active presence radar ring */}
                                            <div 
                                                className="cyber-radar-ring" 
                                                style={{ 
                                                    '--radar-color': selectedProfileData.status === "Online" ? '#10b981' :
                                                                     selectedProfileData.status === "Away" ? '#ffb020' :
                                                                     selectedProfileData.status === "Busy" ? '#ef4444' : '#6b7280'
                                                }} 
                                            />
                                        </div>
                                    </div>

                                    {/* USER BRAND DETAILS */}
                                    <div className="cyber-bio-section">
                                        <h2 className="cyber-display-name">
                                            {selectedProfileData.displayName}
                                            {!selectedProfileData.isGuest && (
                                                <svg className="cyber-verify-badge" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                                                </svg>
                                            )}
                                        </h2>
                                        <span className="cyber-username">@{selectedProfileData.username}</span>
                                        <p className="cyber-bio-text" style={{ fontStyle: selectedProfileData.bio ? 'normal' : 'italic' }}>
                                            {selectedProfileData.bio || "No status bio set."}
                                        </p>
                                    </div>

                                    {/* PROFILE STATS GRID */}
                                    <div className="cyber-stats-grid">
                                        <div className="cyber-stat-box">
                                            <small className="cyber-stat-label">TOTAL MESSAGES</small>
                                            <strong className="cyber-stat-value">{selectedProfileData.totalMessagesSent.toLocaleString()}</strong>
                                        </div>
                                        <div className="cyber-stat-box">
                                            <small className="cyber-stat-label">CONNECTIONS</small>
                                            <strong className="cyber-stat-value">{selectedProfileData.friendsCount || 0}</strong>
                                        </div>
                                        <div className="cyber-stat-box">
                                            <small className="cyber-stat-label">STREAK</small>
                                            <strong className="cyber-stat-value streak">
                                                {selectedProfileData.isGuest ? 0 : Math.max(3, (selectedProfileData.totalMessagesSent % 15) + 2)}🔥
                                            </strong>
                                        </div>
                                        <div className="cyber-stat-box">
                                            <small className="cyber-stat-label">JOIN NODE</small>
                                            <strong className="cyber-stat-value" style={{ fontSize: '10px' }}>
                                                {new Date(selectedProfileData.joinDate).toLocaleDateString([], { month: 'short', year: 'numeric' }).toUpperCase()}
                                            </strong>
                                        </div>
                                    </div>

                                    {/* SECURE ENCRYPTED BOTTOM DETAILS */}
                                    <div className="cyber-tech-panel" style={{ marginBottom: '14px' }}>
                                        {/* <div className="cyber-tech-row">
                                            <span>STATUS:</span>
                                            <span 
                                                className="cyber-status-glow"
                                                style={{ 
                                                    '--status-color': selectedProfileData.status === "Online" ? '#10b981' :
                                                                      selectedProfileData.status === "Away" ? '#ffb020' :
                                                                      selectedProfileData.status === "Busy" ? '#ef4444' : '#6b7280'
                                                }}
                                            >
                                                {selectedProfileData.status.toUpperCase()}
                                            </span>
                                        </div> */}
                                        {/* <div className="cyber-tech-row">
                                            <span>ENCRYPTION LEVEL:</span>
                                            <span>AES-GCM-256</span>
                                        </div> */}
                                        {/* <div className="cyber-tech-row">
                                            <span>SECURITY PROTOCOL:</span>
                                            <span>NEXUS SHIELD v3.2</span>
                                        </div> */}
                                        <div className="cyber-tech-row">
                                            <span>USER TRUST SCORE:</span>
                                            <span className="trust-score-glow">
                                                {selectedProfileData.isGuest ? "UNVERIFIED" : `${(95 + (selectedProfileData.totalMessagesSent % 5) + (selectedProfileData.username.length % 2) * 0.4).toFixed(1)}% SECURE`}
                                            </span>
                                        </div>
                                    </div>

                                    {/* TECH ACTION BUTTONS TRAY */}
                                    <div className="cyber-actions-tray" style={{ width: '100%' }}>
                                        {selectedProfileData.isGuest ? (
                                            <div style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '8px', color: 'var(--muted)', fontSize: '10px', textAlign: 'center', fontFamily: 'monospace', letterSpacing: '0.5px', boxSizing: 'border-box' }}>
                                                ACCESS LEVEL: GUEST // CONTROLS SECURED.
                                            </div>
                                        ) : (
                                            <>
                                                <div className="cyber-actions-grid">
                                                    <button 
                                                        onClick={handleStartPrivateChat} 
                                                        disabled={!selectedProfileData.canDM} 
                                                        className="cyber-badge-btn primary"
                                                        title={!selectedProfileData.canDM ? "Private Messaging is restricted by user privacy or block settings." : "Send direct message"}
                                                    >
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                                                        Message
                                                    </button>
                                                    <button 
                                                        onClick={handleFriendToggle} 
                                                        className={`cyber-badge-btn ${selectedProfileData.isFriend ? 'success' : ''}`}
                                                    >
                                                        {selectedProfileData.isFriend ? (
                                                            <>
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="23" y1="11" x2="17" y2="11"></line></svg>
                                                                Remove
                                                            </>
                                                        ) : (
                                                            <>
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
                                                                Connect
                                                            </>
                                                        )}
                                                    </button>
                                                    <button 
                                                        onClick={() => alert("Establishing Secure Encrypted Voice Connection...")} 
                                                        className="cyber-badge-btn"
                                                        title="Establish Secure Voice Call"
                                                    >
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                                        Voice
                                                    </button>
                                                </div>

                                                <div className="cyber-actions-grid" style={{ marginTop: '6px' }}>
                                                    <button 
                                                        onClick={() => alert("Establishing Video Encryption Link...")} 
                                                        className="cyber-badge-btn"
                                                        title="Establish Video Encryption Link"
                                                    >
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7l-7 5 7 5V7z"></path><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                                                        Video
                                                    </button>
                                                    <button 
                                                        onClick={handleBlockToggle} 
                                                        className="cyber-badge-btn danger"
                                                        style={{ color: selectedProfileData.isBlocked ? '#10b981' : '#ef4444', borderColor: selectedProfileData.isBlocked ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)' }}
                                                    >
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                                                        {selectedProfileData.isBlocked ? "Unblock" : "Block"}
                                                    </button>
                                                    <button 
                                                        onClick={() => setShowReportForm(v => !v)} 
                                                        className="cyber-badge-btn danger"
                                                    >
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                                                        Report
                                                    </button>
                                                </div>

                                                {showReportForm && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '10px', borderRadius: '8px', marginTop: '6px', width: '100%', boxSizing: 'border-box' }}>
                                                        <label style={{ fontSize: '9px', fontWeight: 'bold', color: '#fca5a5', fontFamily: 'monospace' }}>REASON FOR REPORTING</label>
                                                        <input 
                                                            type="text" 
                                                            placeholder="Enter security incident details..." 
                                                            value={reportReason} 
                                                            onChange={(e) => setReportReason(e.target.value)} 
                                                            style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '11px', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }}
                                                        />
                                                        <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                                                            <button type="button" onClick={handleReportUser} disabled={!reportReason.trim()} className="cyber-badge-btn danger" style={{ flex: 1, height: '26px', fontSize: '10px' }}>
                                                                SUBMIT REPORT
                                                            </button>
                                                            <button type="button" onClick={() => { setShowReportForm(false); setReportReason(""); }} className="cyber-badge-btn" style={{ flex: 1, height: '26px', fontSize: '10px' }}>
                                                                CANCEL
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </motion.div>
                            ) : null}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Full Avatar Viewer Modal */}
            <AnimatePresence>
                {fullAvatarUrl && (
                    <motion.div 
                        className="full-avatar-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setFullAvatarUrl(null)}
                    >
                        <motion.div 
                            className="full-avatar-close"
                            onClick={() => setFullAvatarUrl(null)}
                        >
                            ×
                        </motion.div>
                        <motion.img 
                            src={fullAvatarUrl} 
                            alt="Full Profile" 
                            className="full-avatar-image"
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 300, damping: 25 }}
                            onClick={(e) => e.stopPropagation()}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Online Members List Modal */}
            {showOnlineList && (
                <div className="modal-overlay" onClick={() => setShowOnlineList(false)}>
                    <div className="modal-content online-members-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(90%, 360px)', padding: '20px' }}>
                        <div className="modal-header-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>Online Members</h3>
                            <button className="close-picker-btn" onClick={() => setShowOnlineList(false)} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer' }}>×</button>
                        </div>
                        <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                            {onlineUserList.map(user => {
                                const isCurrentUser = user.username === username;
                                return (
                                    <div 
                                        key={user.username} 
                                        onClick={() => {
                                            setShowOnlineList(false);
                                            if (isCurrentUser) {
                                                if (isGuest) {
                                                    setShowProfileSettings(true);
                                                } else {
                                                    openOwnProfileSettings();
                                                }
                                            } else {
                                                setSelectedProfileUsername(user.username);
                                            }
                                        }}
                                        className="online-member-row"
                                        style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'space-between', 
                                            padding: '8px 10px', 
                                            borderRadius: '8px', 
                                            cursor: 'pointer', 
                                            transition: 'background 0.2s' 
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                            <div style={{ position: 'relative', display: 'flex' }}>
                                                {user.avatar ? (
                                                    <img src={user.avatar} alt={user.username} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                                                ) : (
                                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #c8eeff, #bff7f2)', color: 'var(--accent-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '800' }}>
                                                        {user.username.charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                                <span className={`sidebar-online-dot ${
                                                    user.role === "guest" ? "guest-dot" :
                                                    user.status === "Online" ? "" :
                                                    user.status === "Away" ? "away" :
                                                    user.status === "Busy" ? "busy" : "offline"
                                                }`} style={{ position: 'absolute', bottom: '-1px', right: '-1px', width: '9px', height: '9px', border: '1.5px solid #fff' }} />
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                                <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {user.displayName || user.username}
                                                    {isCurrentUser && <span style={{ marginLeft: '4px', fontSize: '10px', color: 'var(--muted)', fontWeight: 'bold' }}>(You)</span>}
                                                </span>
                                                <span style={{ fontSize: '11px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    @{user.username} {user.role === "guest" && "[Guest]"}
                                                </span>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '11px', fontWeight: '700', color: 
                                            user.status === "Online" ? '#17d67e' :
                                            user.status === "Away" ? '#ffb020' :
                                            user.status === "Busy" ? '#ef4444' : '#6b7280'
                                        }}>
                                            {user.status || "Online"}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Chat;
