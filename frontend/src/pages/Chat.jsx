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
import { initTheme, toggleTheme } from "../utils/theme";
import { SmoothInput } from "../components/SmoothInput";
import { FiLock } from "react-icons/fi";

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

    const usernameRef = useRef(username);
    useEffect(() => {
        usernameRef.current = username;
    }, [username]);

    const [theme, setTheme] = useState("light");
    const [unreadCounts, setUnreadCounts] = useState({});

    useEffect(() => {
        setTheme(initTheme());
    }, []);

    function handleThemeToggle() {
        setTheme(toggleTheme());
    }

    const [message, setMessage] = useState("");
    const [messages, setMessages] = useState([]);
    const [typingUser, setTypingUser] = useState("");
    const [onlineUsers, setOnlineUsers] = useState(0);
    const [onlineUserList, setOnlineUserList] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [conversationUsers, setConversationUsers] = useState([]);

    const [activeRoom, setActiveRoom] = useState("General chat");
    const [activePrivate, setActivePrivate] = useState(null); // privateChatId
    const [activePrivateName, setActivePrivateName] = useState(""); // other username
    const [editingMsg, setEditingMsg] = useState(null); // { _id, text }
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [activeReactionMsgId, setActiveReactionMsgId] = useState(null); // Msg ID for custom reaction picker
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [blockTargetConfirm, setBlockTargetConfirm] = useState(null); // { username, source }
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

    // Custom Private Rooms states
    const [customRooms, setCustomRooms] = useState([]);
    const [customRoomsLoading, setCustomRoomsLoading] = useState(true);
    const [showCreateJoinModal, setShowCreateJoinModal] = useState(false);
    const [activeSidebarTab, setActiveSidebarTab] = useState("rooms"); // "rooms" or "dms"
    const [activeModalTab, setActiveModalTab] = useState("create"); // "create" or "join"
    const [codeArray, setCodeArray] = useState(Array(6).fill(""));
    const [activeRoomDetails, setActiveRoomDetails] = useState(null); // { name, code, admin, members, isPrivate }
    const [createRoomName, setCreateRoomName] = useState("");
    const [joinCode, setJoinCode] = useState("");
    const [joinError, setJoinError] = useState("");

    // Framer Motion Values for interactive dragging and physical lanyard updates
    const cardX = useMotionValue(0);
    const cardY = useMotionValue(0);
    
    // Capture horizontal velocity to simulate realistic drag-induced rotation
    const xVelocity = useVelocity(cardX);
    const cardRotate = useTransform(xVelocity, [-2000, 2000], [-12, 12]);
    
    // Calculate woven lanyard tilt angle and vertical stretch dynamically
    const lanyardAngle = useTransform([cardX, cardY], ([cx, cy]) => {
        const targetY = 90 + cy;
        if (targetY <= 0) return 0;
        // Invert rotation sign so the bottom of the lanyard follows card offset coordinates correctly
        return -Math.atan2(cx, targetY) * (180 / Math.PI);
    });
    const lanyardHeight = useTransform([cardX, cardY], ([cx, cy]) => {
        const targetY = 90 + cy;
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
    const [cropImgRatio, setCropImgRatio] = useState(1.0);
    const [cropTarget, setCropTarget] = useState("ownProfile"); // "ownProfile" | "createRoom" | "editRoom"
    const [createRoomAvatar, setCreateRoomAvatar] = useState("");
    const [editRoomAvatar, setEditRoomAvatar] = useState("");
    const [editRoomName, setEditRoomName] = useState("");
    const [showEditRoomModal, setShowEditRoomModal] = useState(false);

    // Message Delete and Undo states
    const [deleteConfirmModal, setDeleteConfirmModal] = useState({
        isOpen: false,
        messageId: null,
        deleteFor: 'me',
        hasFile: false,
        deleteFileFromServer: true
    });
    const [undoDeleteInfo, setUndoDeleteInfo] = useState(null);
    const deleteTimeoutRef = useRef(null);

    // Notification states and refs
    const [notificationActive, setNotificationActive] = useState(false);
    const [activeToast, setActiveToast] = useState(null);
    const glowTimeoutRef = useRef(null);
    const toastTimeoutRef = useRef(null);

    const socketRef = useRef(null);
    const messagesEndRef = useRef(null);
    const typingTimeoutRef = useRef(null);
    const activeRoomRef = useRef(activeRoom);
    const activePrivateRef = useRef(activePrivate);
    const activePrivateNameRef = useRef(activePrivateName);

    useEffect(() => {
        activeRoomRef.current = activeRoom;
    }, [activeRoom]);

    useEffect(() => {
        activePrivateRef.current = activePrivate;
    }, [activePrivate]);

    useEffect(() => {
        activePrivateNameRef.current = activePrivateName;
    }, [activePrivateName]);

    const allUsersRef = useRef(allUsers);
    useEffect(() => {
        allUsersRef.current = allUsers;
    }, [allUsers]);

    // Notification permission hook
    useEffect(() => {
        if (typeof window !== "undefined" && "Notification" in window) {
            if (Notification.permission === "default") {
                Notification.requestPermission();
            }
        }
    }, []);

    // Helper to synthesize a premium dual-tone chime pluck
    const playNotificationSound = () => {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            const ctx = new AudioContextClass();
            
            // Tone 1: C5 (523.25 Hz)
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = "sine";
            osc1.frequency.setValueAtTime(523.25, ctx.currentTime);
            
            gain1.gain.setValueAtTime(0.12, ctx.currentTime);
            gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
            
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            
            // Tone 2: G5 (783.99 Hz) with a slight delay
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = "sine";
            osc2.frequency.setValueAtTime(783.99, ctx.currentTime + 0.08);
            
            gain2.gain.setValueAtTime(0, ctx.currentTime);
            gain2.gain.setValueAtTime(0.1, ctx.currentTime + 0.08);
            gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
            
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            
            osc1.start(ctx.currentTime);
            osc1.stop(ctx.currentTime + 0.35);
            
            osc2.start(ctx.currentTime + 0.08);
            osc2.stop(ctx.currentTime + 0.45);
        } catch (err) {
            console.warn("Chime generation failed", err);
        }
    };

    const triggerPageGlow = () => {
        setNotificationActive(true);
        if (glowTimeoutRef.current) {
            clearTimeout(glowTimeoutRef.current);
        }
        glowTimeoutRef.current = setTimeout(() => {
            setNotificationActive(false);
        }, 3600);
    };

    const triggerDesktopNotification = (data) => {
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            const bodyText = data.text || "Sent an attachment";
            const senderName = data.displayName || data.username;
            const title = data.room ? `New message in #${data.room}` : `New message from ${senderName}`;
            const notification = new Notification(title, {
                body: `${senderName}: ${bodyText}`,
                icon: "/favicon.ico"
            });
            notification.onclick = () => {
                window.focus();
                if (data.privateChatId) {
                    const parts = data.privateChatId.split("_");
                    const partnerUsername = parts.find(u => u.toLowerCase() !== usernameRef.current.toLowerCase());
                    if (partnerUsername) {
                        selectPrivate(data.privateChatId, partnerUsername);
                    }
                } else if (data.room) {
                    selectRoom(data.room);
                }
                notification.close();
            };
        }
    };

    useEffect(() => {
        if (isGuest || !username) return;
        
        async function fetchUserData() {
            const token = getAuthToken();
            if (!token) return;
            try {
                const [usersRes, convsRes, profileRes] = await Promise.all([
                    fetch(`${getBackendUrl()}/api/users`, {
                        headers: { "Authorization": `Bearer ${token}` }
                    }),
                    fetch(`${getBackendUrl()}/api/users/conversations`, {
                        headers: { "Authorization": `Bearer ${token}` }
                    }),
                    fetch(`${getBackendUrl()}/api/user/profile/${username}`, {
                        headers: { "Authorization": `Bearer ${token}` }
                    })
                ]);
                
                if (usersRes.ok) {
                    const usersData = await usersRes.json();
                    setAllUsers(usersData);
                }
                if (convsRes.ok) {
                    const convsData = await convsRes.json();
                    setConversationUsers(convsData);
                }
                if (profileRes.ok) {
                    const profileData = await profileRes.json();
                    setOwnProfileData(profileData);
                }
            } catch (err) {
                console.error("Error fetching user list or conversations:", err);
            }
        }
        
        fetchUserData();
    }, [username, isGuest]);

    useEffect(() => {
        if (!socketRef.current) return;
        if (activePrivate) {
            socketRef.current.emit("joinPrivateChat", { otherUsername: activePrivateName });
        } else if (activeRoom) {
            socketRef.current.emit("joinRoom", activeRoom);
        }
    }, [activeRoom, activePrivate, activePrivateName]);

    useEffect(() => {
        const token = getAuthToken();
        if (!token) {
            const params = new URLSearchParams(window.location.search);
            const code = params.get("joinRoomCode");
            if (code) {
                sessionStorage.setItem("pendingJoinCode", code);
            }
            navigate("/login");
            return;
        }

        const newSocket = io(getBackendUrl(), { auth: { token } });
        socketRef.current = newSocket;

        newSocket.on("connect", () => {
            console.log("Socket connected/reconnected. Re-joining active chat room...");
            newSocket.emit("fetchCustomRooms");

            const currentParams = new URLSearchParams(window.location.search);
            const inviteCode = currentParams.get("joinRoomCode");
            const pendingCode = sessionStorage.getItem("pendingJoinCode");

            if (inviteCode) {
                newSocket.emit("joinRoomByCode", inviteCode);
                const url = new URL(window.location);
                url.searchParams.delete("joinRoomCode");
                window.history.replaceState({}, document.title, url.toString());
            } else if (pendingCode) {
                newSocket.emit("joinRoomByCode", pendingCode);
                sessionStorage.removeItem("pendingJoinCode");
            } else {
                const privateUrl = currentParams.get("private");
                const roomUrl = currentParams.get("room");

                if (privateUrl) {
                    newSocket.emit("joinPrivateChat", { otherUsername: privateUrl });
                } else if (roomUrl) {
                    newSocket.emit("joinRoom", roomUrl);
                } else if (activePrivateRef.current && activePrivateNameRef.current) {
                    newSocket.emit("joinPrivateChat", { otherUsername: activePrivateNameRef.current });
                } else if (activeRoomRef.current) {
                    newSocket.emit("joinRoom", activeRoomRef.current);
                } else {
                    newSocket.emit("joinRoom", "General chat");
                }
            }
        });

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

        newSocket.on("oldMessages", (data) => {
            const msgs = Array.isArray(data) ? data : (data.messages || []);
            const room = data.room;
            const privateChatId = data.privateChatId;

            if (privateChatId) {
                if (activePrivateRef.current?.toLowerCase() === privateChatId?.toLowerCase()) {
                    setMessages(msgs);
                }
            } else if (room) {
                if (activeRoomRef.current === room) {
                    setMessages(msgs);
                }
            } else {
                setMessages(msgs);
            }
        });

        newSocket.on("unreadCounts", (counts) => {
            const normalized = {};
            if (counts) {
                Object.keys(counts).forEach(k => {
                    const normalizedKey = k.includes("_") ? k.toLowerCase() : k;
                    normalized[normalizedKey] = counts[k];
                });
            }
            setUnreadCounts(normalized);
        });

        newSocket.on("reply", (data) => {
            if (data.privateChatId) {
                const parts = data.privateChatId.split("_");
                const partnerUsername = parts.find(u => u.toLowerCase() !== usernameRef.current.toLowerCase());
                if (partnerUsername) {
                    setConversationUsers((prev) => {
                        const lowerPartner = partnerUsername.toLowerCase();
                        const index = prev.findIndex(u => u.username?.toLowerCase() === lowerPartner);
                        if (index !== -1) {
                            const updated = [...prev];
                            const [targetUser] = updated.splice(index, 1);
                            return [targetUser, ...updated];
                        } else {
                            const userObj = allUsersRef.current.find(u => u.username?.toLowerCase() === lowerPartner);
                            if (userObj) {
                                return [userObj, ...prev];
                            } else {
                                return [{ username: partnerUsername, displayName: partnerUsername, status: "Offline" }, ...prev];
                            }
                        }
                    });
                }
            }

            const isMatch = data.privateChatId
                ? (activePrivateRef.current?.toLowerCase() === data.privateChatId?.toLowerCase())
                : (activeRoomRef.current === data.room);

            if (isMatch) {
                setMessages((prev) => {
                    if (prev.some(m => m._id === data._id)) return prev;
                    return [...prev, data];
                });
            } else {
                if (data.username?.toLowerCase() !== usernameRef.current?.toLowerCase()) {
                    setUnreadCounts((prev) => {
                        const key = data.privateChatId?.toLowerCase() || data.room;
                        if (!key) return prev;
                        return {
                            ...prev,
                            [key]: (prev[key] || 0) + 1
                        };
                    });
                }
            }

            // Trigger notification glow, chime sound, toast, and native push if from another user
            if (data.username?.toLowerCase() !== usernameRef.current?.toLowerCase()) {
                triggerPageGlow();
                playNotificationSound();

                if (!isMatch) {
                    const displayName = data.displayName || data.username;
                    const chatType = data.privateChatId ? "private" : "room";
                    
                    let partnerUsername = data.username;
                    if (data.privateChatId) {
                        const parts = data.privateChatId.split("_");
                        const partner = parts.find(u => u.toLowerCase() !== usernameRef.current.toLowerCase());
                        if (partner) {
                            partnerUsername = partner;
                        }
                    }

                    setActiveToast({
                        id: data._id || Date.now(),
                        sender: displayName,
                        senderUsername: partnerUsername,
                        text: data.text || "Sent an attachment",
                        avatarUrl: data.avatarUrl || data.senderAvatar,
                        room: data.room,
                        privateChatId: data.privateChatId,
                        chatType
                    });

                    if (toastTimeoutRef.current) {
                        clearTimeout(toastTimeoutRef.current);
                    }
                    toastTimeoutRef.current = setTimeout(() => {
                        setActiveToast(null);
                    }, 5000);
                }

                if (document.hidden) {
                    triggerDesktopNotification(data);
                }
            }
        });

        newSocket.on("typing", (typingData) => {
            if (!typingData || !typingData.username) return;
            const isMatch = typingData.privateChatId
                ? (activePrivateRef.current?.toLowerCase() === typingData.privateChatId?.toLowerCase())
                : (activeRoomRef.current === typingData.room);
            if (!isMatch) return;

            setTypingUser(typingData);
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
            typingTimeoutRef.current = setTimeout(() => {
                setTypingUser(null);
            }, 3000);
        });

        newSocket.on("stopTyping", (data) => {
            if (data && data.username) {
                const isMatch = data.privateChatId
                    ? (activePrivateRef.current?.toLowerCase() === data.privateChatId?.toLowerCase())
                    : (activeRoomRef.current === data.room);
                if (isMatch) {
                    setTypingUser(prev => (prev && prev.username?.toLowerCase() === data.username?.toLowerCase()) ? null : prev);
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

        newSocket.on("customRoomsList", (rooms) => {
            setCustomRooms(rooms);
            setCustomRoomsLoading(false);
        });

        newSocket.on("roomCreatedSuccess", (room) => {
            setCustomRooms(prev => {
                if (prev.some(r => r.code === room.code)) return prev;
                return [room, ...prev];
            });
            setActiveRoom(room.name);
            setActiveRoomDetails(room);
            setActivePrivate(null);
            setActivePrivateName("");
            setMessages([]);
            setCreateRoomName("");
            setCreateRoomAvatar("");
            setCodeArray(Array(6).fill(""));
            setActiveModalTab("create");
            setShowCreateJoinModal(false);
            setSearchParams({ room: room.name });
        });

        newSocket.on("joinSuccess", ({ room, customRoomsList }) => {
            setCustomRooms(customRoomsList);
            setActiveRoom(room.name);
            setActiveRoomDetails(room);
            setActivePrivate(null);
            setActivePrivateName("");
            setMessages([]);
            setJoinError("");
            setJoinCode("");
            setCodeArray(Array(6).fill(""));
            setActiveModalTab("create");
            setShowCreateJoinModal(false);
            setSearchParams({ room: room.name });
        });

        newSocket.on("joinError", (err) => {
            setJoinError(err);
        });

        newSocket.on("roomDeleted", ({ roomName }) => {
            if (activeRoomRef.current === roomName) {
                alert(`The private room #${roomName} has been deleted by the admin.`);
                setSearchParams({ room: "General chat" });
                setActiveRoom("General chat");
                setActiveRoomDetails(null);
                setActivePrivate(null);
                setActivePrivateName("");
                setMessages([]);
            }
        });

        newSocket.on("roomMemberUpdate", (room) => {
            if (activeRoomRef.current === room.name) {
                setActiveRoomDetails(room);
            }
            setCustomRooms(prev => prev.map(r => r.code === room.code ? room : r));
        });

        newSocket.on("roomRenamed", ({ oldName, newName, room }) => {
            setCustomRooms(prev => prev.map(r => r.code === room.code ? room : r));
            if (activeRoomRef.current === oldName) {
                alert(`The private room #${oldName} has been renamed to #${newName}.`);
                setActiveRoom(newName);
                setActiveRoomDetails(room);
                setSearchParams({ room: newName });
            }
        });

        newSocket.on("activeRoomDetails", (room) => {
            setActiveRoomDetails(room);
            if (room && room.isPrivate) {
                setCustomRooms(prev => prev.map(r => r.code === room.code ? room : r));
            }
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
                setActiveRoom("General chat");
                setActivePrivate(null);
                setActiveSidebarTab("rooms");
            } else {
                setActiveRoom("General chat");
                setActivePrivate(null);
                setActiveSidebarTab("rooms");
            }
        } else {
            // Normal user session restoration
            if (privateUrl) {
                const currentU = parseJWT(token)?.username || "";
                if (currentU) {
                    const pChatId = [currentU.toLowerCase(), privateUrl.toLowerCase()].sort().join("_");
                    setActiveRoom(null);
                    setActivePrivate(pChatId);
                    setActivePrivateName(privateUrl);
                    setActiveSidebarTab("dms");
                }
            } else {
                setSearchParams({ room: roomUrl });
                setActiveRoom(roomUrl);
                setActivePrivate(null);
                setActiveSidebarTab("rooms");
            }
        }

        return () => {
            newSocket.disconnect();
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
            if (glowTimeoutRef.current) {
                clearTimeout(glowTimeoutRef.current);
            }
            if (toastTimeoutRef.current) {
                clearTimeout(toastTimeoutRef.current);
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



    function selectRoom(room) {
        if (isGuest && room !== "General chat") {
            setShowLoginModal(true);
            return;
        }
        setActiveSidebarTab("rooms");
        setSearchParams({ room });
        setActiveRoom(room);
        setActivePrivate(null);
        setActivePrivateName("");
        setMessages([]);
        setSidebarOpen(false);
        setTypingUser(null);
        setUnreadCounts(prev => ({ ...prev, [room]: 0 }));
        socketRef.current?.emit("joinRoom", room);
    }

    // Join direct private message conversation
    function selectPrivate(privateChatId, otherUsername) {
        if (isGuest) {
            setShowLoginModal(true);
            return;
        }
        setActiveSidebarTab("dms");
        setSearchParams({ private: otherUsername });
        setActivePrivate(privateChatId);
        setActivePrivateName(otherUsername);
        setActiveRoom(null);
        setMessages([]);
        setSidebarOpen(false);
        setTypingUser(null);
        setUnreadCounts(prev => {
            const next = { ...prev };
            const lowerId = privateChatId.toLowerCase();
            Object.keys(next).forEach(k => {
                if (k.toLowerCase() === lowerId) {
                    next[k] = 0;
                }
            });
            next[privateChatId] = 0;
            return next;
        });
        socketRef.current?.emit("joinPrivateChat", { otherUsername });
    }

    // Custom Private Rooms Submit Handlers
    const handleCreateRoomSubmit = (e) => {
        e.preventDefault();
        if (!createRoomName.trim()) return;
        socketRef.current?.emit("createRoom", {
            name: createRoomName.trim(),
            avatar: createRoomAvatar || ""
        });
    };

    const handleEditRoomSubmit = (e) => {
        e.preventDefault();
        if (!activeRoomDetails) return;
        socketRef.current?.emit("editRoom", {
            roomId: activeRoomDetails._id,
            name: editRoomName.trim(),
            avatar: editRoomAvatar || ""
        });
        setShowEditRoomModal(false);
    };

    const handleJoinRoomSubmit = (e) => {
        e.preventDefault();
        if (joinCode.trim().length !== 6) return;
        socketRef.current?.emit("joinRoomByCode", joinCode.trim());
    };

    const handleDigitChange = (index, value) => {
        const cleanValue = value.replace(/[^0-9]/g, "");
        if (!cleanValue && value !== "") return;

        const newArray = [...codeArray];
        newArray[index] = cleanValue;
        setCodeArray(newArray);

        if (cleanValue && index < 5) {
            const nextInput = document.getElementById(`digit-input-${index + 1}`);
            nextInput?.focus();
        }

        const fullCode = newArray.join("");
        if (fullCode.length === 6) {
            socketRef.current?.emit("joinRoomByCode", fullCode);
        }
    };

    const handleDigitKeyDown = (index, e) => {
        if (e.key === "Backspace") {
            if (!codeArray[index] && index > 0) {
                const prevInput = document.getElementById(`digit-input-${index - 1}`);
                prevInput?.focus();
                const newArray = [...codeArray];
                newArray[index - 1] = "";
                setCodeArray(newArray);
                e.preventDefault();
            } else if (codeArray[index]) {
                const newArray = [...codeArray];
                newArray[index] = "";
                setCodeArray(newArray);
                e.preventDefault();
            }
        } else if (e.key === "ArrowLeft" && index > 0) {
            document.getElementById(`digit-input-${index - 1}`)?.focus();
        } else if (e.key === "ArrowRight" && index < 5) {
            document.getElementById(`digit-input-${index + 1}`)?.focus();
        } else if (e.key === "Enter") {
            const fullCode = codeArray.join("");
            if (fullCode.length === 6) {
                socketRef.current?.emit("joinRoomByCode", fullCode);
            }
        } else if (!/[0-9]/.test(e.key) && e.key !== "Tab" && e.key !== "Delete") {
            e.preventDefault();
        }
    };

    const handlePaste = (e) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData("text").trim();
        if (/^\d{6}$/.test(pastedData)) {
            const digits = pastedData.split("");
            setCodeArray(digits);
            socketRef.current?.emit("joinRoomByCode", pastedData);
            document.getElementById("digit-input-5")?.focus();
        }
    };

    const handleLeaveRoom = () => {
        if (!activeRoom || !activeRoomDetails) return;
        const isAdmin = activeRoomDetails.admin?._id === ownProfileData?._id || activeRoomDetails.admin?.username === username;
        const confirmMsg = isAdmin 
            ? `Are you sure you want to delete the private room "${activeRoom}"? This will delete the room and disconnect all members.`
            : `Are you sure you want to leave the private room "${activeRoom}"?`;
            
        if (window.confirm(confirmMsg)) {
            socketRef.current?.emit("leaveRoom", activeRoom);
        }
    };


    function sendMessage(attachment = null) {
        if (!username || !socketRef.current) return;

        // Guard against event objects passed via event listeners (e.g. onClick)
        const isEvent = attachment && (
            attachment.nativeEvent || 
            attachment instanceof Event || 
            (typeof attachment === "object" && "target" in attachment && "preventDefault" in attachment)
        );
        const realAttachment = isEvent ? null : attachment;

        if (!realAttachment && !message.trim()) return;

        console.log("DEBUG SENDING MESSAGE:", message);
        const msgData = realAttachment ? { ...realAttachment } : { text: message };
        if (activePrivate) {
            msgData.privateChatId = activePrivate;
        } else {
            msgData.room = activeRoom;
        }

        socketRef.current.emit("message", msgData);
        if (!realAttachment) {
            setMessage("");
        }
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
        // Intercept delete and trigger warning modal
        const msg = messages.find(m => m._id === messageId);
        setDeleteConfirmModal({
            isOpen: true,
            messageId,
            deleteFor,
            hasFile: !!(msg && msg.fileUrl),
            deleteFileFromServer: true
        });
    }

    const cancelDeleteRequest = () => {
        setDeleteConfirmModal({
            isOpen: false,
            messageId: null,
            deleteFor: 'me',
            hasFile: false,
            deleteFileFromServer: true
        });
    };

    const confirmDelete = () => {
        const { messageId, deleteFor, deleteFileFromServer } = deleteConfirmModal;
        const originalMsg = messages.find(m => m._id === messageId);

        // Close modal
        setDeleteConfirmModal({
            isOpen: false,
            messageId: null,
            deleteFor: 'me',
            hasFile: false,
            deleteFileFromServer: true
        });

        if (!originalMsg) return;

        // If there's an active undo timer, commit it immediately before starting the next one
        if (deleteTimeoutRef.current) {
            clearTimeout(deleteTimeoutRef.current);
            if (undoDeleteInfo) {
                socketRef.current?.emit("deleteMessage", {
                    messageId: undoDeleteInfo.messageId,
                    deleteFor: undoDeleteInfo.deleteFor,
                    deleteFileFromServer: undoDeleteInfo.deleteFileFromServer
                });
            }
        }

        // Hide message locally
        setMessages(prev => prev.filter(m => m._id !== messageId));

        // Set undo state details
        setUndoDeleteInfo({
            messageId,
            deleteFor,
            originalMsg,
            deleteFileFromServer
        });

        // Start 3 second commit timer
        deleteTimeoutRef.current = setTimeout(() => {
            socketRef.current?.emit("deleteMessage", {
                messageId,
                deleteFor,
                deleteFileFromServer
            });
            setUndoDeleteInfo(null);
            deleteTimeoutRef.current = null;
        }, 3000);
    };

    const executeUndoDelete = () => {
        if (deleteTimeoutRef.current) {
            clearTimeout(deleteTimeoutRef.current);
            deleteTimeoutRef.current = null;
        }

        if (undoDeleteInfo) {
            // Restore message locally
            setMessages(prev => {
                if (prev.some(m => m._id === undoDeleteInfo.messageId)) return prev;
                const list = [...prev, undoDeleteInfo.originalMsg];
                return list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            });
            setUndoDeleteInfo(null);
        }
    };

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
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    setCropImgRatio(img.width / img.height);
                    setCropImageSrc(event.target.result);
                    setCropZoom(1.0);
                    setCropOffset({ x: 0, y: 0 });
                };
            };
            reader.readAsDataURL(file);
        }
    }

    // Save Crop utilizing Canvas
    function saveCroppedImage() {
        if (!cropImageSrc) return;
        const canvas = document.createElement("canvas");
        const canvasSize = 1600; // Output ultra high-quality resolution (1600x1600 pixels)
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

            let drawWidth, drawHeight;
            if (imgRatio > 1) {
                drawWidth = canvasSize * imgRatio * cropZoom;
                drawHeight = canvasSize * cropZoom;
            } else {
                drawWidth = canvasSize * cropZoom;
                drawHeight = (canvasSize / imgRatio) * cropZoom;
            }

            const x = (canvasSize - drawWidth) / 2 + cropOffset.x * scale;
            const y = (canvasSize - drawHeight) / 2 + cropOffset.y * scale;

            ctx.drawImage(img, x, y, drawWidth, drawHeight);

            // Export as JPEG with 92% quality (excellent balance of clarity and file size)
            const compressedBase64 = canvas.toDataURL("image/jpeg", 0.92);
            if (cropTarget === "ownProfile") {
                setAvatarVal(compressedBase64);
            } else if (cropTarget === "createRoom") {
                setCreateRoomAvatar(compressedBase64);
            } else if (cropTarget === "editRoom") {
                setEditRoomAvatar(compressedBase64);
            }
            setCropImageSrc(null); // Close cropper
        };
    }

    // Helper to perform block/unblock API calls
    async function performBlockAction(targetUsername, action) {
        try {
            const response = await fetch(`${getBackendUrl()}/api/user/${action}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${getAuthToken()}`
                },
                body: JSON.stringify({ targetUsername })
            });
            if (response.ok) {
                const isBlockedNow = (action === "block");
                // Update selectedProfileData if it's currently open for this user
                if (selectedProfileData && selectedProfileData.username?.toLowerCase() === targetUsername.toLowerCase()) {
                    setSelectedProfileData(prev => ({
                        ...prev,
                        isBlocked: isBlockedNow,
                        canDM: isBlockedNow ? false : true
                    }));
                }
                // Update ownProfileData
                setOwnProfileData(prev => {
                    if (!prev) return prev;
                    const blocked = prev.blockedUsers || [];
                    return {
                        ...prev,
                        blockedUsers: isBlockedNow
                            ? [...blocked, targetUsername]
                            : blocked.filter(u => u !== targetUsername)
                    };
                });
            }
        } catch (err) {
            console.error(`Error performing ${action} action:`, err);
        }
    }

    // Other user actions
    async function handleBlockToggle() {
        if (!selectedProfileData) return;
        const targetUsername = selectedProfileData.username;
        const isCurrentlyBlocked = selectedProfileData.isBlocked;
        if (!isCurrentlyBlocked) {
            setBlockTargetConfirm({ username: targetUsername, source: "profile" });
        } else {
            await performBlockAction(targetUsername, "unblock");
        }
    }

    async function handleHeaderBlockToggle() {
        if (isGuest || !activePrivateName) return;
        const isCurrentlyBlocked = ownProfileData?.blockedUsers?.includes(activePrivateName);
        if (!isCurrentlyBlocked) {
            setBlockTargetConfirm({ username: activePrivateName, source: "header" });
        } else {
            await performBlockAction(activePrivateName, "unblock");
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
        const pChatId = [currentU.toLowerCase(), targetUser.toLowerCase()].sort().join("_");
        selectPrivate(pChatId, targetUser);
        setSelectedProfileUsername(null);
    }

    function logout() {
        sessionStorage.removeItem("token");
        localStorage.removeItem("token");
        if (isGuest) {
            navigate("/login");
        } else {
            navigate("/");
        }
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

    const dmConversations = React.useMemo(() => {
        let list = conversationUsers.map((cUser) => {
            const onlineUser = onlineUserList.find(
                (u) => u.username?.toLowerCase() === cUser.username?.toLowerCase()
            );
            if (onlineUser) {
                return {
                    ...cUser,
                    displayName: onlineUser.displayName || cUser.displayName || cUser.username,
                    avatar: onlineUser.avatar || cUser.avatar,
                    status: onlineUser.status || "Online",
                    isOnline: true,
                    role: onlineUser.role
                };
            } else {
                const dbUser = allUsers.find(
                    (u) => u.username?.toLowerCase() === cUser.username?.toLowerCase()
                );
                return {
                    ...cUser,
                    displayName: dbUser?.displayName || cUser.displayName || cUser.username,
                    avatar: dbUser?.avatar || cUser.avatar,
                    status: "Offline",
                    isOnline: false
                };
            }
        });

        list = list.filter((u) => u.username?.toLowerCase() !== username?.toLowerCase());

        if (activePrivateName && !list.some((u) => u.username?.toLowerCase() === activePrivateName.toLowerCase())) {
            const activeUserObj = allUsers.find(
                (u) => u.username?.toLowerCase() === activePrivateName.toLowerCase()
            ) || onlineUserList.find(
                (u) => u.username?.toLowerCase() === activePrivateName.toLowerCase()
            );

            if (activeUserObj) {
                const isOnline = onlineUserList.some(
                    (u) => u.username?.toLowerCase() === activePrivateName.toLowerCase()
                );
                const onlineUser = onlineUserList.find(
                    (u) => u.username?.toLowerCase() === activePrivateName.toLowerCase()
                );
                list.unshift({
                    ...activeUserObj,
                    displayName: activeUserObj.displayName || activeUserObj.username,
                    status: isOnline ? (onlineUser?.status || "Online") : "Offline",
                    isOnline
                });
            } else {
                const isOnline = onlineUserList.some(
                    (u) => u.username?.toLowerCase() === activePrivateName.toLowerCase()
                );
                const onlineUser = onlineUserList.find(
                    (u) => u.username?.toLowerCase() === activePrivateName.toLowerCase()
                );
                list.unshift({
                    username: activePrivateName,
                    displayName: activePrivateName,
                    status: isOnline ? (onlineUser?.status || "Online") : "Offline",
                    isOnline
                });
            }
        }
        const seen = new Set();
        list = list.filter((u) => {
            const lowerUName = u.username?.toLowerCase();
            if (!lowerUName || seen.has(lowerUName)) return false;
            seen.add(lowerUName);
            return true;
        });

        return list;
    }, [conversationUsers, onlineUserList, username, activePrivateName, allUsers]);

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
                        unreadCounts={unreadCounts}
                        allUsers={allUsers}
                        dmConversations={dmConversations}
                        customRooms={customRooms}
                        customRoomsLoading={customRoomsLoading}
                        onCreateRoomClick={() => {
                            setJoinError("");
                            setJoinCode("");
                            setCodeArray(Array(6).fill(""));
                            setCreateRoomName("");
                            setActiveModalTab("create");
                            setShowCreateJoinModal(true);
                        }}
                        activeSidebarTab={activeSidebarTab}
                        setActiveSidebarTab={setActiveSidebarTab}
                    />
                </div>

                {/* Main chat */}
                <div className="chat-container">

                    <ChatHeader
                        username={username}
                        onLogout={isGuest ? logout : () => setShowLogoutConfirm(true)}
                        chatTitle={chatTitle}
                        onlineUsers={onlineUsers}
                        onlineUserList={onlineUserList}
                        onMenuToggle={() => setSidebarOpen(v => !v)}
                        isGuest={isGuest}
                        onClearChatClick={() => setShowClearConfirm(true)}
                        theme={theme}
                        onThemeToggle={handleThemeToggle}
                        isPrivate={!!activePrivate}
                        privateUser={
                            onlineUserList.find(u => u.username?.toLowerCase() === activePrivateName?.toLowerCase()) ||
                            allUsers.find(u => u.username?.toLowerCase() === activePrivateName?.toLowerCase())
                        }
                        onUserProfileClick={(uname) => setSelectedProfileUsername(uname)}
                        onShowOnlineListClick={() => setShowOnlineList(true)}
                        isBlocked={ownProfileData?.blockedUsers?.includes(activePrivateName)}
                        onToggleBlock={handleHeaderBlockToggle}
                        roomDetails={activeRoomDetails}
                        onLeaveRoom={handleLeaveRoom}
                        onEditRoomClick={() => {
                            if (activeRoomDetails) {
                                setEditRoomName(activeRoomDetails.name);
                                setEditRoomAvatar(activeRoomDetails.avatar || "");
                                setShowEditRoomModal(true);
                            }
                        }}
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
                        allUsers={allUsers}
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

            {/* Block Target Confirmation Modal */}
            {blockTargetConfirm && (
                <div className="modal-overlay" onClick={() => setBlockTargetConfirm(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 'min(90%, 360px)' }}>
                        <div className="modal-header-section">
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>Block User?</h3>
                        </div>
                        <div className="modal-body-section" style={{ margin: '16px 0', fontSize: '14px', color: 'var(--text)' }}>
                            <p>Are you sure you want to block <strong>@{blockTargetConfirm.username}</strong>? You will no longer receive direct messages from them.</p>
                        </div>
                        <div className="modal-footer-buttons" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button className="modal-btn cancel" onClick={() => setBlockTargetConfirm(null)}>Cancel</button>
                            <button 
                                className="modal-btn danger" 
                                onClick={async () => {
                                    const target = blockTargetConfirm.username;
                                    setBlockTargetConfirm(null);
                                    await performBlockAction(target, "block");
                                }}
                            >
                                Block
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Logout Confirmation Modal */}
            {showLogoutConfirm && (
                <div className="modal-overlay" onClick={() => setShowLogoutConfirm(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 'min(90%, 360px)' }}>
                        <div className="modal-header-section">
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>Confirm Logout</h3>
                        </div>
                        <div className="modal-body-section" style={{ margin: '16px 0', fontSize: '14px', color: 'var(--text)' }}>
                            <p>Are you sure you want to log out? You will need to enter your credentials again to sign in.</p>
                        </div>
                        <div className="modal-footer-buttons" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button className="modal-btn cancel" onClick={() => setShowLogoutConfirm(false)}>Cancel</button>
                            <button className="modal-btn danger" onClick={() => { setShowLogoutConfirm(false); logout(); }}>Log Out</button>
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
                            <form onSubmit={handleOwnProfileUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '70vh' }}>
                                <div className="modal-body-section" style={{ display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto', paddingRight: '6px' }}>
                                    {/* Avatar Upload */}
                                    <div className="profile-settings-avatar-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                        <div 
                                            className="profile-settings-avatar-wrapper" 
                                            style={{ position: 'relative', cursor: avatarVal ? 'zoom-in' : 'default' }}
                                            onClick={() => {
                                                if (avatarVal) {
                                                    setFullAvatarUrl(avatarVal);
                                                }
                                            }}
                                        >
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
                                            <SmoothInput
                                                type="text"
                                                value={editUsernameVal}
                                                onChange={(e) => { setEditUsernameVal(e.target.value); setProfileError(""); }}
                                                className="guest-username-input"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="form-label" style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text)', display: 'block', marginBottom: '4px' }}>Display Name</label>
                                            <SmoothInput
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
                                    <div className="profile-privacy-card">
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
                                        <div className="profile-blocked-card">
                                            <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: '800' }}>Blocked Users</h4>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '100px', overflowY: 'auto' }}>
                                                {ownProfileData.blockedUsers.map(uname => (
                                                    <div key={uname} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span className="blocked-user-name">@{uname}</span>
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
                                    <div className="profile-stats-card">
                                        <div style={{ textAlign: 'center' }}>
                                            <div className="stat-label">Messages Sent</div>
                                            <div className="stat-value" style={{ fontSize: '16px', fontWeight: '800' }}>{ownProfileData.totalMessagesSent.toLocaleString()}</div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div className="stat-label">Member Since</div>
                                            <div className="stat-value" style={{ fontSize: '13px', fontWeight: '700', marginTop: '2px' }}>
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
                                    <SmoothInput
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
                                        width: cropImgRatio > 1 ? 'auto' : '100%',
                                        height: cropImgRatio > 1 ? '100%' : 'auto',
                                        maxHeight: 'none',
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

                                    {/* Top Accent Color Bar */}
                                    <div className="card-top-bar" />

                                    {/* CARD HEADER SECTION */}
                                    <div className="cyber-card-header">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div className="cyber-logo-text">NEXUS</div>
                                            <div 
                                                className="live-status-dot-only"
                                                style={{
                                                    background: selectedProfileData.status === "Online" ? 'rgba(16, 185, 129, 0.08)' :
                                                                selectedProfileData.status === "Away" ? 'rgba(255, 176, 32, 0.08)' :
                                                                selectedProfileData.status === "Busy" ? 'rgba(239, 68, 68, 0.08)' : 'rgba(107, 114, 128, 0.08)',
                                                    borderColor: selectedProfileData.status === "Online" ? 'rgba(16, 185, 129, 0.3)' :
                                                                 selectedProfileData.status === "Away" ? 'rgba(255, 176, 32, 0.3)' :
                                                                 selectedProfileData.status === "Busy" ? 'rgba(239, 68, 68, 0.3)' : 'rgba(107, 114, 128, 0.3)'
                                                }}
                                            >
                                                <span 
                                                    className="live-pulse-dot" 
                                                    style={{ 
                                                        backgroundColor: selectedProfileData.status === "Online" ? '#10b981' :
                                                                         selectedProfileData.status === "Away" ? '#ffb020' :
                                                                         selectedProfileData.status === "Busy" ? '#ef4444' : '#6b7280',
                                                        boxShadow: selectedProfileData.status === "Online" ? '0 0 10px #10b981' :
                                                                   selectedProfileData.status === "Away" ? '0 0 10px #ffb020' :
                                                                   selectedProfileData.status === "Busy" ? '0 0 10px #ef4444' : 'none'
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <button className="cyber-close-btn" onClick={() => setSelectedProfileUsername(null)}>×</button>
                                    </div>

                                    {/* AVATAR + ACTIVE ZONE */}
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
                                        </div>
                                    </div>

                                    {/* USER BRAND DETAILS */}
                                    <div className="cyber-bio-section">
                                        <h2 className="cyber-display-name">
                                            {selectedProfileData.displayName}
                                            {!selectedProfileData.isGuest && (
                                                <svg className="cyber-verify-badge" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '4px' }}>
                                                    <circle cx="12" cy="12" r="10" stroke="currentColor" fill="none" strokeWidth="2.5"/>
                                                    <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                                                </svg>
                                            )}
                                        </h2>
                                        <span className="cyber-username">@{selectedProfileData.username}</span>
                                        <p className="cyber-bio-text" style={{ fontStyle: selectedProfileData.bio ? 'normal' : 'italic' }}>
                                            {selectedProfileData.bio || "No status bio set."}
                                        </p>
                                    </div>

                                    {/* DASHED DIVIDER */}
                                    <div className="card-divider-dashed" />

                                    {/* PROFILE STATS GRID */}
                                    <div className="cyber-stats-grid">
                                        <div className="cyber-stat-box">
                                            <small className="cyber-stat-label">TOTAL MSGS</small>
                                            <strong className="cyber-stat-value">{selectedProfileData.totalMessagesSent.toLocaleString()}</strong>
                                        </div>
                                        <div className="cyber-stat-box">
                                            <small className="cyber-stat-label">CONNECTIONS</small>
                                            <strong className="cyber-stat-value">{selectedProfileData.friendsCount || 0}</strong>
                                        </div>
                                        <div className="cyber-stat-box">
                                            <small className="cyber-stat-label">STREAK</small>
                                            <strong className="cyber-stat-value">
                                                {selectedProfileData.isGuest ? 0 : Math.max(3, (selectedProfileData.totalMessagesSent % 15) + 2)}
                                            </strong>
                                        </div>
                                        <div className="cyber-stat-box">
                                            <small className="cyber-stat-label">JOIN NODE</small>
                                            <strong className="cyber-stat-value">
                                                {new Date(selectedProfileData.joinDate).toLocaleDateString([], { month: 'short', year: 'numeric' })}
                                            </strong>
                                        </div>
                                    </div>

                                    {/* TRUST SCORE PANEL BAR */}
                                    <div className="trust-score-bar">
                                        <div className="trust-score-left">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                                            </svg>
                                            <span>Trust score</span>
                                        </div>
                                        <div className="trust-score-right">
                                            <span>{(95 + (selectedProfileData.totalMessagesSent % 5) + (selectedProfileData.username.length % 2) * 0.4).toFixed(1)}% secure</span>
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
                                                <div className="card-actions-grid">
                                                    <button 
                                                        onClick={handleStartPrivateChat} 
                                                        disabled={!selectedProfileData.canDM} 
                                                        className="action-btn-card solid"
                                                        title={!selectedProfileData.canDM ? "Private Messaging is restricted by user privacy or block settings." : "Send direct message"}
                                                    >
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                                                        Message
                                                    </button>
                                                    <button 
                                                        onClick={() => alert("Establishing Secure Encrypted Voice Connection...")} 
                                                        className="action-btn-card outline"
                                                        title="Establish Secure Voice Call"
                                                    >
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                                        Voice
                                                    </button>
                                                    <button 
                                                        onClick={() => alert("Establishing Video Encryption Link...")} 
                                                        className="action-btn-card outline"
                                                        title="Establish Video Encryption Link"
                                                    >
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7l-7 5 7 5V7z"></path><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                                                        Video
                                                    </button>
                                                    <button 
                                                        onClick={handleFriendToggle} 
                                                        className="action-btn-card outline"
                                                    >
                                                        {selectedProfileData.isFriend ? (
                                                            <>
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="23" y1="11" x2="17" y2="11"></line></svg>
                                                                Remove
                                                            </>
                                                        ) : (
                                                            <>
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
                                                                Connect
                                                            </>
                                                        )}
                                                    </button>
                                                    <button 
                                                        onClick={handleBlockToggle} 
                                                        className="action-btn-card outline"
                                                    >
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                                                        {selectedProfileData.isBlocked ? "Unblock" : "Block"}
                                                    </button>
                                                    <button 
                                                        onClick={() => setShowReportForm(v => !v)} 
                                                        className="action-btn-card outline"
                                                    >
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                                                        Report
                                                    </button>
                                                </div>

                                                {showReportForm && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(18, 199, 189, 0.05)', border: '1px solid rgba(18, 199, 189, 0.2)', padding: '10px', borderRadius: '8px', marginTop: '10px', width: '100%', boxSizing: 'border-box' }}>
                                                        <label style={{ fontSize: '9px', fontWeight: 'bold', color: 'var(--accent)', fontFamily: 'monospace' }}>REASON FOR REPORTING</label>
                                                        <SmoothInput 
                                                            type="text" 
                                                            placeholder="Enter security incident details..." 
                                                            value={reportReason} 
                                                            onChange={(e) => setReportReason(e.target.value)} 
                                                            style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid rgba(18, 199, 189, 0.2)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '11px', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }}
                                                        />
                                                        <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                                            <button type="button" onClick={handleReportUser} disabled={!reportReason.trim()} className="action-btn-card solid" style={{ flex: 1, height: '28px', fontSize: '10px' }}>
                                                                SUBMIT REPORT
                                                            </button>
                                                            <button type="button" onClick={() => { setShowReportForm(false); setReportReason(""); }} className="action-btn-card outline" style={{ flex: 1, height: '28px', fontSize: '10px' }}>
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
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>
                                {activeRoomDetails?.isPrivate ? "Room Members" : "Online Members"}
                            </h3>
                            <button className="close-picker-btn" onClick={() => setShowOnlineList(false)} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer' }}>×</button>
                        </div>
                        <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                            {(activeRoomDetails?.isPrivate ? (activeRoomDetails.members || []) : onlineUserList).map(user => {
                                const isCurrentUser = user.username?.toLowerCase() === username?.toLowerCase();
                                const isAdmin = activeRoomDetails?.isPrivate && (
                                    user._id === activeRoomDetails.admin?._id ||
                                    user.username === activeRoomDetails.admin?.username ||
                                    user._id === activeRoomDetails.admin
                                );
                                const onlineUser = onlineUserList.find(
                                    u => u.username?.toLowerCase() === user.username?.toLowerCase()
                                );
                                const isOnline = !!onlineUser || isCurrentUser;
                                const userStatus = isOnline ? (onlineUser?.status || user.status || "Online") : "Offline";
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
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                                            <div style={{ position: 'relative', display: 'flex' }}>
                                                {user.avatar ? (
                                                    <img src={user.avatar} alt={user.username} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                                                ) : (
                                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #c8eeff, #bff7f2)', color: 'var(--accent-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '800' }}>
                                                        {user.username.charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                                <span className={`sidebar-online-dot ${
                                                    user.role === "guest" && isOnline ? "guest-dot" :
                                                    userStatus === "Online" ? "" :
                                                    userStatus === "Away" ? "away" :
                                                    userStatus === "Busy" ? "busy" : "offline"
                                                }`} style={{ position: 'absolute', bottom: '-1px', right: '-1px', width: '9px', height: '9px', border: '1.5px solid #fff' }} />
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                                    <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {user.displayName || user.username}
                                                        {isCurrentUser && <span style={{ marginLeft: '4px', fontSize: '10px', color: 'var(--muted)', fontWeight: 'bold' }}>(You)</span>}
                                                    </span>
                                                    {isAdmin && (
                                                        <span 
                                                            style={{ 
                                                                fontSize: '9px', 
                                                                fontWeight: '800', 
                                                                background: 'linear-gradient(135deg, #ff9800, #e65100)', 
                                                                color: '#fff', 
                                                                padding: '2px 6px', 
                                                                borderRadius: '4px',
                                                                textTransform: 'uppercase',
                                                                letterSpacing: '0.5px',
                                                                boxShadow: '0 0 6px rgba(230, 81, 0, 0.2)'
                                                            }}
                                                        >
                                                            Admin
                                                        </span>
                                                    )}
                                                </div>
                                                <span style={{ fontSize: '11px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    @{user.username} {user.role === "guest" && "[Guest]"}
                                                </span>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '11px', fontWeight: '700', color: 
                                            userStatus === "Online" ? '#17d67e' :
                                            userStatus === "Away" ? '#ffb020' :
                                            userStatus === "Busy" ? '#ef4444' : '#6b7280'
                                        }}>
                                            {userStatus}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* EDIT ROOM DETAILS MODAL */}
            {showEditRoomModal && activeRoomDetails && (
                <div className="modal-overlay" onClick={() => setShowEditRoomModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 'min(90%, 360px)', padding: '20px' }}>
                        <div className="modal-header-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>Edit Room Details</h3>
                            <button className="close-picker-btn" onClick={() => setShowEditRoomModal(false)} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer' }}>×</button>
                        </div>
                        <form onSubmit={handleEditRoomSubmit}>
                            <div className="modal-body-section" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                {/* Group Photo Upload */}
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ position: 'relative' }}>
                                        {editRoomAvatar ? (
                                            <img src={editRoomAvatar} alt="Group Avatar Preview" style={{ width: '80px', height: '80px', borderRadius: '12px', objectFit: 'cover' }} />
                                        ) : (
                                            <div style={{ width: '80px', height: '80px', borderRadius: '12px', background: 'linear-gradient(135deg, #c8eeff, #bff7f2)', color: 'var(--accent-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: '800' }}>
                                                {editRoomName ? editRoomName.charAt(0).toUpperCase() : "G"}
                                            </div>
                                        )}
                                    </div>
                                    <label className="change-avatar-btn" style={{ padding: '6px 12px', background: 'var(--soft)', border: '1px solid var(--border)', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', color: 'var(--text)' }}>
                                        Change Photo
                                        <input type="file" accept="image/*" onChange={(e) => {
                                            setCropTarget("editRoom");
                                            handleCropFileChange(e);
                                        }} style={{ display: 'none' }} />
                                    </label>
                                </div>

                                {/* Room Name field */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.5px' }}>
                                        Room Name
                                    </label>
                                    <SmoothInput
                                        type="text"
                                        value={editRoomName}
                                        onChange={(e) => setEditRoomName(e.target.value)}
                                        placeholder="Enter room name"
                                        className="modal-premium-input"
                                        required
                                        minLength={2}
                                        maxLength={40}
                                    />
                                </div>
                            </div>

                            <div className="modal-footer-buttons" style={{ marginTop: '20px', display: 'flex', gap: '8px' }}>
                                <button type="submit" className="modal-btn primary" style={{ flex: 1 }}>
                                    Save Changes
                                </button>
                                <button type="button" className="modal-btn cancel" onClick={() => setShowEditRoomModal(false)} style={{ flex: 1 }}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* DELETE CONFIRMATION MODAL */}
            {deleteConfirmModal.isOpen && (
                <div className="delete-confirm-overlay" onClick={cancelDeleteRequest}>
                    <div className="delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
                        <h3 className="delete-confirm-title">Delete message?</h3>
                        
                        {deleteConfirmModal.hasFile && (
                            <label className="delete-confirm-checkbox-label">
                                <input 
                                    type="checkbox" 
                                    className="delete-confirm-checkbox"
                                    checked={deleteConfirmModal.deleteFileFromServer}
                                    onChange={(e) => setDeleteConfirmModal(prev => ({ ...prev, deleteFileFromServer: e.target.checked }))}
                                />
                                <span className="delete-confirm-checkbox-custom">
                                    {deleteConfirmModal.deleteFileFromServer && (
                                        <svg viewBox="0 0 24 24" width="12" height="12" stroke="#111214" strokeWidth="4" fill="none">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    )}
                                </span>
                                <span className="delete-confirm-checkbox-text">Delete file from server</span>
                            </label>
                        )}

                        <div className="delete-confirm-actions">
                            <button 
                                type="button" 
                                className="delete-confirm-btn cancel" 
                                onClick={cancelDeleteRequest}
                            >
                                Cancel
                            </button>
                            <button 
                                type="button" 
                                className="delete-confirm-btn delete" 
                                onClick={confirmDelete}
                            >
                                {deleteConfirmModal.deleteFor === "everyone" ? "Delete for everyone" : "Delete for me"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* UNDO DELETE TOAST BANNER */}
            {undoDeleteInfo && (
                <div className="undo-delete-toast">
                    <span className="undo-delete-toast-text">
                        &bull; Message deleted {undoDeleteInfo.deleteFor === "everyone" ? "for everyone" : "for me"}
                    </span>
                    <button 
                        type="button" 
                        className="undo-delete-toast-btn" 
                        onClick={executeUndoDelete}
                    >
                        Undo
                    </button>
                </div>
            )}

            {/* Apple AI border glow overlay */}
            <div className={`notification-border-overlay ${notificationActive ? "active" : ""}`}>
                <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
                    <defs>
                        <linearGradient id="appleGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#1d4ed8">
                                <animate attributeName="stop-color" values="#1d4ed8;#c2410c;#be185d;#a21caf;#6d28d9;#1d4ed8" dur="4s" repeatCount="indefinite" />
                            </stop>
                            <stop offset="25%" stopColor="#6d28d9">
                                <animate attributeName="stop-color" values="#6d28d9;#1d4ed8;#c2410c;#be185d;#a21caf;#6d28d9" dur="4s" repeatCount="indefinite" />
                            </stop>
                            <stop offset="50%" stopColor="#a21caf">
                                <animate attributeName="stop-color" values="#a21caf;#6d28d9;#1d4ed8;#c2410c;#be185d;#a21caf" dur="4s" repeatCount="indefinite" />
                            </stop>
                            <stop offset="75%" stopColor="#be185d">
                                <animate attributeName="stop-color" values="#be185d;#a21caf;#6d28d9;#1d4ed8;#c2410c;#be185d" dur="4s" repeatCount="indefinite" />
                            </stop>
                            <stop offset="100%" stopColor="#c2410c">
                                <animate attributeName="stop-color" values="#c2410c;#be185d;#a21caf;#6d28d9;#1d4ed8;#c2410c" dur="4s" repeatCount="indefinite" />
                            </stop>
                        </linearGradient>
                        <filter id="glowBlur" x="-10%" y="-10%" width="120%" height="120%">
                            <feGaussianBlur stdDeviation="12" />
                        </filter>
                    </defs>
                    {/* Glowing outer blur rect */}
                    <rect 
                        x="0" 
                        y="0" 
                        fill="none" 
                        stroke="url(#appleGlow)" 
                        strokeWidth="16" 
                        filter="url(#glowBlur)" 
                        opacity="0.9" 
                        style={{ width: "100%", height: "100%" }}
                    />
                </svg>
            </div>

            {/* Glassmorphic notification toast banner */}
            <div className="notification-toast-container">
                <AnimatePresence>
                    {activeToast && (
                        <motion.div
                            className="notification-toast"
                            initial={{ opacity: 0, y: -50, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -20, scale: 0.95 }}
                            transition={{ type: "spring", stiffness: 350, damping: 25 }}
                            onClick={() => {
                                if (activeToast.chatType === "private") {
                                    selectPrivate(activeToast.privateChatId, activeToast.senderUsername);
                                } else {
                                    selectRoom(activeToast.room);
                                }
                                setActiveToast(null);
                            }}
                        >
                            <div className="notification-toast-avatar">
                                {activeToast.avatarUrl ? (
                                    <img
                                        src={activeToast.avatarUrl}
                                        alt={activeToast.sender}
                                        className="notification-toast-avatar-img"
                                    />
                                ) : (
                                    activeToast.sender.charAt(0).toUpperCase()
                                )}
                            </div>
                            <div className="notification-toast-content">
                                <div className="notification-toast-header">
                                    <span className="notification-toast-sender">{activeToast.sender}</span>
                                    <span className="notification-toast-tag">
                                        {activeToast.chatType === "private" ? "DM" : `#${activeToast.room}`}
                                    </span>
                                </div>
                                <p className="notification-toast-text">{activeToast.text}</p>
                            </div>
                            <button
                                type="button"
                                className="notification-toast-close"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveToast(null);
                                }}
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            {/* Create / Join Room Modal */}
            <AnimatePresence>
                {showCreateJoinModal && (
                    <motion.div 
                        className="modal-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowCreateJoinModal(false)}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(0, 0, 0, 0.45)',
                            backdropFilter: 'blur(8px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1100
                        }}
                    >
                        <motion.div 
                            className="modal-content"
                            initial={{ y: 50, opacity: 0, scale: 0.95 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            exit={{ y: 50, opacity: 0, scale: 0.95 }}
                            transition={{ type: "spring", stiffness: 350, damping: 25 }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                width: 'min(90%, 420px)',
                                padding: '28px',
                                background: 'var(--panel)',
                                border: '1px solid var(--border)',
                                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.12)',
                                borderRadius: '16px',
                                color: 'var(--text)',
                                position: 'relative',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '20px'
                            }}
                        >
                            <button 
                                className="close-picker-btn" 
                                onClick={() => setShowCreateJoinModal(false)} 
                                style={{ 
                                    position: 'absolute',
                                    top: '16px',
                                    right: '16px',
                                    border: 'none', 
                                    background: 'none', 
                                    fontSize: '22px', 
                                    color: 'var(--muted)',
                                    cursor: 'pointer',
                                    transition: 'color 0.2s',
                                    zIndex: 10,
                                    padding: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '50%'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text)'}
                                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--muted)'}
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>

                            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                <div style={{ 
                                    width: '48px', 
                                    height: '48px', 
                                    borderRadius: '12px', 
                                    background: 'var(--accent-soft)', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    color: 'var(--accent)',
                                    fontSize: '22px',
                                    marginBottom: '4px',
                                    boxShadow: '0 4px 12px rgba(18, 199, 189, 0.15)'
                                }}>
                                    <FiLock />
                                </div>
                                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '800', letterSpacing: '-0.3px', color: 'var(--text)' }}>
                                    Private Room
                                </h3>
                                <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', fontWeight: '500' }}>
                                    Create your private room with friends
                                </p>
                            </div>

                            {/* Custom Tab Switcher */}
                            <div style={{ 
                                display: 'flex', 
                                background: 'var(--soft)', 
                                padding: '4px', 
                                borderRadius: '12px', 
                                border: '1px solid var(--border)',
                                position: 'relative',
                                height: '40px'
                            }}>
                                <button
                                    onClick={() => { setActiveModalTab("create"); setJoinError(""); }}
                                    style={{
                                        flex: 1,
                                        padding: '0',
                                        background: 'none',
                                        border: 'none',
                                        color: activeModalTab === "create" ? 'var(--text)' : 'var(--muted)',
                                        fontSize: '13px',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        position: 'relative',
                                        zIndex: 1,
                                        transition: 'color 0.2s',
                                        height: '100%'
                                    }}
                                >
                                    Create Room
                                </button>
                                <button
                                    onClick={() => { setActiveModalTab("join"); setJoinError(""); }}
                                    style={{
                                        flex: 1,
                                        padding: '0',
                                        background: 'none',
                                        border: 'none',
                                        color: activeModalTab === "join" ? 'var(--text)' : 'var(--muted)',
                                        fontSize: '13px',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        position: 'relative',
                                        zIndex: 1,
                                        transition: 'color 0.2s',
                                        height: '100%'
                                    }}
                                >
                                    Join Room
                                </button>
                                
                                {/* Sliding background tab indicator */}
                                <motion.div
                                    style={{
                                        position: 'absolute',
                                        top: '4px',
                                        bottom: '4px',
                                        left: activeModalTab === "create" ? '4px' : '50%',
                                        width: 'calc(50% - 4px)',
                                        background: 'var(--panel)',
                                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.02)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '8px',
                                        zIndex: 0
                                    }}
                                    animate={{ left: activeModalTab === "create" ? '4px' : '50%' }}
                                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                />
                            </div>

                            {joinError && (
                                <motion.div 
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    style={{ 
                                        background: 'rgba(239, 68, 68, 0.1)', 
                                        border: '1px solid rgba(239, 68, 68, 0.2)', 
                                        padding: '10px 12px', 
                                        borderRadius: '8px', 
                                        fontSize: '12px', 
                                        color: '#ef4444', 
                                        textAlign: 'center',
                                        fontWeight: '600'
                                    }}
                                >
                                    {joinError}
                                </motion.div>
                            )}

                            {activeModalTab === "create" ? (
                                 <form onSubmit={handleCreateRoomSubmit}>
                                     <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                         <div style={{ position: 'relative' }}>
                                             {createRoomAvatar ? (
                                                 <img 
                                                     src={createRoomAvatar} 
                                                     alt="Group Avatar Preview" 
                                                     style={{ width: '72px', height: '72px', borderRadius: '12px', objectFit: 'cover' }} 
                                                 />
                                             ) : (
                                                 <div 
                                                     style={{ 
                                                         width: '72px', 
                                                         height: '72px', 
                                                         borderRadius: '12px', 
                                                         background: 'linear-gradient(135deg, #c8eeff, #bff7f2)', 
                                                         color: 'var(--accent-deep)', 
                                                         display: 'flex', 
                                                         alignItems: 'center', 
                                                         justifyContent: 'center', 
                                                         fontSize: '28px', 
                                                         fontWeight: '800' 
                                                     }}
                                                 >
                                                     {createRoomName ? createRoomName.charAt(0).toUpperCase() : "G"}
                                                 </div>
                                             )}
                                         </div>
                                         <label 
                                             className="change-avatar-btn" 
                                             style={{ 
                                                 padding: '5px 12px', 
                                                 background: 'var(--soft)', 
                                                 border: '1px solid var(--border)', 
                                                 borderRadius: '20px', 
                                                 fontSize: '11px', 
                                                 fontWeight: 'bold', 
                                                 cursor: 'pointer', 
                                                 color: 'var(--text)' 
                                             }}
                                         >
                                             Change Photo
                                             <input 
                                                 type="file" 
                                                 accept="image/*" 
                                                 onChange={(e) => {
                                                     setCropTarget("createRoom");
                                                     handleCropFileChange(e);
                                                 }} 
                                                 style={{ display: 'none' }} 
                                             />
                                         </label>
                                     </div>

                                     <div style={{ marginBottom: '20px' }}>
                                         <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>
                                             Room Name
                                         </label>
                                        <SmoothInput
                                            type="text"
                                            value={createRoomName}
                                            onChange={(e) => setCreateRoomName(e.target.value)}
                                            placeholder="e.g. Secret Squad, Coders Club"
                                            className="modal-premium-input"
                                            required
                                            minLength={2}
                                            maxLength={40}
                                        />
                                    </div>

                                    <div style={{ 
                                        background: 'var(--soft)', 
                                        border: '1px solid var(--border)', 
                                        borderRadius: '12px', 
                                        padding: '12px 16px', 
                                        fontSize: '12px', 
                                        color: 'var(--muted)',
                                        marginBottom: '24px',
                                        lineHeight: '1.5'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <span>Role:</span>
                                            <span style={{ fontWeight: '700', color: '#ff9800' }}>Admin</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Admin Username:</span>
                                            <span style={{ fontWeight: '700', color: 'var(--accent)' }}>@{username}</span>
                                        </div>
                                    </div>

                                    <button 
                                        type="submit" 
                                        style={{ 
                                            width: '100%', 
                                            height: '44px', 
                                            fontSize: '13px', 
                                            fontWeight: '800', 
                                            background: 'var(--accent)', 
                                            color: '#ffffff',
                                            border: 'none', 
                                            borderRadius: '12px', 
                                            cursor: 'pointer',
                                            boxShadow: '0 4px 12px rgba(18, 199, 189, 0.25)',
                                            transition: 'all 0.2s ease',
                                            letterSpacing: '0.5px'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'var(--accent-deep)';
                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'var(--accent)';
                                            e.currentTarget.style.transform = 'none';
                                        }}
                                        onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
                                        onMouseUp={(e) => e.currentTarget.style.transform = 'none'}
                                    >
                                        CREATE PRIVATE ROOM
                                    </button>
                                </form>
                            ) : (
                                <div>
                                    <div style={{ marginBottom: '24px' }}>
                                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px', textAlign: 'center' }}>
                                            Enter 6-Digit Room Code
                                        </label>
                                        <div 
                                            style={{ 
                                                display: 'flex', 
                                                justifyContent: 'space-between', 
                                                gap: '8px' 
                                            }}
                                            onPaste={handlePaste}
                                        >
                                            {codeArray.map((digit, index) => (
                                                <input
                                                    key={index}
                                                    id={`digit-input-${index}`}
                                                    type="text"
                                                    maxLength={1}
                                                    value={digit}
                                                    onChange={(e) => handleDigitChange(index, e.target.value)}
                                                    onKeyDown={(e) => handleDigitKeyDown(index, e)}
                                                    style={{
                                                        width: '46px',
                                                        height: '52px',
                                                        background: 'var(--soft)',
                                                        border: '1px solid var(--border)',
                                                        borderRadius: '10px',
                                                        textAlign: 'center',
                                                        fontSize: '20px',
                                                        fontWeight: '700',
                                                        color: 'var(--accent)',
                                                        fontFamily: 'monospace',
                                                        outline: 'none',
                                                        transition: 'all 0.2s ease'
                                                    }}
                                                    onFocus={(e) => {
                                                        e.target.style.borderColor = 'var(--accent)';
                                                        e.target.style.boxShadow = '0 0 8px rgba(18, 199, 189, 0.3)';
                                                        e.target.style.background = 'var(--panel)';
                                                    }}
                                                    onBlur={(e) => {
                                                        e.target.style.borderColor = 'var(--border)';
                                                        e.target.style.boxShadow = 'none';
                                                        e.target.style.background = 'var(--soft)';
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    <button 
                                        onClick={() => {
                                            const fullCode = codeArray.join("");
                                            if (fullCode.length === 6) {
                                                socketRef.current?.emit("joinRoomByCode", fullCode);
                                            } else {
                                                setJoinError("Please enter all 6 digits.");
                                            }
                                        }}
                                        style={{ 
                                            width: '100%', 
                                            height: '44px', 
                                            fontSize: '13px', 
                                            fontWeight: '800', 
                                            background: 'var(--accent)', 
                                            color: '#ffffff',
                                            border: 'none', 
                                            borderRadius: '12px', 
                                            cursor: 'pointer',
                                            boxShadow: '0 4px 12px rgba(18, 199, 189, 0.25)',
                                            transition: 'all 0.2s ease',
                                            letterSpacing: '0.5px'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'var(--accent-deep)';
                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'var(--accent)';
                                            e.currentTarget.style.transform = 'none';
                                        }}
                                        onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
                                        onMouseUp={(e) => e.currentTarget.style.transform = 'none'}
                                    >
                                        JOIN PRIVATE ROOM
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default Chat;
