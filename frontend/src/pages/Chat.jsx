import React, { useState, useEffect, useRef, Suspense } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { io } from "socket.io-client";

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

    // Avatar Canvas Cropper states
    const [cropImageSrc, setCropImageSrc] = useState(null);
    const [cropZoom, setCropZoom] = useState(1.0);
    const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
    const [isDraggingCrop, setIsDraggingCrop] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const messagesEndRef = useRef(null);
    const socketRef = useRef(null);
    const typingTimeoutRef = useRef(null);

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
            setTypingUser(typingData);
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
            typingTimeoutRef.current = setTimeout(() => {
                setTypingUser(null);
            }, 1500);
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
        socketRef.current?.emit("joinRoom", room);
    }

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
    }

    function emitTyping(value) {
        setMessage(value);
        if (!username) return;
        socketRef.current?.emit("typing", {
            room: activeRoom,
            privateChatId: activePrivate
        });
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
        canvas.width = 150;
        canvas.height = 150;
        
        const img = new Image();
        img.src = cropImageSrc;
        img.onload = () => {
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, 150, 150);

            const viewSize = 150;
            let drawWidth = img.width;
            let drawHeight = img.height;
            const imgRatio = img.width / img.height;

            if (imgRatio > 1) {
                drawHeight = viewSize;
                drawWidth = viewSize * imgRatio;
            } else {
                drawWidth = viewSize;
                drawHeight = viewSize / imgRatio;
            }

            const x = (viewSize - drawWidth * cropZoom) / 2 + cropOffset.x;
            const y = (viewSize - drawHeight * cropZoom) / 2 + cropOffset.y;

            ctx.drawImage(img, x, y, drawWidth * cropZoom, drawHeight * cropZoom);

            const compressedBase64 = canvas.toDataURL("image/jpeg", 0.85);
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
            {selectedProfileUsername && (
                <div className="modal-overlay" onClick={() => setSelectedProfileUsername(null)}>
                    <div className="modal-content other-user-profile-card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(90%, 350px)', padding: '0', overflow: 'hidden', border: 'none', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>
                        {loadingProfileCard ? (
                            <div className="emoji-picker-loader" style={{ padding: '48px 0' }}>Loading Profile...</div>
                        ) : profileCardError ? (
                            <div style={{ padding: '24px', textAlign: 'center' }}>
                                <p style={{ color: 'var(--danger)', fontWeight: 'bold' }}>{profileCardError}</p>
                                <button className="modal-btn secondary" onClick={() => setSelectedProfileUsername(null)}>Close</button>
                            </div>
                        ) : selectedProfileData ? (
                            <div style={{ position: 'relative' }}>
                                <div style={{ height: '70px', background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))', position: 'relative' }}>
                                    <button 
                                        onClick={() => setSelectedProfileUsername(null)} 
                                        style={{ position: 'absolute', top: '10px', right: '12px', border: 'none', background: 'rgba(0,0,0,0.2)', color: 'white', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 'bold' }}
                                    >
                                        ×
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '-45px', padding: '0 24px 24px 24px' }}>
                                    <div style={{ width: '90px', height: '90px', borderRadius: '50%', border: '4px solid #fff', overflow: 'hidden', boxShadow: '0 8px 16px rgba(0,0,0,0.1)', background: '#fff', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {selectedProfileData.avatar ? (
                                            <img src={selectedProfileData.avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #c8eeff, #bff7f2)', color: 'var(--accent-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: '800' }}>
                                                {selectedProfileData.username.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                        <span 
                                            className={`sidebar-online-dot ${
                                                selectedProfileData.status === "Online" ? "" :
                                                selectedProfileData.status === "Away" ? "away" :
                                                selectedProfileData.status === "Busy" ? "busy" : "offline"
                                            }`} 
                                            style={{ position: 'absolute', bottom: '4px', right: '4px', border: '2px solid #fff', width: '10px', height: '10px' }} 
                                        />
                                    </div>

                                    <h3 style={{ margin: '12px 0 2px 0', fontSize: '20px', fontWeight: '800', color: 'var(--text)' }}>
                                        {selectedProfileData.displayName}
                                    </h3>
                                    <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: '500' }}>
                                        @{selectedProfileData.username}
                                    </span>

                                    <p style={{ margin: '14px 0', fontSize: '13px', color: '#4b5563', textAlign: 'center', fontStyle: selectedProfileData.bio ? 'normal' : 'italic', lineHeight: '1.4' }}>
                                        {selectedProfileData.bio || "No status bio set."}
                                    </p>

                                    <div style={{ width: '100%', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '10px', margin: '6px 0 16px 0', gap: '8px' }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 'bold' }}>MESSAGES</div>
                                            <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text)' }}>{selectedProfileData.totalMessagesSent.toLocaleString()}</div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 'bold' }}>JOINED</div>
                                            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text)', marginTop: '2px' }}>
                                                {new Date(selectedProfileData.joinDate).toLocaleDateString([], { month: 'short', year: 'numeric' })}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', marginBottom: '18px', width: '100%', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '700' }}>
                                            <span style={{ height: '8px', width: '8px', borderRadius: '50%', backgroundColor: 
                                                selectedProfileData.status === "Online" ? '#17d67e' :
                                                selectedProfileData.status === "Away" ? '#ffb020' :
                                                selectedProfileData.status === "Busy" ? '#ef4444' : '#6b7280'
                                            }} />
                                            <span>
                                                {selectedProfileData.status === "Online" ? "Online" :
                                                 selectedProfileData.status === "Away" ? "Away" :
                                                 selectedProfileData.status === "Busy" ? "Busy" : "Offline"}
                                            </span>
                                        </div>
                                        {selectedProfileData.status === "Offline" && selectedProfileData.lastSeen && (
                                            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                                Last seen: {new Date(selectedProfileData.lastSeen).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                                            </span>
                                        )}
                                    </div>

                                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button 
                                                onClick={handleStartPrivateChat} 
                                                disabled={!selectedProfileData.canDM} 
                                                className="modal-btn primary" 
                                                style={{ flex: 1, minHeight: '36px' }}
                                                title={!selectedProfileData.canDM ? "Private Messaging is restricted by user privacy or block settings." : "Send direct message"}
                                            >
                                                Message
                                            </button>
                                            <button 
                                                onClick={handleBlockToggle} 
                                                className={`modal-btn ${selectedProfileData.isBlocked ? 'secondary' : 'cancel'}`} 
                                                style={{ flex: 1, minHeight: '36px', border: selectedProfileData.isBlocked ? '1px solid #cbd5e1' : 'none' }}
                                            >
                                                {selectedProfileData.isBlocked ? "Unblock" : "Block"}
                                            </button>
                                        </div>
                                        
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button 
                                                onClick={handleFriendToggle} 
                                                className="modal-btn secondary" 
                                                style={{ flex: 1, minHeight: '36px', border: '1px solid #cbd5e1' }}
                                            >
                                                {selectedProfileData.isFriend ? "Remove Friend" : "Add Friend"}
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    navigator.clipboard.writeText(selectedProfileData._id);
                                                    alert("User ID copied to clipboard!");
                                                }} 
                                                className="modal-btn secondary" 
                                                style={{ flex: 1, minHeight: '36px', border: '1px solid #cbd5e1' }}
                                            >
                                                Copy ID
                                            </button>
                                        </div>

                                        <button 
                                            onClick={() => setShowReportForm(v => !v)} 
                                            className="modal-btn secondary" 
                                            style={{ minHeight: '36px', border: '1px solid #cbd5e1', color: 'var(--danger)' }}
                                        >
                                            Report User
                                        </button>

                                        {showReportForm && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#fef2f2', border: '1px solid #fecaca', padding: '10px', borderRadius: '8px', marginTop: '4px', animation: 'slideDownAlert 0.2s ease-out' }}>
                                                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#991b1b' }}>Reason for Reporting</label>
                                                <input 
                                                    type="text" 
                                                    placeholder="Enter reason..." 
                                                    value={reportReason} 
                                                    onChange={(e) => setReportReason(e.target.value)} 
                                                    style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #fca5a5', fontSize: '12px' }}
                                                />
                                                <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                                                    <button type="button" onClick={handleReportUser} disabled={!reportReason.trim()} className="modal-btn danger" style={{ minHeight: '26px', fontSize: '11px', padding: '0 8px' }}>
                                                        Submit Report
                                                    </button>
                                                    <button type="button" onClick={() => { setShowReportForm(false); setReportReason(""); }} className="modal-btn secondary" style={{ minHeight: '26px', fontSize: '11px', padding: '0 8px', border: '1px solid #cbd5e1' }}>
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            )}
        </div>
    );
}

export default Chat;
