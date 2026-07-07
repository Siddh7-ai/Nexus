import React, { useState, useEffect, useRef, Suspense, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { io } from "socket.io-client";
import { motion, AnimatePresence, useMotionValue, useTransform, useVelocity, useSpring } from "framer-motion";

import ChatHeader from "../components/ChatHeader";
import OnlineUsers from "../components/OnlineUsers";
import MessageList from "../components/MessageList";
import { getBackendUrl } from "../utils/config";
import TypingIndicator from "../components/TypingIndicator";
import MessageInput from "../components/MessageInput";
import RoomList from "../components/RoomList";
import ThemeToggleButton from "../components/ThemeToggleButton";
import { 
  encryptOutgoingMessage, 
  decryptAndCacheMessage, 
  replenishOneTimePrekeysIfNeeded,
  loadDecryptedKeys,
  saveDecryptedMessage,
  getDecryptedMessage
} from "../utils/crypto/manager";
import { fromBase64, toBase64 } from "../utils/crypto/encoding";
import { encryptVoiceMessage } from "../utils/voiceMessage";
import { getFullSessionRecord, deleteSessionState, cacheSessionIdentityKeys, getVaultPinData } from "../utils/crypto/keydb";
import sodium from "libsodium-wrappers-sumo";
import { playPop } from "../utils/audio";

import "../App.css";
import { initTheme, toggleTheme } from "../utils/theme";
import { SmoothInput } from "../components/SmoothInput";
import { FiLock, FiTrash2, FiMessageSquare, FiX } from "react-icons/fi";
import { Pin, PinOff, ChevronDown, ArrowRight, Mic } from "lucide-react";

// Lazy load non-essential panel components and dialog modals to optimize build chunk sizes
const VerifyModal = React.lazy(() => import("../components/VerifyModal"));
const DataFlowVisualizer = React.lazy(() => import("../components/DataFlowVisualizer"));
const CrowdCanvas = React.lazy(() => import("../components/CrowdCanvas"));
const Vault = React.lazy(() => import("../components/Vault"));
const MessageInfoModal = React.lazy(() => import("../components/MessageInfoModal"));
const LockMessageModal = React.lazy(() => import("../components/LockMessageModal"));
const NexTaskPage = React.lazy(() => import("../components/NexTaskPage"));
const AddToWorkModal = React.lazy(() => import("../components/AddToWorkModal"));
const CommandPalette = React.lazy(() => import("../components/CommandPalette"));
const VaultPinEntryModal = React.lazy(() => import("../components/VaultPinEntryModal"));
const PinMessageModal = React.lazy(() => import("../components/PinMessageModal"));
const ThemeTransitionOptions = React.lazy(() => import("../components/ThemeTransitionOptions"));
import ErrorBoundary from "../components/ErrorBoundary";
import { ApiClient } from "../utils/api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

const customSchema = {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames || []), "u"]
};

function stripMarkdownAndHtml(text) {
    if (!text) return "";
    // Remove HTML tags
    let clean = text.replace(/<\/?[^>]+(>|$)/g, "");
    // Remove Markdown formatting chars
    clean = clean.replace(/(\*\*|__|\*|_)/g, "");
    clean = clean.replace(/~~/g, "");
    clean = clean.replace(/^#+\s+/gm, "");
    clean = clean.replace(/(```|`)/g, "");
    clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    return clean;
}
function formatRelativeTime(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "just now";
    if (diffMins === 1) return "1m ago";
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return "1h ago";
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

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

function Avatar({ username, avatarSrc, size = 28, className = "", darkVariant = false }) {
    if (avatarSrc) {
        return (
            <img 
                src={avatarSrc} 
                alt={`${username}'s avatar`} 
                className={`avatar ${className}`} 
                style={{ width: size, height: size, objectFit: 'cover', borderRadius: '50%' }} 
            />
        );
    }
    const colors = darkVariant ? ["#121212"] : ["#bff7f2", "#c8eeff", "#d8f7cf", "#ffe1b8", "#e7dcff"];
    let colorIndex = 0;
    if (!darkVariant) {
        for (let i = 0; i < username.length; i++) {
            colorIndex += username.charCodeAt(i);
        }
    }
    const color = colors[colorIndex % colors.length];

    return (
        <div 
            className={`avatar ${className}`} 
            style={{ 
                backgroundColor: color, 
                color: darkVariant ? "#ffffff" : "#23303d", 
                width: size, 
                height: size, 
                fontSize: size * 0.42,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%'
            }}
        >
            {username.charAt(0).toUpperCase()}
        </div>
    );
}

export function SRLogo({ color = '#111110', size = 34 }) {
  return (
    <svg
      viewBox="0 0 130 130"
      width={size}
      height={size}
      fill="none"
      style={{ flexShrink: 0, display: 'block' }}
    >
      <path
        d="M58 22 A28 22 0 0 0 14 44 A28 22 0 0 1 58 66 A28 22 0 0 1 14 88"
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
      />
      <line x1="74" y1="22" x2="74" y2="110" stroke={color} strokeWidth="8" strokeLinecap="round" />
      <path
        d="M74 22 Q104 22 104 44 Q104 66 74 66"
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
      />
      <line x1="74" y1="66" x2="104" y2="110" stroke={color} strokeWidth="8" strokeLinecap="round" />
    </svg>
  )
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

    // Clear room and private search params on initial load to start on Crowd Canvas page
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.has("room") || params.has("private")) {
            params.delete("room");
            params.delete("private");
            setSearchParams(params, { replace: true });
        }
    }, [setSearchParams]);

    const [theme, setTheme] = useState(() => initTheme());
    const [unreadCounts, setUnreadCounts] = useState({});

    useEffect(() => {
        setTheme(initTheme());
        
        // Lock body viewport scrolling for the chat page shell to prevent iOS keyboard/scroll displacement
        document.body.classList.add("chat-page-body");
        document.documentElement.classList.add("chat-page-html");

        // Clear decrypted_messages IndexedDB store once on mount to force recalculating E2EE sticker fields
        try {
            const request = indexedDB.open("NexusMessenger");
            request.onsuccess = (e) => {
                const db = e.target.result;
                if (db.objectStoreNames.contains("decrypted_messages")) {
                    const transaction = db.transaction("decrypted_messages", "readwrite");
                    transaction.objectStore("decrypted_messages").clear();
                    console.log("Decrypted messages IndexedDB cache cleared successfully.");
                }
            };
        } catch (err) {
            console.error("Failed to clear decrypted messages cache:", err);
        }

        // Auto-lock vault on tab switch, app switch, or page close/refresh
        const handleAutoLock = () => {
            clearVaultState();
        };
        window.addEventListener("blur", handleAutoLock);
        document.addEventListener("visibilitychange", handleAutoLock);
        window.addEventListener("beforeunload", handleAutoLock);
        
        return () => {
            document.body.classList.remove("chat-page-body");
            document.documentElement.classList.remove("chat-page-html");
            window.removeEventListener("blur", handleAutoLock);
            document.removeEventListener("visibilitychange", handleAutoLock);
            window.removeEventListener("beforeunload", handleAutoLock);
            clearVaultState();
        };
    }, []);

    function handleThemeToggle(e) {
        toggleTheme(e, setTheme);
    }

    const [message, setMessage] = useState("");
    const [messages, setMessages] = useState([]);
    const messagesRef = useRef([]);
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);
    const requestedResendsRef = useRef(new Set());
    const decryptionMetaDataRef = useRef({});
    const [loadingMessages, setLoadingMessages] = useState(true);
    const [decryptedMessages, setDecryptedMessages] = useState({});
    const [sidebarTick, setSidebarTick] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => {
            setSidebarTick(t => t + 1);
        }, 30000);
        return () => clearInterval(interval);
    }, []);

    // Reply and message info states
    const [replyToMsg, setReplyToMsg] = useState(null);
    const [infoMsg, setInfoMsg] = useState(null);
    
    const [activeRoom, setActiveRoom] = useState(null);
    const [activePrivate, setActivePrivate] = useState(null); // privateChatId
    const [activePrivateName, setActivePrivateName] = useState(""); // other username

    const [vaultKey, setVaultKeyState] = useState(null);
    const [showVault, setShowVault] = useState(false);

    const setVaultKey = (newKey) => {
        setVaultKeyState(prevKey => {
            if (prevKey && prevKey !== newKey) {
                try {
                    sodium.memzero(prevKey);
                } catch (e) {
                    console.error("Failed to memzero old vault key:", e);
                }
            }
            return newKey;
        });
    };

    const clearVaultState = () => {
        setShowVault(false);
        setVaultKey(null);
    };

    const [showVerifyModal, setShowVerifyModal] = useState(false);
    const [showVisualizer, setShowVisualizer] = useState(false);
    const [visualizerData, setVisualizerData] = useState(null);
    const [partnerIdentityKey, setPartnerIdentityKey] = useState(null);
    const [myIdentityKey, setMyIdentityKey] = useState(null);
    const expectingIncomingVisualizerRef = useRef(null);
    const newlyReceivedMessageIdsRef = useRef(new Set());

    useEffect(() => {
        let isCancelled = false;

        async function decryptAll() {
            if (!activePrivate || !messages.length) return;
            const token = getAuthToken();
            const myUsername = usernameRef.current;

            // Decrypt sequentially to avoid parallel IndexedDB transaction race conditions on the Double Ratchet state
            for (const msg of messages) {
                if (isCancelled) break;
                if (msg.isDeleted) continue; // Skip deleted messages
                if (!msg.privateChatId || !msg.ratchetHeader) continue;

                const cachedMetadata = decryptionMetaDataRef.current[msg._id];
                const hasChanged = !cachedMetadata ||
                    cachedMetadata.text !== msg.text ||
                    JSON.stringify(cachedMetadata.handshakePayload) !== JSON.stringify(msg.handshakePayload);

                if (hasChanged) {
                    requestedResendsRef.current.delete(msg._id);
                }

                if (decryptedMessages[msg._id] && !hasChanged) continue; // already decrypted and has not changed

                try {
                    const decryptedPayload = await decryptAndCacheMessage(msg, myUsername, token);
                    
                    let decryptedTranscript = "[Not a voice message]";
                    try {
                        const parsed = JSON.parse(decryptedPayload.text);
                        if (parsed && typeof parsed.transcript !== 'undefined') {
                            decryptedTranscript = parsed.transcript;
                        }
                    } catch (e) {}
                    console.log("[Nexus ASR I] Decrypted voice message transcript:", decryptedTranscript);
                    
                    if (isCancelled) break;
                    decryptionMetaDataRef.current[msg._id] = {
                        text: msg.text,
                        handshakePayload: msg.handshakePayload
                    };
                    setDecryptedMessages(prev => ({
                        ...prev,
                        [msg._id]: decryptedPayload
                    }));

                    if (expectingIncomingVisualizerRef.current === msg._id) {
                        expectingIncomingVisualizerRef.current = null;
                        setVisualizerData({
                            plaintext: decryptedPayload.text,
                            ciphertext: msg.text,
                            type: "receive",
                            username: msg.username,
                            messageNumber: msg.ratchetHeader.messageNumber,
                            sessionId: msg.privateChatId
                        });
                    }
                } catch (error) {
                    console.error("Failed to decrypt message:", msg._id, error);
                    if (isCancelled) break;
                    decryptionMetaDataRef.current[msg._id] = {
                        text: msg.text,
                        handshakePayload: msg.handshakePayload
                    };
                    setDecryptedMessages(prev => ({
                        ...prev,
                        [msg._id]: { text: `[Decryption Failed: ${error.message || error}]`, isError: true }
                    }));
                    if (newlyReceivedMessageIdsRef.current.has(msg._id)) {
                        newlyReceivedMessageIdsRef.current.delete(msg._id);
                    }
                    if (socketRef.current && msg.privateChatId && !requestedResendsRef.current.has(msg._id)) {
                        requestedResendsRef.current.add(msg._id);
                        console.log(`[E2EE Self-Heal] Triggering session reset and resend request for message: ${msg._id}`);
                        socketRef.current.emit("requestSessionResetAndResend", { messageId: msg._id, privateChatId: msg.privateChatId });
                    }
                }
            }
        }

        decryptAll();

        return () => {
            isCancelled = true;
        };
    }, [messages, activePrivate]);


    useEffect(() => {
        if (!activePrivate || !activePrivateName) {
            setPartnerIdentityKey(null);
            setMyIdentityKey(null);
            return;
        }

        async function loadIdentityKeys() {
            try {
                // Try to load from IndexedDB cached session record
                const record = await getFullSessionRecord(activePrivate);
                if (record && record.partnerIdentityPublicKey && record.myIdentityPublicKey) {
                    setPartnerIdentityKey(record.partnerIdentityPublicKey);
                    setMyIdentityKey(record.myIdentityPublicKey);
                } else {
                    // Fetch from server / load from local keys
                    const token = getAuthToken();
                    const response = await fetch(`${getBackendUrl()}/api/keys/bundle/${activePrivateName}`, {
                        headers: { "Authorization": `Bearer ${token}` }
                    });
                    if (response.ok) {
                        const partnerBundle = await response.json();
                        setPartnerIdentityKey(partnerBundle.identityPublicKey);
                        
                        const myKeys = await loadDecryptedKeys(usernameRef.current);
                        if (myKeys) {
                            setMyIdentityKey(myKeys.identityPublicKey);
                            
                            // Cache them in IndexedDB
                            await cacheSessionIdentityKeys(activePrivate, partnerBundle.identityPublicKey, myKeys.identityPublicKey);
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to load identity keys for verification:", err);
            }
        }

        loadIdentityKeys();
    }, [activePrivate, activePrivateName]);

    const [typingUser, setTypingUser] = useState("");
    const [recordingUser, setRecordingUser] = useState(null);
    const recordingTimeoutRef = useRef(null);
    const [onlineUsers, setOnlineUsers] = useState(0);
    const [onlineUserList, setOnlineUserList] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [conversationUsers, setConversationUsers] = useState([]);
    const [drafts, setDrafts] = useState({});

    const messageRef = useRef(message);
    useEffect(() => {
        messageRef.current = message;
    }, [message]);

    const draftsRef = useRef(drafts);
    useEffect(() => {
        draftsRef.current = drafts;
    }, [drafts]);

    const prevChatKeyRef = useRef(null);
    useEffect(() => {
        const currentChatKey = activePrivate ? `dm:${activePrivate}` : (activeRoom ? `room:${activeRoom}` : null);
        const prevChatKey = prevChatKeyRef.current;

        if (prevChatKey !== currentChatKey) {
            // Save draft of the previous chat if it existed
            if (prevChatKey) {
                const latestMsg = messageRef.current;
                setDrafts(prev => {
                    const next = { ...prev, [prevChatKey]: latestMsg };
                    draftsRef.current = next;
                    return next;
                });
            }

            // Load draft for the new chat
            const newDraft = currentChatKey ? (draftsRef.current[currentChatKey] || "") : "";
            setMessage(newDraft);

            // Update ref
            prevChatKeyRef.current = currentChatKey;
        }
    }, [activeRoom, activePrivate]);

    // Decrypt/retrieve last messages for the sidebar from IndexedDB cache
    useEffect(() => {
        const token = getAuthToken();
        if (!token || !conversationUsers.length) return;

        conversationUsers.forEach(async (cUser) => {
            const msg = cUser.lastMessage;
            if (msg && msg.privateChatId && msg.ratchetHeader && msg._id) {
                const cachedMetadata = decryptionMetaDataRef.current[msg._id];
                const hasChanged = !cachedMetadata ||
                    cachedMetadata.text !== msg.text ||
                    JSON.stringify(cachedMetadata.handshakePayload) !== JSON.stringify(msg.handshakePayload);

                if (!decryptedMessages[msg._id] || hasChanged) {
                    try {
                        const decrypted = await decryptAndCacheMessage(msg, username, token);
                        if (decrypted) {
                            decryptionMetaDataRef.current[msg._id] = {
                                text: msg.text,
                                handshakePayload: msg.handshakePayload
                            };
                            setDecryptedMessages(prev => ({
                                ...prev,
                                [msg._id]: decrypted
                            }));
                        }
                    } catch (err) {
                        console.error("Error loading last message decryption:", err);
                    }
                }
            }
        });
    }, [conversationUsers, username]);
    const [editingMsg, setEditingMsg] = useState(null); // { _id, text }
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [showTransitionSettings, setShowTransitionSettings] = useState(false);
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
    const [emailVal, setEmailVal] = useState("");
    const [currentPasswordVal, setCurrentPasswordVal] = useState("");
    const [newPasswordVal, setNewPasswordVal] = useState("");
    const [newPasswordConfirmVal, setNewPasswordConfirmVal] = useState("");
    const [currentUserProfile, setCurrentUserProfile] = useState(null);

    // Other user profile states
    const [selectedProfileUsername, setSelectedProfileUsername] = useState(null);
    const selectedProfileUsernameRef = useRef(selectedProfileUsername);
    useEffect(() => {
        selectedProfileUsernameRef.current = selectedProfileUsername;
    }, [selectedProfileUsername]);
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
    const [activeSidebarTab, setActiveSidebarTab] = useState("messages"); // "messages" or "rooms"
    const [deletedSystemRooms, setDeletedSystemRooms] = useState([]);

    // NexTask global state for sidebar dashboard and command palette
    const [nextaskTasks, setNextaskTasks] = useState([]);
    const [nextaskBoard, setNextaskBoard] = useState("personal");
    const [nextaskRooms, setNextaskRooms] = useState([]);
    const [nextaskActiveTab, setNextaskActiveTab] = useState("board");
    const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

    const handleTasksUpdate = (tasksList, boardName, roomsList) => {
        setNextaskTasks(tasksList);
        setNextaskBoard(boardName);
        setNextaskRooms(roomsList);
    };

    const [pendingRequests, setPendingRequests] = useState([]);

    const [activeModalTab, setActiveModalTab] = useState("create"); // "create" or "join"
    const [codeArray, setCodeArray] = useState(Array(6).fill(""));
    const [activeRoomDetails, setActiveRoomDetails] = useState(null); // { name, code, admin, members, isPrivate }
    const [createRoomName, setCreateRoomName] = useState("");
    const [joinCode, setJoinCode] = useState("");
    const [joinError, setJoinError] = useState("");

    // Hanging ID Card Physics & Spring Values
    const [idDragging, setIdDragging] = useState(false);
    const idDraggingRef = useRef(false);
    const pullX = useMotionValue(0);
    const pullY = useMotionValue(0);
    const springX = useSpring(pullX, { stiffness: 160, damping: 26, mass: 1.1 });
    const springY = useSpring(pullY, { stiffness: 160, damping: 26, mass: 1.1 });
    const idRotate  = useMotionValue(0);
    const smoothRotate = useSpring(idRotate, { stiffness: 140, damping: 24, mass: 1.0 });
    const [cardX, setCardX] = useState(0);
    const [cardY, setCardY] = useState(0);

    const lanyardPath = useTransform(
        [springX, springY],
        ([x, y]) => {
            const targetX = 300 + x;
            const targetY = 286 + y;
            return `M 220,0 C 220,150 280,280 ${targetX},${targetY} C 320,280 380,150 380,0`;
        }
    );

    const claspRotate = useTransform(
        [springX, springY],
        ([x, y]) => {
            const dx = -x;
            const dy = 312 + y;
            const rad = Math.atan2(dx, dy);
            return rad * (180 / Math.PI);
        }
    );

    useEffect(() => {
        const unsubX = springX.on("change", v => setCardX(v));
        const unsubY = springY.on("change", v => setCardY(v));
        return () => {
            unsubX();
            unsubY();
        };
    }, [springX, springY]);

    useEffect(() => {
        const handleGlobalKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setIsCommandPaletteOpen(prev => !prev);
            }
        };
        window.addEventListener("keydown", handleGlobalKeyDown);
        return () => window.removeEventListener("keydown", handleGlobalKeyDown);
    }, []);

    useEffect(() => {
        if (!selectedProfileUsername) {
            idDraggingRef.current = false;
            setIdDragging(false);
            pullX.jump(0); pullY.jump(0);
            springX.jump(0); springY.jump(0);
            idRotate.jump(0); smoothRotate.jump(0);
        }
    }, [selectedProfileUsername, pullX, pullY, springX, springY, idRotate, smoothRotate]);

    const dragStartX = useRef(0);
    const dragStartY = useRef(0);
    const onPointerDown = (e) => {
        const tag = e.target.tagName.toLowerCase();
        if (tag === 'button' || tag === 'input' || tag === 'textarea' || tag === 'a' || tag === 'select' || tag === 'label' || e.target.closest('button') || e.target.closest('a') || e.target.closest('input') || e.target.closest('.card-actions-grid') || e.target.closest('.cyber-actions-tray') || e.target.closest('.cyber-avatar-wrapper')) return;
        idDraggingRef.current = true;
        setIdDragging(true);
        dragStartX.current = e.clientX;
        dragStartY.current = e.clientY;
        e.currentTarget.setPointerCapture(e.pointerId);
        
        const onMove = (ev) => {
            if (!idDraggingRef.current) return;
            const dx = ev.clientX - dragStartX.current;
            const dy = ev.clientY - dragStartY.current;
            pullX.set(dx * 0.75);
            pullY.set(dy * 0.85);
            idRotate.set(dx * 0.12);
        };
        
        const onUp = () => {
            idDraggingRef.current = false;
            setIdDragging(false);
            pullX.set(0);
            pullY.set(0);
            idRotate.set(0);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    };

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
        messageIds: [],
        deleteFor: 'me',
        hasFile: false,
        deleteFileFromServer: true
    });
    const [undoDeleteInfo, setUndoDeleteInfo] = useState(null);
    const [undoClearInfo, setUndoClearInfo] = useState(null);
    const clearTimeoutRef = useRef(null);

    const undoDeleteInfoRef = useRef(undoDeleteInfo);
    useEffect(() => {
        undoDeleteInfoRef.current = undoDeleteInfo;
    }, [undoDeleteInfo]);

    const undoClearInfoRef = useRef(undoClearInfo);
    useEffect(() => {
        undoClearInfoRef.current = undoClearInfo;
    }, [undoClearInfo]);

    // Message multi-selection states
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedMessageIds, setSelectedMessageIds] = useState(new Set());
    const deleteTimeoutRef = useRef(null);
    const [copyToastActive, setCopyToastActive] = useState(false);
    const copyToastTimeoutRef = useRef(null);

    // Message locking states
    const [lockingMessage, setLockingMessage] = useState(null);
    const [unlockingMessage, setUnlockingMessage] = useState(null);
    const [unlockingPinData, setUnlockingPinData] = useState(null);

    // Notification states and refs
    const [notificationActive, setNotificationActive] = useState(false);
    const [activeToast, setActiveToast] = useState(null);
    const glowTimeoutRef = useRef(null);
    const toastTimeoutRef = useRef(null);

    const [nextaskUsers, setNexTaskUsers] = useState([]);
    const [addToWorkMsg, setAddToWorkMsg] = useState(null);
    const [highlightMessageId, setHighlightMessageId] = useState(null);

    // Pinning states
    const [pinTargetMessage, setPinTargetMessage] = useState(null);
    const [activePinnedIndex, setActivePinnedIndex] = useState(0);
    const [showPinnedMenu, setShowPinnedMenu] = useState(false);

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

    useEffect(() => {
        setIsSelectionMode(false);
        setSelectedMessageIds(new Set());

        // Commit pending deletes immediately on room change

        if (deleteTimeoutRef.current) {
            clearTimeout(deleteTimeoutRef.current);
            deleteTimeoutRef.current = null;
            const info = undoDeleteInfoRef.current;
            if (info) {
                const prevTargets = info.messageIds || [info.messageId];
                prevTargets.forEach(id => {
                    socketRef.current?.emit("deleteMessage", {
                        messageId: id,
                        deleteFor: info.deleteFor,
                        deleteFileFromServer: info.deleteFileFromServer
                    });
                });
                setUndoDeleteInfo(null);
            }
        }

        // Commit pending clears immediately on room change
        if (clearTimeoutRef.current) {
            clearTimeout(clearTimeoutRef.current);
            clearTimeoutRef.current = null;
            const info = undoClearInfoRef.current;
            if (info) {
                socketRef.current?.emit("clearChat", { chatId: info.chatId });
                setUndoClearInfo(null);
            }
        }
    }, [activeRoom, activePrivate]);

    const allUsersRef = useRef(allUsers);
    useEffect(() => {
        allUsersRef.current = allUsers;
    }, [allUsers]);

    // Handle page refresh/close while there are pending undo timeouts
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (deleteTimeoutRef.current && undoDeleteInfoRef.current) {
                const info = undoDeleteInfoRef.current;
                const prevTargets = info.messageIds || [info.messageId];
                prevTargets.forEach(id => {
                    socketRef.current?.emit("deleteMessage", {
                        messageId: id,
                        deleteFor: info.deleteFor,
                        deleteFileFromServer: info.deleteFileFromServer
                    });
                });
            }
            if (clearTimeoutRef.current && undoClearInfoRef.current) {
                const info = undoClearInfoRef.current;
                socketRef.current?.emit("clearChat", { chatId: info.chatId });
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    useEffect(() => {
        const tokenVal = getAuthToken();
        if (!tokenVal) return;
        const fetchNexTaskUsers = async () => {
            try {
                const res = await fetch(`${getBackendUrl()}/api/user/list`, {
                    headers: { "Authorization": `Bearer ${tokenVal}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setNexTaskUsers(data.users || []);
                }
            } catch (err) {
                console.error("Failed to load nextask users list:", err);
            }
        };
        fetchNexTaskUsers();
    }, []);

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

    const formatNotificationText = (data) => {
        const isVoiceMessage = data.fileType === "audio/e2ee" || data.fileType?.startsWith("audio/");
        if (isVoiceMessage) {
            let voiceData = null;
            try {
                voiceData = JSON.parse(data.text);
            } catch(e) {}
            if (voiceData) {
                let transcriptText = voiceData.transcript || "";
                if (transcriptText.length > 10) {
                    transcriptText = transcriptText.substring(0, 10) + "...";
                }
                const secs = voiceData.duration;
                let durationStr = "";
                if (typeof secs !== "undefined" && secs !== null) {
                    const m = Math.floor(secs / 60);
                    const s = Math.floor(secs % 60);
                    durationStr = `(${m}:${s < 10 ? "0" : ""}${s})`;
                }
                return `Sent voice message\n${transcriptText} ${durationStr}`.trim();
            }
        }
        return data.text || "Sent an attachment";
    };

    const triggerDesktopNotification = (data) => {
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            const rawBody = formatNotificationText(data);
            const bodyText = stripMarkdownAndHtml(rawBody);
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

    const fetchPendingRequests = async () => {
        if (isGuest || !username) return;
        try {
            const res = await fetch(`${getBackendUrl()}/api/user/friend-requests/pending`, {
                headers: { "Authorization": `Bearer ${getAuthToken()}` }
            });
            if (res.ok) {
                const data = await res.json();
                setPendingRequests(data.incoming || []);
            }
        } catch (err) {
            console.error("Error fetching pending requests:", err);
        }
    };

    const reloadSelectedProfileCard = async (uname) => {
        if (!uname) return;
        try {
            const response = await fetch(`${getBackendUrl()}/api/user/profile/${uname}`, {
                headers: { "Authorization": `Bearer ${getAuthToken()}` }
            });
            const data = await response.json();
            if (response.ok) {
                setSelectedProfileData(data);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleAcceptRequest = async (targetUsername) => {
        try {
            const response = await fetch(`${getBackendUrl()}/api/user/friend-request/accept`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${getAuthToken()}`
                },
                body: JSON.stringify({ targetUsername })
            });
            if (response.ok) {
                await fetchPendingRequests();
                if (selectedProfileUsernameRef.current?.toLowerCase() === targetUsername.toLowerCase()) {
                    await reloadSelectedProfileCard(targetUsername);
                }
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleDeclineRequest = async (targetUsername) => {
        try {
            const response = await fetch(`${getBackendUrl()}/api/user/friend-request/decline`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${getAuthToken()}`
                },
                body: JSON.stringify({ targetUsername })
            });
            if (response.ok) {
                await fetchPendingRequests();
                if (selectedProfileUsernameRef.current?.toLowerCase() === targetUsername.toLowerCase()) {
                    await reloadSelectedProfileCard(targetUsername);
                }
            }
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        if (isGuest || !username) return;
        
        async function fetchUserData() {
            const token = getAuthToken();
            if (!token) return;
            
            ApiClient.request(`${getBackendUrl()}/api/users`, {
                headers: { "Authorization": `Bearer ${token}` }
            })
            .then(data => setAllUsers(data))
            .catch(err => console.error("Error fetching user list:", err));

            ApiClient.request(`${getBackendUrl()}/api/users/conversations`, {
                headers: { "Authorization": `Bearer ${token}` }
            })
            .then(data => setConversationUsers(data))
            .catch(err => console.error("Error fetching conversations:", err));

            ApiClient.request(`${getBackendUrl()}/api/user/profile/${username}`, {
                headers: { "Authorization": `Bearer ${token}` }
            })
            .then(data => setOwnProfileData(data))
            .catch(err => console.error("Error fetching own profile:", err));
        }
        
        fetchUserData();
        fetchPendingRequests();
    }, [username, isGuest]);

    useEffect(() => {
        if (isGuest) {
            try {
                const localDeleted = JSON.parse(localStorage.getItem("deletedSystemRooms") || "[]");
                setDeletedSystemRooms(localDeleted);
            } catch (e) {
                console.error(e);
            }
        } else if (ownProfileData) {
            setDeletedSystemRooms(ownProfileData.deletedSystemRooms || []);
        }
    }, [ownProfileData, isGuest]);

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

        // Check if one-time prekeys are low on the server and replenish them
        if (token && !token.startsWith("guest:")) {
            replenishOneTimePrekeysIfNeeded(usernameRef.current, token);
            
            // Auto-redirect if E2EE secure keys or master key is missing
            (async () => {
                const myKeys = await loadDecryptedKeys(usernameRef.current);
                if (!myKeys) {
                    console.warn("Local E2EE keys or master key not found. Redirecting to login.");
                    alert("Your secure session has expired or cryptographic keys are missing. Please log in again to restore your private chats.");
                    sessionStorage.removeItem("token");
                    localStorage.removeItem("token");
                    navigate("/login");
                }
            })();
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
                }
            }
        });

        newSocket.on("connect_error", (err) => {
            console.warn("Socket connection error:", err);
            // Only log out if it is an explicit authentication error
            if (err && (err.message === "Authentication required" || err.message === "Invalid token")) {
                sessionStorage.removeItem("token");
                localStorage.removeItem("token");
                sessionStorage.removeItem("username");
                localStorage.removeItem("username");
                sessionStorage.removeItem("nexus_master_key");
                localStorage.removeItem("nexus_master_key");
                navigate("/login");
            }
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
                    setLoadingMessages(false);
                }
            } else if (room) {
                if (activeRoomRef.current === room) {
                    setMessages(msgs);
                    setLoadingMessages(false);
                }
            } else {
                setMessages(msgs);
                setLoadingMessages(false);
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

        newSocket.on("chatCleared", ({ chatId }) => {
            setConversationUsers(prev => prev.map(u => {
                const privateChatId = [usernameRef.current?.toLowerCase(), u.username?.toLowerCase()].sort().join("_");
                if (privateChatId === chatId || u.username === chatId) {
                    return { ...u, lastMessage: null };
                }
                return u;
            }));
        });

        newSocket.on("reply", (data) => {
            console.log("[Nexus ASR H] Received socket reply payload:", JSON.stringify(data));
            if (data.privateChatId) {
                const parts = data.privateChatId.split("_");
                const partnerUsername = parts.find(u => u.toLowerCase() !== usernameRef.current.toLowerCase());
                if (partnerUsername) {
                    setConversationUsers((prev) => {
                        const lowerPartner = partnerUsername.toLowerCase();
                        const index = prev.findIndex(u => u.username?.toLowerCase() === lowerPartner);
                        const lastMsgObj = {
                            _id: data._id,
                            text: data.text,
                            username: data.username,
                            ratchetHeader: data.ratchetHeader,
                            fileUrl: data.fileUrl,
                            fileName: data.fileName,
                            fileType: data.fileType,
                            voiceMessage: data.voiceMessage,
                            createdAt: data.createdAt,
                            seenBy: data.seenBy
                        };
                        if (index !== -1) {
                            const updated = [...prev];
                            const [targetUser] = updated.splice(index, 1);
                            const updatedUser = {
                                ...targetUser,
                                lastMessage: lastMsgObj
                            };
                            return [updatedUser, ...updated];
                        } else {
                            const userObj = allUsersRef.current.find(u => u.username?.toLowerCase() === lowerPartner);
                            const newUser = {
                                ...(userObj || { username: partnerUsername, displayName: partnerUsername, status: "Offline" }),
                                lastMessage: lastMsgObj
                            };
                            return [newUser, ...prev];
                        }
                    });
                }
            }

            // If we received our own sent message back, process cache transition
            if (data.tempId && data.username?.toLowerCase() === usernameRef.current?.toLowerCase()) {
                setDecryptedMessages((prev) => {
                    const cachedDecrypted = prev[data.tempId];
                    if (cachedDecrypted) {
                        saveDecryptedMessage(data._id, cachedDecrypted).catch(err => {
                            console.error("Failed to save optimistic message decrypt to IndexedDB cache:", err);
                        });
                        return {
                            ...prev,
                            [data._id]: cachedDecrypted
                        };
                    }
                    return prev;
                });
            }

            const isMatch = data.privateChatId
                ? (activePrivateRef.current?.toLowerCase() === data.privateChatId?.toLowerCase())
                : (activeRoomRef.current === data.room);

            if (isMatch) {
                if (data.privateChatId && data.username?.toLowerCase() !== usernameRef.current?.toLowerCase()) {
                    expectingIncomingVisualizerRef.current = data._id;
                }
                if (data._id) {
                    newlyReceivedMessageIdsRef.current.add(data._id);
                }
                setMessages((prev) => {
                    if (data.tempId && data.username?.toLowerCase() === usernameRef.current?.toLowerCase()) {
                        const index = prev.findIndex(m => m._id === data.tempId);
                        if (index !== -1) {
                            const updated = [...prev];
                            updated[index] = data;
                            return updated;
                        }
                    }
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

                // Decrypt message asynchronously for E2EE notifications/toasts
                (async () => {
                    let displayData = { ...data };
                    if (data.privateChatId && data.ratchetHeader) {
                        try {
                            const token = getAuthToken();
                            const decryptedPayload = await decryptAndCacheMessage(data, usernameRef.current, token);
                            displayData = {
                                ...displayData,
                                text: decryptedPayload.text,
                                fileUrl: decryptedPayload.fileUrl,
                                fileName: decryptedPayload.fileName,
                                fileSize: decryptedPayload.fileSize,
                                fileType: decryptedPayload.fileType,
                                fileQuality: decryptedPayload.fileQuality
                            };
                        } catch (err) {
                            console.error("Failed to decrypt incoming message for notification:", err);
                            displayData.text = "[Decrypted Message]";
                        }
                    }

                    if (!isMatch) {
                        const displayName = displayData.displayName || displayData.username;
                        const chatType = displayData.privateChatId ? "private" : "room";
                        
                        let partnerUsername = displayData.username;
                        if (displayData.privateChatId) {
                            const parts = displayData.privateChatId.split("_");
                            const partner = parts.find(u => u.toLowerCase() !== usernameRef.current.toLowerCase());
                            if (partner) {
                                partnerUsername = partner;
                            }
                        }

                        setActiveToast({
                            id: displayData._id || Date.now(),
                            sender: displayName,
                            senderUsername: partnerUsername,
                            text: formatNotificationText(displayData),
                            avatarUrl: displayData.avatarUrl || displayData.senderAvatar,
                            room: displayData.room,
                            privateChatId: displayData.privateChatId,
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
                        triggerDesktopNotification(displayData);
                    }
                })();
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

        newSocket.on("recordingStart", (recordingData) => {
            if (!recordingData || !recordingData.username) return;
            const isMatch = recordingData.privateChatId
                ? (activePrivateRef.current?.toLowerCase() === recordingData.privateChatId?.toLowerCase())
                : (activeRoomRef.current === recordingData.room);
            if (!isMatch) return;

            setRecordingUser(recordingData);
            if (recordingTimeoutRef.current) {
                clearTimeout(recordingTimeoutRef.current);
            }
            recordingTimeoutRef.current = setTimeout(() => {
                setRecordingUser(null);
            }, 30000);
        });

        newSocket.on("recordingStop", (data) => {
            if (data && data.username) {
                const isMatch = data.privateChatId
                    ? (activePrivateRef.current?.toLowerCase() === data.privateChatId?.toLowerCase())
                    : (activeRoomRef.current === data.room);
                if (isMatch) {
                    setRecordingUser(prev => (prev && prev.username?.toLowerCase() === data.username?.toLowerCase()) ? null : prev);
                }
            }
        });

        newSocket.on("onlineUsers", (count) => setOnlineUsers(count));
        newSocket.on("onlineUserList", (list) => setOnlineUserList(list));

        newSocket.on("taskAssigned", (task) => {
            playNotificationSound();
            setActiveToast({
                sender: "NexTask Manager",
                text: `You have been assigned a new task: "${task.title}"`,
                avatar: ""
            });
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
            toastTimeoutRef.current = setTimeout(() => {
                setActiveToast(null);
            }, 5000);

            triggerDesktopNotification({
                username: "NexTask",
                text: `You have been assigned a new task: "${task.title}"`,
                displayName: "NexTask Manager"
            });
        });

        newSocket.on("messageUpdated", (updatedMsg) => {
            const isMatch = updatedMsg.privateChatId
                ? (activePrivateRef.current?.toLowerCase() === updatedMsg.privateChatId?.toLowerCase())
                : (activeRoomRef.current === updatedMsg.room);

            if (isMatch) {
                setMessages(prev => {
                    const exists = prev.some(m => m._id === updatedMsg._id);
                    if (exists) {
                        return prev.map(m => (m._id === updatedMsg._id ? updatedMsg : m));
                    }
                    if (updatedMsg.isDeleted) {
                        const list = [...prev, updatedMsg];
                        return list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                    }
                    return prev;
                });
            }

            // Update conversationUsers so the sidebar preview reflects the lock/unlock state instantly
            setConversationUsers(prev => prev.map(user => {
                if (user.lastMessage && user.lastMessage._id === updatedMsg._id) {
                    return {
                        ...user,
                        lastMessage: updatedMsg
                    };
                }
                return user;
            }));
        });


        newSocket.on("messageDeletedForMe", (msgId) => {
            setMessages(prev => prev.filter(m => m._id !== msgId));
        });

        newSocket.on("customRoomsList", (rooms) => {
            setCustomRooms(rooms);
            setCustomRoomsLoading(false);
        });

        newSocket.on("deletedSystemRoomsUpdated", (updatedList) => {
            setDeletedSystemRooms(updatedList || []);
            switchToDefaultRoom(updatedList || []);
        });



        newSocket.on("friendRequestUpdated", async () => {
            await fetchPendingRequests();
            if (selectedProfileUsernameRef.current) {
                await reloadSelectedProfileCard(selectedProfileUsernameRef.current);
            }
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

        newSocket.on("error", (err) => {
            console.error("Socket error event received:", err);
            alert(err.message || "An error occurred on the socket connection.");
        });

        newSocket.on("roomDeleted", ({ roomName }) => {
            if (activeRoomRef.current === roomName) {
                alert(`The private room #${roomName} has been deleted by the admin.`);
                switchToDefaultRoom(deletedSystemRooms);
                setMessages([]);
            }
        });

        newSocket.on("sessionResetRequested", async ({ privateChatId }) => {
            console.log(`Session reset requested for private chat ${privateChatId}. Deleting local session state...`);
            await deleteSessionState(privateChatId);
        });

        newSocket.on("sessionResetAndResendRequested", async ({ messageId, privateChatId }) => {
            console.log(`[E2EE Self-Heal] Partner requested session reset and message resend for message ID: ${messageId}`);
            
            // 1. Delete local session state to force a new handshake
            await deleteSessionState(privateChatId);

            // 2. Find message in current messages array
            const msg = messagesRef.current.find(m => m._id === messageId);
            if (!msg) {
                console.warn(`[E2EE Self-Heal] Message ${messageId} not found in messagesRef.`);
                return;
            }

            // 3. Re-encrypt and resend
            try {
                const token = sessionStorage.getItem("token") || localStorage.getItem("token");
                const decryptedPayload = await decryptAndCacheMessage(msg, usernameRef.current, token);
                if (!decryptedPayload) {
                    console.warn("[E2EE Self-Heal] Failed to decrypt own message payload.");
                    return;
                }

                // Get partner name
                const partnerName = privateChatId.split("_").find(u => u.toLowerCase() !== usernameRef.current.toLowerCase());

                // Reconstruct attachment object from decrypted payload fields if they exist
                const attachment = decryptedPayload.fileUrl ? {
                    fileUrl: decryptedPayload.fileUrl,
                    fileName: decryptedPayload.fileName,
                    fileSize: decryptedPayload.fileSize,
                    fileType: decryptedPayload.fileType,
                    fileQuality: decryptedPayload.fileQuality
                } : null;

                // Encrypt outgoing message (this will automatically fetch partner's bundle, create a new session and handshake)
                const encryptedMsg = await encryptOutgoingMessage(
                    partnerName,
                    privateChatId,
                    decryptedPayload.text,
                    attachment,
                    token
                );

                // Send the re-encrypted message to the server
                newSocket.emit("resendEncryptedMessage", {
                    messageId,
                    privateChatId,
                    text: encryptedMsg.text,
                    ratchetHeader: encryptedMsg.ratchetHeader,
                    handshakePayload: encryptedMsg.handshakePayload,
                    senderCiphertext: encryptedMsg.senderCiphertext
                });
                console.log(`[E2EE Self-Heal] Re-encrypted and resent message ID: ${messageId}`);
            } catch (err) {
                console.error("[E2EE Self-Heal] Error re-encrypting message for resend:", err);
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
            if (Array.isArray(updatedMsgs)) {
                setMessages((prev) => {
                    return prev.map(msg => {
                        const match = updatedMsgs.find(u => u._id === msg._id);
                        return match ? { ...msg, seenBy: match.seenBy } : msg;
                    });
                });
                setConversationUsers((prev) => {
                    return prev.map(user => {
                        if (user.lastMessage) {
                            const match = updatedMsgs.find(u => u._id === user.lastMessage._id);
                            if (match) {
                                return {
                                    ...user,
                                    lastMessage: {
                                        ...user.lastMessage,
                                        seenBy: match.seenBy
                                    }
                                };
                            }
                        }
                        return user;
                    });
                });
            }
        });

        // Parse search query params on socket connect
        const roomUrl = searchParams.get("room");
        const privateUrl = searchParams.get("private");

        if (isGuest) {
            // Guest route protection on mount
            if (roomUrl && roomUrl !== "Nexus Official") {
                setShowLoginModal(true);
                setSearchParams({});
                setActiveRoom(null);
                setActivePrivate(null);
                setActiveSidebarTab("messages");
            } else if (roomUrl === "Nexus Official") {
                setActiveRoom("Nexus Official");
                setActivePrivate(null);
                setActiveSidebarTab("messages");
            } else {
                setActiveRoom(null);
                setActivePrivate(null);
                setActiveSidebarTab("messages");
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
                    setActiveSidebarTab("messages");
                }
            } else if (roomUrl) {
                setActiveRoom(roomUrl);
                setActivePrivate(null);
                setActiveSidebarTab("messages");
            } else {
                setActiveRoom(null);
                setActivePrivate(null);
                setActiveSidebarTab("messages");
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
            if ((room && room !== "Nexus Official") || privateUser) {
                setShowLoginModal(true);
                setSearchParams({ room: "Nexus Official" });
            }
        }
    }, [searchParams, isGuest, setSearchParams]);



    function selectRoom(room) {
        if (isGuest && room !== "Nexus Official") {
            setShowLoginModal(true);
            return;
        }
        clearVaultState();
        setSearchParams({ room });
        setActiveRoom(room);
        setActivePrivate(null);
        setActivePrivateName("");
        setMessages([]);
        setLoadingMessages(true);
        setSidebarOpen(false);
        setTypingUser(null);
        setRecordingUser(null);
        setActiveSidebarTab("rooms");
        setUnreadCounts(prev => ({ ...prev, [room]: 0 }));
        socketRef.current?.emit("joinRoom", room);
    }

    // Join direct private message conversation
    function selectPrivate(privateChatId, otherUsername) {
        if (isGuest) {
            setShowLoginModal(true);
            return;
        }
        clearVaultState();
        setSearchParams({ private: otherUsername });
        setActivePrivate(privateChatId);
        setActivePrivateName(otherUsername);
        setActiveRoom(null);
        setMessages([]);
        setLoadingMessages(true);
        setSidebarOpen(false);
        setTypingUser(null);
        setRecordingUser(null);
        setActiveSidebarTab("messages");
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

    const switchToDefaultRoom = (deletedList = []) => {
        // Do not auto-select a room on initial load or if no room is selected,
        // so that the user stays on the Crowd Canvas page.
        if (!activeRoomRef.current && !activePrivateRef.current) {
            setSearchParams({});
            setActiveRoom(null);
            setActiveRoomDetails(null);
            return;
        }

        // If there's already an active room/private chat in current ref states, check if it's still valid
        if (activePrivateRef.current) {
            // Already in a private message, do not switch
            return;
        }

        if (activeRoomRef.current) {
            // If the current activeRoom is one of the system rooms, check if it was deleted
            const ROOMS = ["Nexus Official"];
            if (ROOMS.includes(activeRoomRef.current)) {
                if (!deletedList.includes(activeRoomRef.current)) {
                    // Current system room is not deleted, so keep it!
                    return;
                }
            } else {
                // It's a custom room/private room, so don't switch (unless it's deleted, but roomDeleted socket event handles that)
                return;
            }
        }

        // Otherwise, fall back to the first non-deleted system room (or Crowd Canvas page if none)
        const ROOMS = ["Nexus Official"];
        const remaining = ROOMS.filter(r => !deletedList.includes(r));
        if (remaining.length > 0) {
            const nextRoom = remaining[0];
            setSearchParams({ room: nextRoom });
            setActiveRoom(nextRoom);
        } else {
            setSearchParams({});
            setActiveRoom(null);
            setActiveRoomDetails(null);
        }
    };

    const clearActiveChat = () => {
        clearVaultState();
        setSearchParams({});
        setActiveRoom(null);
        setActiveRoomDetails(null);
        setActivePrivate(null);
        setActivePrivateName("");
        setMessages([]);
        setSidebarOpen(false); // Close sidebar on mobile
    };

    const handleLeaveRoom = () => {
        if (!activeRoom) return;
        const isPrivateRoom = activeRoomDetails && activeRoomDetails.isPrivate;

        if (isPrivateRoom) {
            const isAdmin = activeRoomDetails.admin?._id === ownProfileData?._id || activeRoomDetails.admin?.username === username;
            const confirmMsg = isAdmin 
                ? `Are you sure you want to delete the private room "${activeRoom}"? This will delete the room and disconnect all members.`
                : `Are you sure you want to leave the private room "${activeRoom}"?`;
                
            if (window.confirm(confirmMsg)) {
                socketRef.current?.emit("leaveRoom", activeRoom);
            }
        } else {
            const confirmMsg = `Are you sure you want to delete the room "${activeRoom}"? This will remove it from your room list.`;
            if (window.confirm(confirmMsg)) {
                if (isGuest) {
                    let localDeleted = [];
                    try {
                        localDeleted = JSON.parse(localStorage.getItem("deletedSystemRooms") || "[]");
                    } catch (e) {
                        console.error(e);
                    }
                    if (!localDeleted.includes(activeRoom)) {
                        localDeleted.push(activeRoom);
                        localStorage.setItem("deletedSystemRooms", JSON.stringify(localDeleted));
                    }
                    setDeletedSystemRooms(localDeleted);
                    switchToDefaultRoom(localDeleted);
                } else {
                    socketRef.current?.emit("deleteSystemRoom", { roomName: activeRoom });
                }
            }
        }
    };


    const handleVoiceMessageSend = async (payload) => {
        if (!username || !socketRef.current) return;
        
        try {
            let finalBlob = payload.audioBlob;
            let textToEncrypt = null;

            if (activePrivate) {
                // E2EE mode: Encrypt audio blob and generate inner metadata payload
                const encryptedData = await encryptVoiceMessage(
                    payload.audioBlob,
                    payload.waveform,
                    payload.durationSeconds
                );
                finalBlob = encryptedData.encryptedAudioBlob;
                textToEncrypt = encryptedData.textToEncrypt;
            } else {
                // Public room mode: plain JSON text (transcript handled by backend async)
                textToEncrypt = JSON.stringify({
                    __voice: true,
                    version: 1,
                    waveform: payload.waveform,
                    duration: payload.durationSeconds
                });
            }

            // Upload the blob (encrypted or raw) to GridFS
            const formData = new FormData();
            formData.append("file", finalBlob, activePrivate ? "voice_message.enc" : "voice_message.webm");

            const res = await fetch(`${getBackendUrl()}/api/upload`, {
                method: "POST",
                body: formData
            });

            if (!res.ok) throw new Error("Voice message upload failed");
            const uploadData = await res.json();

            // Send via existing sendMessage flow
            const attachmentMsg = {
                fileUrl: uploadData.fileUrl,
                fileName: uploadData.fileName,
                fileSize: uploadData.fileSize,
                fileType: activePrivate ? "audio/e2ee" : uploadData.fileType,
                fileQuality: "Normal",
                overrideText: textToEncrypt // Will be used as the actual text payload
            };

            console.log("[Nexus ASR E] Message payload prepared:", JSON.stringify(attachmentMsg));

            sendMessage(attachmentMsg);
        } catch (err) {
            console.error("Error sending voice message:", err);
            alert("Failed to send voice message");
        }
    };

    async function sendMessage(attachment = null) {
        if (!username || !socketRef.current) return;

        // Guard against event objects passed via event listeners (e.g. onClick)
        const isEvent = attachment && (
            attachment.nativeEvent || 
            attachment instanceof Event || 
            (typeof attachment === "object" && "target" in attachment && "preventDefault" in attachment)
        );
        const realAttachment = isEvent ? null : attachment;

        if (!realAttachment && !message.trim()) return;

        // Play pop sound feedback
        playPop();

        console.log("DEBUG SENDING MESSAGE: [Content Redacted for E2EE]");

        const tempId = "temp_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
        const originalMessage = message;

        const replyToPayload = replyToMsg ? {
            messageId: replyToMsg._id,
            // If replying to a locked message, never expose the real text in the payload
            text: replyToMsg.isLocked ? "🔒 Locked Message" : replyToMsg.text,
            username: replyToMsg.username
        } : null;

        const tempMsg = {
            _id: tempId,
            username: username,
            displayName: currentUserProfile?.displayName || username,
            text: realAttachment?.overrideText || (realAttachment ? "" : originalMessage),
            room: activeRoom,
            privateChatId: activePrivate,
            createdAt: new Date().toISOString(),
            status: "sending",
            seenBy: [username],
            fileUrl: realAttachment ? realAttachment.fileUrl : null,
            fileName: realAttachment ? realAttachment.fileName : null,
            fileSize: realAttachment ? realAttachment.fileSize : null,
            fileType: realAttachment ? realAttachment.fileType : null,
            fileQuality: realAttachment ? realAttachment.fileQuality : null,
            replyTo: replyToPayload,
            sticker: realAttachment?.sticker || null
        };

        if (activePrivate) {
            const decPayload = {
                text: realAttachment?.overrideText || (realAttachment ? "" : originalMessage),
                fileUrl: realAttachment ? realAttachment.fileUrl : null,
                fileName: realAttachment ? realAttachment.fileName : null,
                fileSize: realAttachment ? realAttachment.fileSize : null,
                fileType: realAttachment ? realAttachment.fileType : null,
                fileQuality: realAttachment ? realAttachment.fileQuality : null,
                sticker: realAttachment?.sticker || null
            };
            setDecryptedMessages(prev => ({
                ...prev,
                [tempId]: decPayload
            }));
        }

        setMessages(prev => [...prev, tempMsg]);

        if (!realAttachment) {
            setMessage("");
            const currentKey = activePrivate ? `dm:${activePrivate}` : (activeRoom ? `room:${activeRoom}` : null);
            if (currentKey) {
                setDrafts(prev => {
                    const next = { ...prev };
                    delete next[currentKey];
                    draftsRef.current = next;
                    return next;
                });
            }
        }
        socketRef.current.emit("stopTyping", {
            room: activeRoom,
            privateChatId: activePrivate
        });

        (async () => {
            let msgData;
            if (activePrivate) {
                try {
                    const token = getAuthToken();
                    // Encrypt message content (with any attachment metadata) via Double Ratchet / X3DH
                    const encryptedPayload = await encryptOutgoingMessage(
                        activePrivateNameRef.current,
                        activePrivateRef.current,
                        realAttachment?.overrideText || (realAttachment ? "" : originalMessage),
                        realAttachment,
                        token
                    );
                    msgData = {
                        ...encryptedPayload,
                        privateChatId: activePrivateRef.current,
                        tempId: tempId,
                        replyTo: replyToPayload
                    };

                    // Trigger live data-flow visualizer for sent messages
                    setVisualizerData({
                        plaintext: realAttachment ? `[Attachment: ${realAttachment.fileName || 'File'}]` : originalMessage,
                        ciphertext: encryptedPayload.text,
                        type: "send",
                        username: activePrivateNameRef.current,
                        messageNumber: encryptedPayload.ratchetHeader.messageNumber,
                        sessionId: activePrivateRef.current
                    });
                } catch (error) {
                    console.error("Encryption failed:", error);
                    setMessages(prev => prev.map(m => m._id === tempId ? { ...m, status: "error", text: `[Failed to encrypt: ${error.message}]` } : m));
                    return;
                }
            } else {
                msgData = realAttachment ? { ...realAttachment, text: realAttachment.overrideText } : { text: originalMessage };
                msgData.room = activeRoomRef.current;
                msgData.tempId = tempId;
                msgData.replyTo = replyToPayload;
            }

            setReplyToMsg(null); // Clear reply state
            console.log("[Nexus ASR F] Socket.IO payload emitted:", JSON.stringify(msgData));
            socketRef.current.emit("message", msgData);
        })();
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

    function emitRecordingStart() {
        if (!socketRef.current) return;
        socketRef.current.emit("recordingStart", {
            room: activeRoom,
            privateChatId: activePrivate
        });
    }

    function emitRecordingStop() {
        if (!socketRef.current) return;
        socketRef.current.emit("recordingStop", {
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

        // If there's an active clear timer, commit it immediately before starting a new one
        if (clearTimeoutRef.current) {
            clearTimeout(clearTimeoutRef.current);
            if (undoClearInfo) {
                socketRef.current?.emit("clearChat", { chatId: undoClearInfo.chatId });
            }
        }

        // If there's an active delete timer, commit it immediately
        if (deleteTimeoutRef.current) {
            clearTimeout(deleteTimeoutRef.current);
            deleteTimeoutRef.current = null;
            if (undoDeleteInfo) {
                const prevTargets = undoDeleteInfo.messageIds || [undoDeleteInfo.messageId];
                prevTargets.forEach(id => {
                    socketRef.current?.emit("deleteMessage", {
                        messageId: id,
                        deleteFor: undoDeleteInfo.deleteFor,
                        deleteFileFromServer: undoDeleteInfo.deleteFileFromServer
                    });
                });
                setUndoDeleteInfo(null);
            }
        }

        const originalMsgs = [...messages];
        const originalConvs = [...conversationUsers];

        setUndoClearInfo({
            chatId,
            originalMsgs,
            originalConvs
        });
        setMessages([]);
        setConversationUsers(prev => prev.map(u => {
            const privateChatId = [username.toLowerCase(), u.username.toLowerCase()].sort().join("_");
            if (privateChatId === chatId || u.username === chatId) {
                return { ...u, lastMessage: null };
            }
            return u;
        }));
        setShowClearConfirm(false);

        clearTimeoutRef.current = setTimeout(() => {
            socketRef.current?.emit("clearChat", { chatId });
            setUndoClearInfo(null);
            clearTimeoutRef.current = null;
        }, 3000);
    }

    const executeUndoClear = () => {
        if (clearTimeoutRef.current) {
            clearTimeout(clearTimeoutRef.current);
            clearTimeoutRef.current = null;
        }

        if (undoClearInfo) {
            // Restore messages locally
            setMessages(undoClearInfo.originalMsgs || []);
            if (undoClearInfo.originalConvs) {
                setConversationUsers(undoClearInfo.originalConvs);
            }
            setUndoClearInfo(null);
        }
    };

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

    const toggleMessageSelection = (messageId) => {
        setSelectedMessageIds(prev => {
            const next = new Set(prev);
            if (next.has(messageId)) {
                next.delete(messageId);
            } else {
                next.add(messageId);
            }
            return next;
        });
    };

    const handleBulkDeleteClick = () => {
        const selectedMsgs = messages.filter(m => selectedMessageIds.has(m._id));
        if (selectedMsgs.length === 0) return;

        const hasFile = selectedMsgs.some(m => !!m.fileUrl);

        setDeleteConfirmModal({
            isOpen: true,
            messageId: null,
            messageIds: selectedMsgs.map(m => m._id),
            deleteFor: 'me',
            hasFile,
            deleteFileFromServer: true
        });
    };

    const handleBulkDownload = () => {
        const selectedMsgs = messages.filter(m => selectedMessageIds.has(m._id));
        selectedMsgs.forEach(msg => {
            if (msg.fileUrl) {
                const link = document.createElement('a');
                link.href = `${getBackendUrl()}${msg.fileUrl}`;
                link.download = msg.fileName || 'download';
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        });
    };

    const handleBulkStar = () => {
        alert("Bulk starring will be available soon!");
    };

    const handleBulkForward = () => {
        alert("Bulk forwarding will be available soon!");
    };

    function handleDelete(messageId, deleteFor) {
        if (deleteFor === "me") {
            setIsSelectionMode(true);
            setSelectedMessageIds(new Set([messageId]));
            return;
        }
        // Intercept delete and trigger warning modal
        const msg = messages.find(m => m._id === messageId);
        setDeleteConfirmModal({
            isOpen: true,
            messageId,
            messageIds: [],
            deleteFor,
            hasFile: !!(msg && msg.fileUrl),
            deleteFileFromServer: true
        });
    }

    const cancelDeleteRequest = () => {
        setDeleteConfirmModal({
            isOpen: false,
            messageId: null,
            messageIds: [],
            deleteFor: 'me',
            hasFile: false,
            deleteFileFromServer: true
        });
    };

    const confirmDelete = () => {
        const { messageId, messageIds, deleteFor, deleteFileFromServer } = deleteConfirmModal;

        // Close modal
        setDeleteConfirmModal({
            isOpen: false,
            messageId: null,
            messageIds: [],
            deleteFor: 'me',
            hasFile: false,
            deleteFileFromServer: true
        });

        const targets = messageIds && messageIds.length > 0 ? messageIds : (messageId ? [messageId] : []);
        if (targets.length === 0) return;

        // If there's an active clear timer, commit it immediately before starting a delete
        if (clearTimeoutRef.current) {
            clearTimeout(clearTimeoutRef.current);
            clearTimeoutRef.current = null;
            const info = undoClearInfoRef.current;
            if (info) {
                socketRef.current?.emit("clearChat", { chatId: info.chatId });
                setUndoClearInfo(null);
            }
        }

        // If there's an active undo timer, commit it immediately before starting the next one
        if (deleteTimeoutRef.current) {
            clearTimeout(deleteTimeoutRef.current);
            if (undoDeleteInfo) {
                const prevTargets = undoDeleteInfo.messageIds || [undoDeleteInfo.messageId];
                prevTargets.forEach(id => {
                    socketRef.current?.emit("deleteMessage", {
                        messageId: id,
                        deleteFor: undoDeleteInfo.deleteFor,
                        deleteFileFromServer: undoDeleteInfo.deleteFileFromServer
                    });
                });
            }
        }

        const originalMsgs = messages.filter(m => targets.includes(m._id));

        // Hide messages locally
        setMessages(prev => prev.filter(m => !targets.includes(m._id)));

        // Set undo state details
        setUndoDeleteInfo({
            messageId: targets.length === 1 ? targets[0] : null,
            messageIds: targets,
            deleteFor,
            originalMsg: targets.length === 1 ? originalMsgs[0] : null,
            originalMsgs,
            deleteFileFromServer
        });

        setIsSelectionMode(false);
        setSelectedMessageIds(new Set());

        // Start 3 second commit timer
        deleteTimeoutRef.current = setTimeout(() => {
            targets.forEach(id => {
                socketRef.current?.emit("deleteMessage", {
                    messageId: id,
                    deleteFor,
                    deleteFileFromServer
                });
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
            // Restore messages locally
            const toRestore = undoDeleteInfo.originalMsgs || (undoDeleteInfo.originalMsg ? [undoDeleteInfo.originalMsg] : []);
            if (toRestore.length > 0) {
                setMessages(prev => {
                    const nextList = [...prev];
                    toRestore.forEach(msg => {
                        if (!nextList.some(m => m._id === msg._id)) {
                            nextList.push(msg);
                        }
                    });
                    return nextList.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                });
            }
            setUndoDeleteInfo(null);
        }
    };

    function handleLockMessage(msg) {
        if (msg.fileUrl) return;
        setLockingMessage(msg);
    }

    function handleLockMessageSuccess(messageId, lockedItemId) {
        socketRef.current?.emit("lockMessage", { messageId, lockedItemId });
        setLockingMessage(null);
    }

    function handleOpenAddToWorkModal(msg) {
        setAddToWorkMsg(msg);
    }

    async function handleCreateTaskFromModal(taskPayload) {
        try {
            const tokenVal = getAuthToken();
            const res = await fetch(`${getBackendUrl()}/api/nextask/tasks`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tokenVal}`
                },
                body: JSON.stringify(taskPayload)
            });
            if (res.ok) {
                setAddToWorkMsg(null);
                setActiveSidebarTab("nextask");
            } else {
                alert("Failed to add task to nextask.");
            }
        } catch (err) {
            console.error("Failed to add task to nextask:", err);
            alert("Error adding task to nextask.");
        }
    }

    function handleNavigateToMessage(chatId, messageId) {
        setActiveRoom(null);
        setActivePrivate(null);
        setHighlightMessageId(messageId);

        if (chatId.includes("_")) {
            const users = chatId.split("_");
            const otherUser = users.find(u => u.toLowerCase() !== username.toLowerCase());
            setActivePrivate(chatId);
            setActivePrivateName(otherUser);
            setActiveSidebarTab("messages");
        } else {
            setActiveRoom(chatId);
            setActiveSidebarTab("rooms");
        }
    }

    function handlePinMessageConfirm(msg, duration) {
        socketRef.current?.emit("pinMessage", { messageId: msg._id, duration });
        setPinTargetMessage(null);
    }

    function handleUnpinActiveMessage(msgId) {
        socketRef.current?.emit("unpinMessage", { messageId: msgId });
        setShowPinnedMenu(false);
    }

    function handleScrollToPinnedMessage(msgId) {
        setHighlightMessageId(null);
        setTimeout(() => {
            setHighlightMessageId(msgId);
        }, 50);
        setShowPinnedMenu(false);
    }

    async function handleUnlockLockedMessage(msg) {
        try {
            const pinId = `vault_pin_${username.toLowerCase()}_${activePrivate.toLowerCase()}`;
            const pinData = await getVaultPinData(pinId);
            if (pinData) {
                setUnlockingPinData(pinData);
                setUnlockingMessage(msg);
            } else {
                alert("No Shared Vault PIN configured for this chat. Please configure it first.");
            }
        } catch (e) {
            console.error("Failed to load vault PIN data:", e);
        }
    }

    const handleCopySuccess = () => {
        if (copyToastTimeoutRef.current) {
            clearTimeout(copyToastTimeoutRef.current);
        }
        setCopyToastActive(true);
        copyToastTimeoutRef.current = setTimeout(() => {
            setCopyToastActive(false);
            copyToastTimeoutRef.current = null;
        }, 3000);
    };

    useEffect(() => {
        return () => {
            if (copyToastTimeoutRef.current) {
                clearTimeout(copyToastTimeoutRef.current);
            }
        };
    }, []);

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
                setEmailVal(data.email || "");
                setCurrentPasswordVal("");
                setNewPasswordVal("");
                setNewPasswordConfirmVal("");
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

        if (newPasswordVal && newPasswordVal !== newPasswordConfirmVal) {
            setProfileError("New passwords do not match.");
            setProfileLoading(false);
            return;
        }

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
                    username: editUsernameVal,
                    email: emailVal,
                    currentPassword: currentPasswordVal,
                    newPassword: newPasswordVal
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

                setCurrentPasswordVal("");
                setNewPasswordVal("");
                setNewPasswordConfirmVal("");
                setProfileLoading(false);
                setShowProfileSettings(false);
                setActiveToast({
                    sender: "System",
                    content: "Profile updated successfully!",
                    avatarUrl: "",
                    chatType: "system"
                });
                if (toastTimeoutRef.current) {
                    clearTimeout(toastTimeoutRef.current);
                }
                toastTimeoutRef.current = setTimeout(() => {
                    setActiveToast(null);
                }, 4000);
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
        const canvasSize = 500; // Output optimized resolution (500x500 pixels)
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
        
        let endpoint = "";
        const status = selectedProfileData.friendshipStatus;
        
        if (status === "friends") {
            endpoint = "friend-request/remove";
        } else if (status === "requested") {
            endpoint = "friend-request/cancel";
        } else if (status === "pending_approval") {
            endpoint = "friend-request/accept";
        } else {
            endpoint = "friend-request/send";
        }
        
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
                await reloadSelectedProfileCard(selectedProfileData.username);
                await fetchPendingRequests();
            }
        } catch (err) {
            console.error(err);
        }
    }

    async function handleFriendDecline() {
        if (!selectedProfileData) return;
        try {
            const response = await fetch(`${getBackendUrl()}/api/user/friend-request/decline`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${getAuthToken()}`
                },
                body: JSON.stringify({ targetUsername: selectedProfileData.username })
            });
            if (response.ok) {
                await reloadSelectedProfileCard(selectedProfileData.username);
                await fetchPendingRequests();
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
        sessionStorage.removeItem("username");
        localStorage.removeItem("username");
        sessionStorage.removeItem("nexus_master_key");
        localStorage.removeItem("nexus_master_key");
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
            setActiveToast({
                sender: "System",
                content: "Guest profile updated successfully!",
                avatarUrl: "",
                chatType: "system"
            });
            if (toastTimeoutRef.current) {
                clearTimeout(toastTimeoutRef.current);
            }
            toastTimeoutRef.current = setTimeout(() => {
                setActiveToast(null);
            }, 4000);
        } catch (err) {
            console.error(err);
            setProfileError("Connection error. Please try again.");
            setProfileLoading(false);
        }
    }

    const dmConversations = React.useMemo(() => {
        let list = conversationUsers.map((cUser) => {
            let lastMsgText = "";
            if (cUser.lastMessage) {
                const msg = cUser.lastMessage;
                if (msg.isLocked) {
                    let suffix = msg.createdAt ? ` · ${formatRelativeTime(msg.createdAt)}` : "";
                    lastMsgText = `🔒 Locked Message${suffix}`;
                } else {
                    const isOwnMsg = msg.username?.toLowerCase() === username?.toLowerCase();

                    if (isOwnMsg) {
                        const hasSeen = msg.seenBy?.filter(u => u?.toLowerCase() !== username?.toLowerCase()).length > 0;
                        if (hasSeen) {
                            const seenTime = msg.seenAt ? formatRelativeTime(msg.seenAt) : (msg.createdAt ? formatRelativeTime(msg.createdAt) : "");
                            lastMsgText = seenTime ? `Seen ${seenTime}` : "Seen";
                        } else {
                            if (msg.createdAt) {
                                const relativeTime = formatRelativeTime(msg.createdAt);
                                lastMsgText = `Sent ${relativeTime}`;
                            } else {
                                lastMsgText = "Sent";
                            }
                        }
                    } else {
                        let innerText = "";
                        if (decryptedMessages[msg._id]) {
                            const decrypted = decryptedMessages[msg._id];
                            if (decrypted.text) {
                                try {
                                    const parsed = JSON.parse(decrypted.text);
                                    if (parsed && (parsed._voice || typeof parsed.duration !== 'undefined')) {
                                        innerText = `🎵 ${parsed.transcript || "Voice message"}`;
                                    } else {
                                        innerText = decrypted.text;
                                    }
                                } catch (e) {
                                    innerText = decrypted.text;
                                }
                            } else if (decrypted.fileName) {
                                innerText = `📎 ${decrypted.fileName}`;
                            } else {
                                innerText = "🔒 Encrypted Message";
                            }
                        } else if (msg.voiceMessage) {
                            innerText = "🎵 Voice message";
                        } else if (msg.fileUrl) {
                            innerText = `📎 ${msg.fileName || "Attachment"}`;
                        } else if (msg.ratchetHeader) {
                            innerText = "🔒 Encrypted Message";
                        } else {
                            innerText = msg.text || "";
                        }

                        let suffix = msg.createdAt ? ` · ${formatRelativeTime(msg.createdAt)}` : "";
                        lastMsgText = innerText ? `${innerText}${suffix}` : "";
                    }
                }
            }

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
                    role: onlineUser.role,
                    lastMessage: lastMsgText
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
                    isOnline: false,
                    lastMessage: lastMsgText
                };
            }
        });

        list = list.filter((u) => u.username?.toLowerCase() !== username?.toLowerCase());

        if (activePrivateName && activePrivateName.toLowerCase() !== username?.toLowerCase() && !list.some((u) => u.username?.toLowerCase() === activePrivateName.toLowerCase())) {
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
    }, [conversationUsers, onlineUserList, username, activePrivateName, allUsers, decryptedMessages, sidebarTick]);

    const chatTitle = activePrivate
        ? `${activePrivateName}`
        : `${activeRoom}`;

    const processedMessages = useMemo(() => {
        return messages.map(msg => {
            if (msg.isDeleted) {
                return msg;
            }
            if (msg.privateChatId && msg.ratchetHeader) {
                const decrypted = decryptedMessages[msg._id];
                if (decrypted) {
                    return {
                        ...msg,
                        text: decrypted.text,
                        fileUrl: decrypted.fileUrl || null,
                        fileName: decrypted.fileName || null,
                        fileSize: decrypted.fileSize || null,
                        fileType: decrypted.fileType || null,
                        fileQuality: decrypted.fileQuality || null,
                        sticker: decrypted.sticker || null
                    };
                } else {
                    return {
                        ...msg,
                        text: "[Decrypting E2EE message...]",
                        isDecrypting: true,
                        fileUrl: null
                    };
                }
            }
            return msg;
        });
    }, [messages, decryptedMessages]);

    const activePinnedMessages = useMemo(() => {
        const roomMsgs = processedMessages.filter(msg => {
            const isMatch = activePrivate
                ? (msg.privateChatId?.toLowerCase() === activePrivate.toLowerCase())
                : (msg.room === activeRoom);
            return isMatch && msg.isPinned && (!msg.pinnedUntil || new Date(msg.pinnedUntil) > new Date());
        });
        return roomMsgs.sort((a, b) => new Date(b.pinnedAt || b.createdAt) - new Date(a.pinnedAt || a.createdAt));
    }, [processedMessages, activePrivate, activeRoom]);

    useEffect(() => {
        if (activePinnedIndex >= activePinnedMessages.length) {
            setActivePinnedIndex(0);
        }
    }, [activePinnedMessages.length, activePinnedIndex]);

    const pinnedMessage = activePinnedMessages[activePinnedIndex];

    const hasActiveChat = !!(activeRoom || activePrivate);

    return (
        <div className={`chat-wrapper ${hasActiveChat ? "has-active-chat" : "no-active-chat"}`}>

            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
                <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
            )}

            <div className="chat-layout">

                {/* Sidebar */}
                <div className={`sidebar-panel ${sidebarOpen ? "open" : ""}`}>
                    <RoomList
                        nextaskTasks={nextaskTasks}
                        nextaskBoard={nextaskBoard}
                        nextaskRooms={nextaskRooms}
                        activeRoom={activeRoom}
                        activePrivate={activePrivate}
                        onSelectRoom={selectRoom}
                        onSelectPrivate={selectPrivate}
                        onlineUserList={onlineUserList}
                        currentUser={username}
                        currentUserProfile={currentUserProfile}
                        isGuest={isGuest}
                        onProfileClick={() => {
                            setActiveSidebarTab("settings");
                            if (!isGuest) {
                                openOwnProfileSettings();
                            }
                        }}
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
                        deletedSystemRooms={deletedSystemRooms}
                        pendingRequestsCount={pendingRequests.length}
                        settingsProps={{
                            ownProfileData,
                            displayNameVal,
                            setDisplayNameVal,
                            bioVal,
                            setBioVal,
                            avatarVal,
                            setAvatarVal,
                            statusVal,
                            setStatusVal,
                            emailVal,
                            setEmailVal,
                            currentPasswordVal,
                            setCurrentPasswordVal,
                            newPasswordVal,
                            setNewPasswordVal,
                            newPasswordConfirmVal,
                            setNewPasswordConfirmVal,
                            privacyLastSeenVal,
                            setPrivacyLastSeenVal,
                            privacyAvatarVal,
                            setPrivacyAvatarVal,
                            privacyPMVal,
                            setPrivacyPMVal,
                            profileError,
                            setProfileError,
                            profileLoading,
                            handleOwnProfileUpdate,
                            handleGuestNameChange,
                            handleCropFileChange,
                            pendingRequests,
                            handleAcceptRequest,
                            handleDeclineRequest,
                            setOwnProfileData,
                            newGuestName,
                            setNewGuestName,
                            showTransitionSettings,
                            setShowTransitionSettings,
                            theme,
                            setTheme,
                            setFullAvatarUrl,
                            setCropImageSrc,
                            setCropTarget
                        }}
                        onLogoClick={clearActiveChat}
                        onLogout={isGuest ? logout : () => setShowLogoutConfirm(true)}
                    />
                </div>

                {/* Main chat */}
                <div className="chat-container">
                    {activeSidebarTab === "nextask" ? (
                        <ErrorBoundary title="NexTask Board Error">
                            <Suspense fallback={<div className="empty-chat-placeholder" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)' }}>Loading NexTask Board...</div>}>
                                <NexTaskPage 
                                    myUsername={username}
                                    token={getAuthToken()}
                                    theme={theme}
                                    onNavigateToMessage={handleNavigateToMessage}
                                    socket={socketRef.current}
                                    activeTab={nextaskActiveTab}
                                    setActiveTab={setNextaskActiveTab}
                                    selectedNexTask={nextaskBoard}
                                    setSelectedNexTask={setNextaskBoard}
                                    onTasksUpdate={handleTasksUpdate}
                                />
                            </Suspense>
                        </ErrorBoundary>
                    ) : !activeRoom && !activePrivate ? (
                        <div className="empty-chat-placeholder" style={{ 
                            position: 'relative',
                            display: 'flex', 
                            flexDirection: 'column', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            height: '100%', 
                            color: 'var(--muted)', 
                            textAlign: 'center', 
                            padding: '24px',
                            background: 'var(--page)',
                            overflow: 'hidden'
                        }}>
                            <div className="empty-chat-corner-brand">
                                Nexus.
                            </div>
                            <div className="empty-chat-online-users-wrapper">
                                <OnlineUsers
                                    onlineUsers={onlineUsers}
                                    onlineUserList={onlineUserList}
                                    currentUser={username}
                                    onUserProfileClick={(uname) => setSelectedProfileUsername(uname)}
                                    onShowOnlineListClick={() => setShowOnlineList(true)}
                                />
                            </div>
                            <ThemeToggleButton
                                theme={theme}
                                onToggle={handleThemeToggle}
                                className="empty-chat-theme-toggle"
                            />
                            {/* Typography/Logo Header at the top */}
                            <div className="empty-chat-header" style={{
                                position: 'absolute',
                                top: '30%',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '12px',
                                zIndex: 2
                            }}>
                                <h2 style={{
                                    margin: '0',
                                    fontSize: '28px',
                                    fontWeight: '800',
                                    color: 'var(--text)',
                                    letterSpacing: '-0.5px'
                                }}>
                                    Select a chat to start
                                </h2>
                                <p style={{
                                    margin: '0',
                                    fontSize: '13px',
                                    color: 'var(--muted)',
                                    maxWidth: '280px',
                                    lineHeight: '1.5'
                                }}>
                                    Choose an existing room from the sidebar, start a private conversation, or create your own room!
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#17d67e', marginTop: '1px' }}>
                                    <FiLock />
                                    <span>End-to-end encrypted</span>
                                </div>
                            </div>

                            {/* Crowd Canvas at the bottom */}
                            <div className="empty-chat-canvas-wrapper" style={{
                                position: 'absolute',
                                bottom: 0,
                                left: 0,
                                width: '100%',
                                height: '55%',
                                zIndex: 1
                            }}>
                                <ErrorBoundary title="Activity Canvas Error">
                                    <Suspense fallback={<div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>Loading Activity View...</div>}>
                                        <CrowdCanvas src="/images/peeps/all-peeps.png" rows={15} cols={7} theme={theme} />
                                    </Suspense>
                                </ErrorBoundary>
                            </div>
                        </div>
                    ) : (
                        <>
                            <ChatHeader
                                username={username}
                                onLogout={isGuest ? logout : () => setShowLogoutConfirm(true)}
                                chatTitle={chatTitle}
                                onlineUsers={onlineUsers}
                                onlineUserList={onlineUserList}
                                onMenuToggle={() => setSidebarOpen(v => !v)}
                                onBack={clearActiveChat}
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
                                onVerifyClick={() => setShowVerifyModal(true)}
                                onVaultClick={() => {
                                    if (showVault) {
                                        clearVaultState();
                                    } else {
                                        setShowVault(true);
                                    }
                                }}
                                onToggleVisualizer={() => {
                                    setShowVisualizer(prev => {
                                        const nextState = !prev;
                                        if (nextState) {
                                            // Load/populate with the last E2EE message in this chat.
                                            // Skip locked messages — they have no visible plaintext to show;
                                            // fall back to the previous non-locked E2EE message instead.
                                            const lastE2EEMsg = [...messages].reverse().find(msg => 
                                                msg.privateChatId && 
                                                msg.ratchetHeader && 
                                                !msg.isDeleted &&
                                                !msg.isLocked
                                            );
                                            if (lastE2EEMsg) {
                                                const decrypted = decryptedMessages[lastE2EEMsg._id];
                                                const isOwn = lastE2EEMsg.username?.toLowerCase() === username?.toLowerCase();
                                                setVisualizerData({
                                                    plaintext: decrypted ? decrypted.text : "[Encrypted]",
                                                    ciphertext: lastE2EEMsg.text,
                                                    type: isOwn ? "send" : "receive",
                                                    username: isOwn ? activePrivateName : lastE2EEMsg.username,
                                                    messageNumber: lastE2EEMsg.ratchetHeader.messageNumber,
                                                    sessionId: lastE2EEMsg.privateChatId
                                                });
                                            }
                                        }
                                        return nextState;
                                    });
                                }}
                                isSelectionMode={isSelectionMode}
                                selectedMessageIds={selectedMessageIds}
                                onStartSelectionMode={() => setIsSelectionMode(true)}
                                onCancelSelection={() => {
                                    setIsSelectionMode(false);
                                    setSelectedMessageIds(new Set());
                                }}
                                onBulkDelete={handleBulkDeleteClick}
                                onBulkDownload={handleBulkDownload}
                                onBulkStar={handleBulkStar}
                                onBulkForward={handleBulkForward}
                                messages={messages}
                            />

                            {pinnedMessage && (
                                <div className="pinned-message-bar">
                                    <div className="pinned-message-bar-left" onClick={() => handleScrollToPinnedMessage(pinnedMessage._id)}>
                                        {activePinnedMessages.length > 1 && (
                                            <div className="pinned-indicators">
                                                {activePinnedMessages.map((m, idx) => (
                                                    <div 
                                                        key={m._id} 
                                                        className={`pinned-indicator-segment ${idx === activePinnedIndex ? 'active' : ''}`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setActivePinnedIndex(idx);
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                        <Pin size={16} className="pinned-bar-icon" />
                                        <div className="pinned-message-preview">
                                            {pinnedMessage.voiceMessage ? (
                                                <>
                                                    <Mic size={16} className="pinned-mic-icon" />
                                                    <span>{(() => {
                                                        const sec = pinnedMessage.voiceMessage.duration || 0;
                                                        const m = Math.floor(sec / 60);
                                                        const s = Math.floor(sec % 60);
                                                        return `${m}:${s < 10 ? '0' : ''}${s}`;
                                                    })()}</span>
                                                </>
                                            ) : pinnedMessage.fileUrl ? (
                                                <span>{pinnedMessage.fileName ? `📁 ${pinnedMessage.fileName}` : "Attachment"}</span>
                                            ) : pinnedMessage.sticker ? (
                                                <span>Sticker</span>
                                            ) : (
                                                <span>{pinnedMessage.text}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="pinned-message-bar-right">
                                        <button className="pinned-dropdown-trigger" onClick={() => setShowPinnedMenu(v => !v)}>
                                            <ChevronDown size={18} />
                                        </button>
                                        {showPinnedMenu && (
                                            <>
                                                <div className="pinned-menu-overlay" onClick={() => setShowPinnedMenu(false)} />
                                                <div className="pinned-menu-dropdown">
                                                    <button className="pinned-menu-item" onClick={() => handleUnpinActiveMessage(pinnedMessage._id)}>
                                                        <PinOff size={16} />
                                                        <span>Unpin</span>
                                                    </button>
                                                    <button className="pinned-menu-item" onClick={() => handleScrollToPinnedMessage(pinnedMessage._id)}>
                                                        <ArrowRight size={16} />
                                                        <span>Go to message</span>
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            <MessageList
                                messages={processedMessages}
                                loadingMessages={loadingMessages}
                                currentUser={username}
                                messagesEndRef={messagesEndRef}
                                onReact={handleReact}
                                onEdit={handleEdit}
                                onDelete={handleDelete}
                                isPrivate={!!activePrivate}
                                onAddReactionClick={(msgId) => setActiveReactionMsgId(msgId)}
                                typingUser={typingUser}
                                recordingUser={recordingUser}
                                onUserProfileClick={(uname) => setSelectedProfileUsername(uname)}
                                allUsers={allUsers}
                                onlineUserList={onlineUserList}
                                onReply={(m) => setReplyToMsg(m)}
                                onShowMessageInfo={(m) => setInfoMsg(m)}
                                onCopySuccess={handleCopySuccess}
                                onLockMessage={handleLockMessage}
                                onUnlockLockedMessage={handleUnlockLockedMessage}
                                isSelectionMode={isSelectionMode}
                                selectedMessageIds={selectedMessageIds}
                                onToggleMessageSelection={toggleMessageSelection}
                                onAddToWork={handleOpenAddToWorkModal}
                                highlightMessageId={highlightMessageId}
                                onPin={setPinTargetMessage}
                                onUnpin={handleUnpinActiveMessage}
                                currentUserDisplayName={displayNameVal || username}
                            />

                            {!isSelectionMode && replyToMsg && (
                                <div className="reply-preview-container">
                                    <div className="reply-preview-content">
                                        <span className="reply-preview-username">
                                            {replyToMsg.username === username ? "You" : replyToMsg.displayName || replyToMsg.username}
                                        </span>
                                        <span className="reply-preview-text">
                                            {replyToMsg.isLocked
                                                ? "🔒 Locked Message"
                                                : (replyToMsg.text || (replyToMsg.fileName ? `📁 ${replyToMsg.fileName}` : "Attachment"))}
                                        </span>
                                    </div>
                                    <button className="reply-preview-close" onClick={() => setReplyToMsg(null)}>
                                        <FiX size={16} />
                                    </button>
                                </div>
                            )}

                            {!isSelectionMode && (
                                <MessageInput
                                    key={activePrivate ? `private_${activePrivate}` : `room_${activeRoom}`}
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
                                    onVoiceMessageSend={handleVoiceMessageSend}
                                    onRecordingStart={emitRecordingStart}
                                    onRecordingStop={emitRecordingStop}
                                />
                            )}

                            {activePrivate && (
                                <ErrorBoundary title="E2EE Vault Error">
                                    <Suspense fallback={null}>
                                        <Vault 
                                            isOpen={showVault}
                                            onClose={() => setShowVault(false)}
                                            privateChatId={activePrivate}
                                            myUsername={username}
                                            token={getAuthToken()}
                                            vaultKey={vaultKey}
                                            setVaultKey={setVaultKey}
                                        />
                                    </Suspense>
                                </ErrorBoundary>
                            )}
                            <ErrorBoundary title="Command Palette Error">
                                <Suspense fallback={null}>
                                    <CommandPalette 
                                        isOpen={isCommandPaletteOpen}
                                        onClose={() => setIsCommandPaletteOpen(false)}
                                        setActiveSidebarTab={setActiveSidebarTab}
                                        setSelectedNexTask={setNextaskBoard}
                                        rooms={customRooms}
                                        activeTab={nextaskActiveTab}
                                        setActiveTab={setNextaskActiveTab}
                                    />
                                </Suspense>
                            </ErrorBoundary>
                        </>
                    )}
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

            {infoMsg && (
                <MessageInfoModal
                    msg={infoMsg}
                    currentUser={username}
                    onClose={() => setInfoMsg(null)}
                    isPrivate={!!activePrivate}
                />
            )}

            {lockingMessage && (
                <LockMessageModal
                    msg={lockingMessage}
                    onClose={() => setLockingMessage(null)}
                    privateChatId={activePrivate}
                    myUsername={username}
                    token={getAuthToken()}
                    onLockSuccess={handleLockMessageSuccess}
                />
            )}

            {unlockingMessage && unlockingPinData && (
                <VaultPinEntryModal
                    onClose={() => {
                        setUnlockingMessage(null);
                        setUnlockingPinData(null);
                    }}
                    pinData={unlockingPinData}
                    onUnlock={(key) => {
                        setVaultKey(key);
                        setShowVault(true); // Open the vault panel!
                        setUnlockingMessage(null);
                        setUnlockingPinData(null);
                    }}
                    onResetPin={(key) => {
                        setVaultKey(key);
                        setShowVault(true);
                        setUnlockingMessage(null);
                        setUnlockingPinData(null);
                    }}
                    privateChatId={activePrivate}
                    myUsername={username}
                />
            )}

            <VerifyModal
                isOpen={showVerifyModal}
                onClose={() => setShowVerifyModal(false)}
                myUsername={username}
                partnerUsername={activePrivateName}
                myIdentityKey={myIdentityKey}
                partnerIdentityKey={partnerIdentityKey}
            />

            <DataFlowVisualizer
                isOpen={showVisualizer}
                onClose={() => setShowVisualizer(false)}
                visualizerData={visualizerData}
            />

            <AddToWorkModal
                isOpen={!!addToWorkMsg}
                message={addToWorkMsg}
                users={nextaskUsers}
                myUsername={username}
                isPrivateChat={!!activePrivate}
                activeChatId={activePrivate ? activePrivate : activeRoom}
                onClose={() => setAddToWorkMsg(null)}
                onSubmit={handleCreateTaskFromModal}
            />

            {pinTargetMessage && (
                <PinMessageModal
                    msg={pinTargetMessage}
                    onClose={() => setPinTargetMessage(null)}
                    onPin={handlePinMessageConfirm}
                />
            )}

            {/* Block Target Confirmation Modal */}
            {blockTargetConfirm && (
                <div className="modal-overlay" onClick={() => setBlockTargetConfirm(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 'min(90%, 360px)' }}>
                        <div className="modal-header-section">
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>Block User?</h3>
                        </div>
                        <div className="modal-body-section" style={{ margin: '16px 0', fontSize: '14px', color: 'var(--text)' }}>
                            <p>Are you sure you want to block <strong>@{blockTargetConfirm.username}</strong>? You will no longer receive private messages from them.</p>
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
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
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
                            {/* Woven Checkered Lanyard Strap - Rendering dynamic curve */}
                            <svg
                                width="600"
                                height="800"
                                viewBox="0 0 600 800"
                                style={{
                                    position: 'absolute',
                                    top: -125,
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    pointerEvents: 'none',
                                    zIndex: 9,
                                    overflow: 'visible'
                                }}
                            >
                                <defs>
                                    <linearGradient id="lanyardGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <stop offset="0%" stopColor="#1e293b" />
                                        <stop offset="50%" stopColor="var(--accent)" />
                                        <stop offset="100%" stopColor="#0f172a" />
                                    </linearGradient>
                                </defs>
                                <motion.path
                                    d={lanyardPath}
                                    fill="none"
                                    stroke="url(#lanyardGrad)"
                                    strokeWidth="16"
                                    strokeLinecap="round"
                                    style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.4))' }}
                                />
                                <motion.path
                                    d={lanyardPath}
                                    fill="none"
                                    stroke="rgba(255, 255, 255, 0.4)"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeDasharray="6 8"
                                />
                            </svg>

                            {loadingProfileCard ? (
                                <motion.div 
                                    initial={{ y: -800, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    exit={{ y: -800, opacity: 0 }}
                                    transition={{ type: "spring", stiffness: 90, damping: 15 }}
                                    style={{ marginTop: '165px', position: 'relative' }}
                                >
                                    <div className="chrome-clasp-wrapper">
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
                                            <path 
                                                d="M16 2 C10 2 6 6 6 12 C6 15 8 18 10 20 L10 32 C10 34 12 36 14 36 L18 36 C20 34 22 32 22 30 L22 20 C24 18 26 15 26 12 C26 6 22 2 16 2 Z M16 6 C13 6 10 8 10 12 C10 14 11 16 13 18 L13 30 C13 31 14 32 15 32 L17 32 C18 32 19 31 19 30 L19 18 C21 16 22 14 22 12 C22 8 19 6 16 6 Z" 
                                                fill="url(#chromeGradient)" 
                                                fillRule="evenodd" 
                                                filter="drop-shadow(0 2px 3px rgba(0,0,0,0.5))" 
                                            />
                                            <path d="M10 14 L22 19" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
                                            <circle cx="16" cy="38" r="4" fill="#475569" stroke="#94a3b8" strokeWidth="1.5" />
                                        </svg>
                                    </div>
                                    <div className="cyber-badge-card" style={{ justifyContent: 'center', minHeight: '220px', height: 'auto', cursor: 'default' }}>
                                        <div className="card-top-bar" />
                                        <div className="card-grommet-hole" />
                                        <div className="cyber-card-grid" />
                                        <div className="emoji-picker-loader" style={{ padding: '48px 0', color: 'var(--accent)', fontFamily: 'monospace', fontSize: '12px', letterSpacing: '1px' }}>
                                            ESTABLISHING SECURE CONNECTION...
                                        </div>
                                    </div>
                                </motion.div>
                            ) : profileCardError ? (
                                <motion.div 
                                    initial={{ y: -800, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    exit={{ y: -800, opacity: 0 }}
                                    transition={{ type: "spring", stiffness: 90, damping: 15 }}
                                    style={{ marginTop: '165px', position: 'relative' }}
                                >
                                    <div className="chrome-clasp-wrapper">
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
                                            <path 
                                                d="M16 2 C10 2 6 6 6 12 C6 15 8 18 10 20 L10 32 C10 34 12 36 14 36 L18 36 C20 34 22 32 22 30 L22 20 C24 18 26 15 26 12 C26 6 22 2 16 2 Z M16 6 C13 6 10 8 10 12 C10 14 11 16 13 18 L13 30 C13 31 14 32 15 32 L17 32 C18 32 19 31 19 30 L19 18 C21 16 22 14 22 12 C22 8 19 6 16 6 Z" 
                                                fill="url(#chromeGradient)" 
                                                fillRule="evenodd" 
                                                filter="drop-shadow(0 2px 3px rgba(0,0,0,0.5))" 
                                            />
                                            <path d="M10 14 L22 19" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
                                            <circle cx="16" cy="38" r="4" fill="#475569" stroke="#94a3b8" strokeWidth="1.5" />
                                        </svg>
                                    </div>
                                    <div className="cyber-badge-card" style={{ justifyContent: 'center', padding: '24px', textAlign: 'center', minHeight: '200px', height: 'auto', cursor: 'default' }}>
                                        <div className="card-top-bar" />
                                        <div className="card-grommet-hole" />
                                        <div className="cyber-card-grid" />
                                        <p style={{ color: 'var(--danger)', fontWeight: 'bold', fontSize: '13px', fontFamily: 'monospace', marginBottom: '20px' }}>
                                            {profileCardError}
                                        </p>
                                        <button className="cyber-badge-btn primary" style={{ width: '120px', height: '36px' }} onClick={() => setSelectedProfileUsername(null)}>CLOSE</button>
                                    </div>
                                </motion.div>
                            ) : selectedProfileData ? (
                                <motion.div 
                                    initial={{ y: -800, rotate: 22, opacity: 0 }}
                                    animate={{ y: 0, rotate: 0, opacity: 1 }}
                                    exit={{ y: -800, rotate: -22, opacity: 0 }}
                                    transition={{
                                        type: "spring",
                                        stiffness: 90,
                                        damping: 14,
                                        mass: 1.1
                                    }}
                                    style={{ marginTop: '165px', position: 'relative' }}
                                >
                                    {/* Carabiner Chrome Clasp (dynamic rotation pointing to the lanyard pivot) */}
                                    <motion.div 
                                        className="chrome-clasp-wrapper"
                                        style={{
                                            x: springX,
                                            y: springY,
                                            rotate: claspRotate,
                                            transformOrigin: "center 38px",
                                            position: 'absolute',
                                            left: 'calc(50% - 16px)',
                                            transform: 'none',
                                            zIndex: 100
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
                                            {/* Combined body and void using fill-rule evenodd */}
                                            <path 
                                                d="M16 2 C10 2 6 6 6 12 C6 15 8 18 10 20 L10 32 C10 34 12 36 14 36 L18 36 C20 34 22 32 22 30 L22 20 C24 18 26 15 26 12 C26 6 22 2 16 2 Z M16 6 C13 6 10 8 10 12 C10 14 11 16 13 18 L13 30 C13 31 14 32 15 32 L17 32 C18 32 19 31 19 30 L19 18 C21 16 22 14 22 12 C22 8 19 6 16 6 Z" 
                                                fill="url(#chromeGradient)" 
                                                fillRule="evenodd" 
                                                filter="drop-shadow(0 2px 3px rgba(0,0,0,0.5))" 
                                            />
                                            {/* Security latch wire gate */}
                                            <path d="M10 14 L22 19" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
                                            {/* Grommet anchor ring hook */}
                                            <circle cx="16" cy="38" r="4" fill="#475569" stroke="#94a3b8" strokeWidth="1.5" />
                                        </svg>
                                    </motion.div>

                                    <motion.div 
                                        className="cyber-badge-card"
                                        style={{
                                            x: springX,
                                            y: springY,
                                            rotate: smoothRotate,
                                            transformOrigin: "center 22px"
                                        }}
                                        onPointerDown={onPointerDown}
                                    >
                                        {/* Punched Hole with Chrome Grommet */}
                                        <div className="card-grommet-hole" />
                                        
                                        {/* Corner Bracket Accent Indicators */}
                                        <div className="card-corner-bracket top-left" />
                                        <div className="card-corner-bracket top-right" />
                                        <div className="card-corner-bracket bottom-left" />
                                        <div className="card-corner-bracket bottom-right" />

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
                                        <button className="cyber-close-btn" onClick={() => setSelectedProfileUsername(null)}><FiX size={14} /></button>
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
                                                        title={!selectedProfileData.canDM ? "Private Messaging is restricted by user privacy or block settings." : "Send private message"}
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
                                                    {selectedProfileData.friendshipStatus === "pending_approval" ? (
                                                        <>
                                                            <button 
                                                                type="button"
                                                                onClick={handleFriendToggle} 
                                                                className="action-btn-card solid"
                                                                title="Accept Friend Request"
                                                                style={{ background: 'var(--accent)', color: '#fff' }}
                                                            >
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
                                                                Accept
                                                            </button>
                                                            <button 
                                                                type="button"
                                                                onClick={handleFriendDecline} 
                                                                className="action-btn-card outline"
                                                                title="Decline Friend Request"
                                                            >
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                                                Decline
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button 
                                                            type="button"
                                                            onClick={handleFriendToggle} 
                                                            className="action-btn-card outline"
                                                        >
                                                            {selectedProfileData.friendshipStatus === "friends" ? (
                                                                <>
                                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="23" y1="11" x2="17" y2="11"></line></svg>
                                                                    Remove
                                                                </>
                                                            ) : selectedProfileData.friendshipStatus === "requested" ? (
                                                                <>
                                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                                                    Requested
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
                                                                    Connect
                                                                </>
                                                            )}
                                                        </button>
                                                    )}
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
                            <FiX size={22} />
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
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            {!isCurrentUser && (
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const pChatId = [username.toLowerCase(), user.username.toLowerCase()].sort().join("_");
                                                        selectPrivate(pChatId, user.username);
                                                        setShowOnlineList(false);
                                                    }}
                                                    title={`Chat with ${user.displayName || user.username}`}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: 'var(--accent, #a855f7)',
                                                        cursor: 'pointer',
                                                        padding: '6px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        borderRadius: '50%',
                                                        transition: 'background 0.2s, color 0.2s',
                                                        marginRight: '2px'
                                                    }}
                                                    className="online-member-chat-btn"
                                                >
                                                    <FiMessageSquare size={16} />
                                                </button>
                                            )}
                                            <div style={{ fontSize: '11px', fontWeight: '700', color: 
                                                userStatus === "Online" ? '#17d67e' :
                                                userStatus === "Away" ? '#ffb020' :
                                                userStatus === "Busy" ? '#ef4444' : '#6b7280'
                                            }}>
                                                {userStatus}
                                            </div>
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
                        <h3 className="delete-confirm-title">
                            {deleteConfirmModal.messageIds && deleteConfirmModal.messageIds.length > 0
                                ? `Delete ${deleteConfirmModal.messageIds.length} messages?`
                                : "Delete message?"}
                        </h3>

                        {deleteConfirmModal.deleteFor === "everyone" && (
                            <div className="delete-confirm-description" style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px', lineHeight: '1.4' }}>
                                Are you sure you want to delete this message for everyone?
                                {messages.find(m => m._id === deleteConfirmModal.messageId)?.isLocked && (
                                    <div className="delete-vault-warning" style={{ 
                                        color: '#f87171', 
                                        fontWeight: '600', 
                                        marginTop: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        background: 'rgba(248, 113, 113, 0.08)',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(248, 113, 113, 0.2)'
                                    }}>
                                        ⚠️ This message is locked in the shared vault and will also be deleted from the vault.
                                    </div>
                                )}
                            </div>
                        )}
                        
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
                                {deleteConfirmModal.messageIds && deleteConfirmModal.messageIds.length > 0
                                    ? "Delete for me"
                                    : (deleteConfirmModal.deleteFor === "everyone" ? "Delete for everyone" : "Delete for me")}
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

            {undoClearInfo && (
                <div className="undo-delete-toast">
                    <span className="undo-delete-toast-text">
                        &bull; Chat cleared
                    </span>
                    <button 
                        type="button" 
                        className="undo-delete-toast-btn" 
                        onClick={executeUndoClear}
                    >
                        Undo
                    </button>
                </div>
            )}

            {/* COPY TOAST BANNER */}
            {copyToastActive && (
                <div className="copy-toast">
                    <span className="copy-toast-icon">✓</span>
                    <span className="copy-toast-text">Message copied to clipboard</span>
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
                                <p className="notification-toast-text">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        rehypePlugins={[rehypeRaw, [rehypeSanitize, customSchema]]}
                                        components={{
                                            a: ({ node, ...props }) => <a target="_blank" rel="noopener noreferrer" {...props} />,
                                            p: ({ node, ...props }) => <span {...props} />
                                        }}
                                    >
                                        {activeToast.text}
                                    </ReactMarkdown>
                                </p>
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
            <ThemeTransitionOptions isOpen={showTransitionSettings} setIsOpen={setShowTransitionSettings} />
        </div>
    );
}

export default Chat;
