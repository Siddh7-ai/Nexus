import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import VoiceMessageBubble from "./VoiceMessageBubble";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { ArrowDown, FileText, Download, Film, X, Info, CornerUpLeft, Copy, CornerUpRight, Pin, PinOff, Star, Pencil, Trash2, Lock, Mic, Briefcase } from "lucide-react";
import { getBackendUrl } from "../utils/config";
import sodium from "libsodium-wrappers-sumo";

const stickerUrlCache = new Map();

const StickerImage = ({ stickerUrl, alt, ...props }) => {
    const [src, setSrc] = useState(stickerUrl);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        setSrc(stickerUrl);
        setHasError(false);
    }, [stickerUrl]);

    const handleError = () => {
        if (!hasError && stickerUrl && stickerUrl.includes("notoemoji")) {
            setHasError(true);
            const parts = stickerUrl.split("/");
            const hex = parts[parts.length - 2];
            if (hex) {
                setSrc(`https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${hex}.svg`);
            }
        }
    };

    return <img src={src} alt={alt} onError={handleError} {...props} />;
};

function StickerBubble({ msg }) {
    const [url, setUrl] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);

    useEffect(() => {
        let active = true;

        const loadSticker = async () => {
            if (!msg.sticker) return;

            // 1. E2EE Custom Sticker
            if (msg.sticker.isCustom && msg.sticker.fileKey) {
                if (stickerUrlCache.has(msg._id)) {
                    setUrl(stickerUrlCache.get(msg._id));
                    return;
                }

                setLoading(true);
                try {
                    await sodium.ready;
                    const res = await fetch(`${getBackendUrl()}/api/file/${msg.sticker.fileId}`);
                    if (!res.ok) throw new Error("Sticker fetch failed");
                    const arrayBuffer = await res.arrayBuffer();
                    const encryptedBytes = new Uint8Array(arrayBuffer);

                    const fileKey = sodium.from_base64(msg.sticker.fileKey);
                    const fileNonce = sodium.from_base64(msg.sticker.nonce);
                    const decryptedBytes = sodium.crypto_secretbox_open_easy(encryptedBytes, fileNonce, fileKey);

                    if (!decryptedBytes) throw new Error("Sticker decryption failed");

                    const blob = new Blob([decryptedBytes], { type: "image/webp" });
                    const blobUrl = URL.createObjectURL(blob);
                    
                    if (active) {
                        stickerUrlCache.set(msg._id, blobUrl);
                        setUrl(blobUrl);
                    }
                } catch (err) {
                    console.error("Error decrypting custom sticker:", err);
                } finally {
                    if (active) setLoading(false);
                }
                return;
            }

            // 2. E2EE System Sticker (url is null, reconstruct from packId and stickerId)
            if (!msg.sticker.isCustom && !msg.sticker.url) {
                const STICKER_HEX_MAP = {
                    funny: ["1f602", "1f923", "1f606", "1f61c", "1f61d", "1f92a", "1f921", "1f917", "1f92d", "1f92f", "1f60f", "1f60e", "1f92c", "1f922", "1f92e", "1f92b", "1f920", "1f61b", "1f601", "1f60a"],
                    love: ["1f970", "1f60d", "1f618", "1f496", "1f49d", "1f49e", "1f49f", "1f48b", "1f495", "1f493", "1f494", "1f49c", "1f49a", "1f49b", "1f9e1", "1f90e", "1f5a4", "1f90f", "1f48d", "1f498"],
                    celebrate: ["1f389", "1f38a", "1f382", "1f3c6", "1f3c5", "1f388", "1f381", "1f973", "1f525", "1f387", "1f386", "1f514", "1f4d6", "1f4e3", "1f4e2", "1f51e", "1f4bb", "1f4c8", "1f4b0", "1f385"],
                    mood: ["1f620", "1f621", "1f624", "1f62d", "1f622", "1f62a", "1f634", "1f927", "1f97a", "1f631", "1f628", "1f627", "1f625", "1f612", "1f614", "1f61e", "1f62f", "1f62b", "1f629", "1f976"],
                    thanks: ["1f64f", "1f44d", "1f44c", "1f44f", "1f4aa", "1f91d", "1f44e", "1f446", "1f447", "1f918", "1f596", "1f590", "1f595", "1f91f", "1f44b"],
                    greetings: ["1f44b", "1f600", "1f604", "1f609", "1f607", "1f31e", "1f31c", "1f305", "1f307", "1f4ac", "1f441", "1f47d", "1f47e", "1f480", "1f916"],
                    animals: ["1f436", "1f431", "1f98a", "1f43b", "1f438", "1f43c", "1f428", "1f42f", "1f435", "1f414", "1f41f", "1f419", "1f41d", "1f40c", "1f40e", "1f410", "1f411", "1f404", "1f412", "1f407"],
                    aesthetic: ["2728", "2b50", "1f308", "1f319", "1f49f", "1f380", "1f338", "1f33f", "1f340", "1f341", "1f302", "1f30a", "1f324", "1f327", "1f32a"]
                };
                const index = parseInt(msg.sticker.stickerId.split("_").pop(), 10);
                const hexes = STICKER_HEX_MAP[msg.sticker.packId] || [];
                const hex = hexes[index - 1] || "1f600";
                setUrl(`https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${hex}.svg`);
                return;
            }

            // 3. Regular System Sticker or Public Custom Sticker
            const targetUrl = msg.sticker.url.startsWith("http")
                ? msg.sticker.url
                : `${getBackendUrl()}${msg.sticker.url}`;
            setUrl(targetUrl);
        };

        loadSticker();

        return () => {
            active = false;
        };
    }, [msg]);

    if (loading) {
        return <div className="sticker-bubble-loading">Loading...</div>;
    }

    if (!url) return null;

    const isCustom = msg.sticker.isCustom;

    return (
        <>
            <div 
                className="sticker-bubble-container"
                onClick={() => setIsPreviewOpen(true)}
            >
                <StickerImage stickerUrl={url} alt="Sticker" className="sticker-img" />
                {isCustom && <span className="sticker-badge">Custom</span>}
            </div>

            {isPreviewOpen && (
                <div className="sticker-lightbox-overlay" onClick={() => setIsPreviewOpen(false)}>
                    <div className="sticker-lightbox-content" onClick={(e) => e.stopPropagation()}>
                        <StickerImage stickerUrl={url} alt="Sticker Preview" className="sticker-preview-img" />
                        <button type="button" className="close-lightbox-btn" onClick={() => setIsPreviewOpen(false)}>
                            <X size={20} />
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}

const customSchema = {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames || []), "u"]
};

function stripMarkdownAndHtml(text) {
    if (!text) return "";
    let clean = text;
    // 1. Strip HTML tags (like <u>, </u>, etc.)
    clean = clean.replace(/<[^>]*>/g, "");
    // 2. Strip Markdown bold/italic/strikethrough/code markers
    clean = clean.replace(/(\*\*\*|___)(.*?)\1/g, "$2");
    clean = clean.replace(/(\*\*|__)(.*?)\1/g, "$2");
    clean = clean.replace(/(\*|_)(.*?)\1/g, "$2");
    clean = clean.replace(/~~(.*?)~~/g, "$2");
    clean = clean.replace(/`(.*?)`/g, "$2");
    // 3. Strip Code Blocks
    clean = clean.replace(/```[a-z]*\n?([\s\S]*?)\n?```/g, "$1");
    // 4. Strip Markdown links: [text](url) -> text
    clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    // 5. Clean lists and blockquotes
    clean = clean.replace(/^([\s\t]*)([-*+]|\d+\.)\s+/gm, "$1");
    clean = clean.replace(/^([\s\t]*)>\s+/gm, "$1");
    return clean;
}

function markdownToHtml(text) {
    if (!text) return "";
    let html = text;

    // 1. Temporarily protect <u> and </u> tags
    html = html.replace(/<u>/g, "___U_START___")
               .replace(/<\/u>/g, "___U_END___");
    
    // Escape standard HTML tags/characters to prevent breaking structure
    html = html.replace(/&/g, "&amp;")
               .replace(/</g, "&lt;")
               .replace(/>/g, "&gt;");
               
    // Restore <u> and </u> tags
    html = html.replace(/___U_START___/g, "<u>")
               .replace(/___U_END___/g, "</u>");

    // 2. Parse Markdown formatting elements into corresponding HTML tags
    html = html.replace(/(\*\*\*|___)(.*?)\1/g, "<strong><em>$2</em></strong>");
    html = html.replace(/(\*\*|__)(.*?)\1/g, "<strong>$2</strong>");
    html = html.replace(/(\*|_)(.*?)\1/g, "<em>$2</em>");
    html = html.replace(/~~(.*?)~~/g, "<del>$1</del>");
    html = html.replace(/`(.*?)`/g, "<code>$1</code>");
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    
    // Convert newlines to HTML line breaks
    html = html.replace(/\n/g, "<br />");
    return html;
}

function formatTimestamp(dateStr) {
    if (!dateStr) return "";
    const msgDate = new Date(dateStr);
    const now = new Date();
    const msgDay = new Date(msgDate.getFullYear(), msgDate.getMonth(), msgDate.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const timeStr = msgDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (msgDay.getTime() === today.getTime()) return timeStr;
    if (msgDay.getTime() === yesterday.getTime()) return `Yesterday ${timeStr}`;
    return `${msgDate.toLocaleDateString([], { month: "short", day: "numeric" })} ${timeStr}`;
}

function formatRelativeTime(dateStr) {
    if (!dateStr) return "just now";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "just now";
    if (diffMins === 1) return "1 min ago";
    if (diffMins < 60) return `${diffMins} mins ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return "1 hour ago";
    if (diffHours < 24) return `${diffHours} hours ago`;
    
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatDividerDate(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    
    const dDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const diffTime = dNow.getTime() - dDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        return "Today";
    }
    if (diffDays === 1) {
        return "Yesterday";
    }
    if (diffDays < 7 && diffDays > 0) {
        return date.toLocaleDateString([], { weekday: 'long' });
    }
    
    return date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatFileSize(bytes) {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function Avatar({ username, avatarSrc }) {
    if (avatarSrc) {
        return (
            <img 
                src={avatarSrc} 
                alt={`${username}'s avatar`} 
                className="avatar" 
                style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: '50%' }} 
            />
        );
    }
    const colors = ["#e8ddff", "#d9f4ff", "#dcfce7", "#ffe7cc", "#dff8f5"];
    let colorIndex = 0;
    for (let i = 0; i < username.length; i++) {
        colorIndex += username.charCodeAt(i);
    }

    return (
        <div className="avatar" style={{ backgroundColor: colors[colorIndex % colors.length] }}>
            {username.charAt(0).toUpperCase()}
        </div>
    );
}

function ThoughtBubbleIndicator({ typingUser }) {
    const [visible, setVisible] = useState(false);
    const [isExiting, setIsExiting] = useState(false);
    const timeoutRef = useRef(null);
    const typingUserRef = useRef(null);

    if (typingUser) {
        typingUserRef.current = typingUser;
    }

    useEffect(() => {
        if (typingUser) {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
            setIsExiting(false);
            setVisible(true);
        } else {
            if (visible && !isExiting) {
                setIsExiting(true);
                timeoutRef.current = setTimeout(() => {
                    setVisible(false);
                    setIsExiting(false);
                    timeoutRef.current = null;
                }, 1000);
            }
        }
    }, [typingUser, visible, isExiting]);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    if (!visible || !typingUserRef.current) return null;

    const tUser = typingUserRef.current;
    const displayName = tUser.displayName || tUser.username;
    const label = tUser.role === "guest" ? `${displayName} [Guest]` : displayName;

    return (
        <div 
            className={`message-row other typing-row ${isExiting ? "is-exiting" : ""}`}
            title={`${label} is typing...`}
        >
            <Avatar username={tUser.username} avatarSrc={tUser.avatar} />
            <div className="thought-bubble-container">
                <div className="thought-circle thought-circle-1"></div>
                <div className="thought-circle thought-circle-2"></div>
                <div className="thought-circle thought-circle-3"></div>
                <div className="thought-cloud">
                    <span className="thought-dot"></span>
                    <span className="thought-dot"></span>
                    <span className="thought-dot"></span>
                </div>
            </div>
        </div>
    );
}

function RecordingBubbleIndicator({ recordingUser }) {
    const [visible, setVisible] = useState(false);
    const [isExiting, setIsExiting] = useState(false);
    const timeoutRef = useRef(null);
    const recordingUserRef = useRef(null);

    if (recordingUser) {
        recordingUserRef.current = recordingUser;
    }

    useEffect(() => {
        if (recordingUser) {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
            setIsExiting(false);
            setVisible(true);
        } else {
            if (visible && !isExiting) {
                setIsExiting(true);
                timeoutRef.current = setTimeout(() => {
                    setVisible(false);
                    setIsExiting(false);
                    timeoutRef.current = null;
                }, 1000);
            }
        }
    }, [recordingUser, visible, isExiting]);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    if (!visible || !recordingUserRef.current) return null;

    const rUser = recordingUserRef.current;
    const displayName = rUser.displayName || rUser.username;
    const label = rUser.role === "guest" ? `${displayName} [Guest]` : displayName;

    return (
        <div 
            className={`message-row other typing-row ${isExiting ? "is-exiting" : ""}`}
            title={`${label} is recording audio...`}
        >
            <Avatar username={rUser.username} avatarSrc={rUser.avatar} />
            <div className="thought-bubble-container recording-indicator-bubble">
                <div className="thought-circle recording-circle thought-circle-1"></div>
                <div className="thought-circle recording-circle thought-circle-2"></div>
                <div className="thought-circle recording-circle thought-circle-3"></div>
                <div className="thought-cloud recording-cloud">
                    <Mic size={12} className="recording-mic-icon" />
                    <span className="thought-dot recording-dot"></span>
                    <span className="thought-dot recording-dot"></span>
                    <span className="thought-dot recording-dot"></span>
                </div>
            </div>
        </div>
    );
}

const REACTION_EMOJIS = ["❤️", "😂", "🔥", "👍"];

function SeenStatus({ msg, currentUser, onlineUserList = [], allUsers = [] }) {
    if (msg.username?.toLowerCase() !== currentUser?.toLowerCase() || msg.isDeleted) return null;

    const seenBy = msg.seenBy || [];
    const seenByOther = seenBy.filter(u => u?.toLowerCase() !== currentUser?.toLowerCase()).length > 0;
    const isSending = msg.status === 'sending' || (msg._id && msg._id.toString().startsWith('temp_'));

    if (isSending) {
        return (
            <span className="seen-status sending" title="Sending...">
                <span className="status-circle-sending" />
            </span>
        );
    }

    const isSelfChat = msg.privateChatId && msg.privateChatId.toLowerCase() === `${currentUser?.toLowerCase()}_${currentUser?.toLowerCase()}`;
    if (seenByOther || isSelfChat) {
        if (msg.privateChatId) {
            const parts = msg.privateChatId.split("_");
            const partner = parts.find(u => u.toLowerCase() !== currentUser?.toLowerCase());
            if (partner) {
                const partnerUser = allUsers.find(u => u.username?.toLowerCase() === partner.toLowerCase());
                return (
                    <span className="seen-status seen-avatar" title={`Seen by ${partner}`}>
                        <Avatar username={partner} avatarSrc={partnerUser?.avatar} size={12} />
                    </span>
                );
            }
        }
        
        // Group chat seen indicators
        const groupSeenBy = seenBy.filter(u => u?.toLowerCase() !== currentUser?.toLowerCase());
        if (groupSeenBy.length > 0) {
            return (
                <span className="seen-status seen-avatars-group" title="Seen">
                    <span style={{ display: 'inline-flex', gap: '2px', alignItems: 'center' }}>
                        {groupSeenBy.slice(0, 3).map(u => {
                            const uObj = allUsers.find(user => user.username?.toLowerCase() === u.toLowerCase());
                            return (
                                <Avatar key={u} username={u} avatarSrc={uObj?.avatar} size={12} />
                            );
                        })}
                    </span>
                </span>
            );
        }

        return (
            <span className="seen-status read" title="Read" style={{ color: '#00f0ff', fontSize: '9px', fontWeight: 'bold' }}>
                ✓✓
            </span>
        );
    }

    if (msg.privateChatId) {
        const parts = msg.privateChatId.split("_");
        const partner = parts.find(u => u.toLowerCase() !== currentUser?.toLowerCase());
        const isPartnerOnline = partner && onlineUserList.some(u => u.username?.toLowerCase() === partner.toLowerCase());
        if (isPartnerOnline) {
            return (
                <span className="seen-status delivered" title="Delivered">
                    <span className="status-circle-solid" />
                </span>
            );
        }
    }

    return (
        <span className="seen-status sent" title="Sent">
            <span className="status-circle-hollow" />
        </span>
    );
}

function ReactionBar({ reactions, onShowDetail, currentUser }) {
    if (!reactions || reactions.length === 0) return null;

    const uniqueEmojis = [];
    reactions.forEach(r => {
        if (r.emoji && !uniqueEmojis.includes(r.emoji)) {
            uniqueEmojis.push(r.emoji);
        }
    });

    const displayedUnique = uniqueEmojis.slice(0, 3);
    const emojisToShow = displayedUnique.join(" ");
    const myReaction = reactions.find(r => r.username?.toLowerCase() === currentUser?.toLowerCase());
    const showPlusAndCount = reactions.length > 3;
    const remainingCount = reactions.length - displayedUnique.length;

    return (
        <div className="reaction-bar">
            <button
                className={`reaction-chip ${myReaction ? "mine" : ""}`}
                onClick={onShowDetail}
            >
                {emojisToShow}{showPlusAndCount ? ` ${remainingCount} +` : ""}
            </button>
        </div>
    );
}

function MessageActions({ msg, currentUser, onReact, onEdit, onDelete, onAddReactionClick, onReply, onShowMessageInfo, onCopySuccess, isPrivate, onLockMessage, isSelectionMode = false, index, totalCount, onAddToWork, onPin, onUnpin }) {
    const [showReactions, setShowReactions] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [openUp, setOpenUp] = useState(false);
    const isOwn = msg.username?.toLowerCase() === currentUser?.toLowerCase();
    const isVoice = msg.fileType === "audio/e2ee" || msg.fileType?.startsWith("audio/");

    if (isSelectionMode) return null;
    if (msg.isDeleted || msg.username === "System") return null;

    const handleCopy = () => {
        const textToCopy = msg.isLocked ? (msg.text || "Locked Message") : msg.text;
        if (!textToCopy) return;

        const plainText = stripMarkdownAndHtml(textToCopy);
        const htmlText = markdownToHtml(textToCopy);

        try {
            const blobHtml = new Blob([htmlText], { type: "text/html" });
            const blobText = new Blob([plainText], { type: "text/plain" });
            const item = new ClipboardItem({
                "text/html": blobHtml,
                "text/plain": blobText
            });
            navigator.clipboard.write([item]).then(() => {
                if (onCopySuccess) {
                    onCopySuccess();
                }
            }).catch(err => {
                console.error("Clipboard copy failed, fallback to plain text:", err);
                navigator.clipboard.writeText(plainText);
                if (onCopySuccess) {
                    onCopySuccess();
                }
            });
        } catch (e) {
            console.error("ClipboardItem not supported, fallback to plain text:", e);
            navigator.clipboard.writeText(plainText);
            if (onCopySuccess) {
                onCopySuccess();
            }
        }
    };

    return (
        <div className={`message-actions ${isOwn ? "own" : "other"}`}>
            <div className="action-btn-group">
                <button
                    className="action-btn"
                    title="React"
                    onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const spaceBelow = window.innerHeight - rect.bottom;
                        const spaceAbove = rect.top;
                        const isNearBottom = totalCount - index <= 2;
                        const isNearTop = index < 2;
                        if (isNearTop) {
                            setOpenUp(false);
                        } else if ((isNearBottom && spaceAbove > 120) || (spaceBelow < 120 && spaceAbove > spaceBelow)) {
                            setOpenUp(true);
                        } else {
                            setOpenUp(false);
                        }
                        setShowReactions(v => !v);
                        setShowMenu(false);
                    }}
                >
                    ☺
                </button>

                <button
                    className="action-btn"
                    title="More"
                    onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const spaceBelow = window.innerHeight - rect.bottom;
                        const spaceAbove = rect.top;
                        const isNearBottom = totalCount - index <= 4;
                        const isNearTop = index < 3;
                        if (isNearTop) {
                            setOpenUp(false);
                        } else if ((isNearBottom && spaceAbove > 320) || (spaceBelow < 320 && spaceAbove > spaceBelow)) {
                            setOpenUp(true);
                        } else {
                            setOpenUp(false);
                        }
                        setShowMenu(v => !v);
                        setShowReactions(false);
                    }}
                >
                    ...
                </button>
            </div>

            {showReactions && (
                <div className={`reaction-emoji-bar ${openUp ? "open-up" : ""}`}>
                    {REACTION_EMOJIS.map(emoji => {
                        const hasReacted = msg.reactions?.some(
                            r => r.emoji === emoji && r.username?.toLowerCase() === currentUser?.toLowerCase()
                        );
                        return (
                            <button
                                key={emoji}
                                className={`emoji-option ${hasReacted ? "active" : ""}`}
                                onClick={() => { onReact(emoji); setShowReactions(false); }}
                            >
                                {emoji}
                            </button>
                        );
                    })}
                    <button
                        className="emoji-option add-reaction-trigger"
                        onClick={() => {
                            if (onAddReactionClick) {
                                onAddReactionClick(msg._id);
                            }
                            setShowReactions(false);
                        }}
                        title="Add Reaction"
                    >
                        ➕
                    </button>
                </div>
            )}

            {showMenu && (
                <div className={`message-menu ${openUp ? "open-up" : ""}`}>
                    {isOwn && (
                        <button className="menu-item" onClick={() => { onShowMessageInfo(msg); setShowMenu(false); }}>
                            <Info size={16} className="menu-icon" />
                            <span>Message info</span>
                        </button>
                    )}
                    <button className="menu-item" onClick={() => { onReply(msg); setShowMenu(false); }}>
                        <CornerUpLeft size={16} className="menu-icon" />
                        <span>Reply</span>
                    </button>
                    {!isVoice && !msg.isLocked && !msg.sticker && (
                        <button className="menu-item" onClick={() => { handleCopy(); setShowMenu(false); }}>
                            <Copy size={16} className="menu-icon" />
                            <span>Copy</span>
                        </button>
                    )}
                    {!msg.isLocked && (
                        <button className="menu-item" onClick={() => { alert("Forwarding will be available soon!"); setShowMenu(false); }}>
                            <CornerUpRight size={16} className="menu-icon" />
                            <span>Forward</span>
                        </button>
                    )}
                    {!msg.sticker && !msg.isDeleted && (
                        msg.isPinned ? (
                            onUnpin && (
                                <button className="menu-item" onClick={() => { onUnpin(msg._id); setShowMenu(false); }}>
                                    <PinOff size={16} className="menu-icon" />
                                    <span>Unpin</span>
                                </button>
                            )
                        ) : (
                            onPin && (
                                <button className="menu-item" onClick={() => { onPin(msg); setShowMenu(false); }}>
                                    <Pin size={16} className="menu-icon" style={{ transform: 'rotate(45deg)' }} />
                                    <span>Pin</span>
                                </button>
                            )
                        )
                    )}
                    {!msg.sticker && (
                        <button className="menu-item" onClick={() => { alert("Starring will be available soon!"); setShowMenu(false); }}>
                            <Star size={16} className="menu-icon" />
                            <span>Star</span>
                        </button>
                    )}
                    {!msg.isLocked && !isVoice && onAddToWork && (
                        <button className="menu-item" onClick={() => { onAddToWork(msg); setShowMenu(false); }}>
                            <Briefcase size={16} className="menu-icon" />
                            <span>Add to work</span>
                        </button>
                    )}
                    {isOwn && !msg.isLocked && !isVoice && (
                        <button className="menu-item" onClick={() => { onEdit(); setShowMenu(false); }}>
                            <Pencil size={16} className="menu-icon" />
                            <span>Edit</span>
                        </button>
                    )}
                    {isPrivate && !msg.isLocked && !msg.fileUrl && (
                        <button className="menu-item" onClick={() => { onLockMessage(msg); setShowMenu(false); }}>
                            <Lock size={16} className="menu-icon" />
                            <span>Lock message</span>
                        </button>
                    )}
                    <button className="menu-item danger" onClick={() => { onDelete("me"); setShowMenu(false); }}>
                        <Trash2 size={16} className="menu-icon" />
                        <span>Delete for me</span>
                    </button>
                    {isOwn && (
                        <button className="menu-item danger" onClick={() => { onDelete("everyone"); setShowMenu(false); }}>
                            <Trash2 size={16} className="menu-icon" />
                            <span>Delete for everyone</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

function MessageList({ 
    messages, 
    loadingMessages = false,
    currentUser, 
    messagesEndRef, 
    onReact, 
    onEdit, 
    onDelete, 
    isPrivate, 
    onAddReactionClick, 
    typingUser, 
    recordingUser = null,
    onUserProfileClick, 
    allUsers = [], 
    onlineUserList = [], 
    onReply, 
    onShowMessageInfo, 
    onCopySuccess, 
    onLockMessage, 
    onUnlockLockedMessage,
    isSelectionMode = false,
    selectedMessageIds = new Set(),
    onToggleMessageSelection,
    onAddToWork,
    highlightMessageId,
    onPin,
    onUnpin,
    currentUserDisplayName
}) {
    const [showScrollBottom, setShowScrollBottom] = useState(false);
    const [activeLightbox, setActiveLightbox] = useState(null); // { url, name }
    const [selectedReactionMsgId, setSelectedReactionMsgId] = useState(null);
    const scrollContainerRef = useRef(null);

    const [tick, setTick] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => {
            setTick(t => t + 1);
        }, 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (highlightMessageId) {
            const el = document.getElementById(`message_${highlightMessageId}`);
            if (el) {
                setTimeout(() => {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add("highlighted-message-flash");
                    setTimeout(() => {
                        el.classList.remove("highlighted-message-flash");
                    }, 4000);
                }, 300);
            }
        }
    }, [highlightMessageId, messages]);

    const activeReactionMsg = messages.find(m => m._id === selectedReactionMsgId);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === "Escape") {
                setActiveLightbox(null);
                setSelectedReactionMsgId(null);
            }
        };
        if (activeLightbox || selectedReactionMsgId) {
            window.addEventListener("keydown", handleKeyDown);
        }
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [activeLightbox, selectedReactionMsgId]);

    const handleScroll = () => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        const shouldShow = distanceFromBottom > 150;
        setShowScrollBottom(prev => {
            if (prev !== shouldShow) {
                return shouldShow;
            }
            return prev;
        });
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const lastMessagesLengthRef = useRef(messages.length);
    const prevFirstMsgIdRef = useRef(null);

    useEffect(() => {
        setShowScrollBottom(false);

        const container = scrollContainerRef.current;
        if (!container) return;

        const isNewMessage = messages.length > lastMessagesLengthRef.current;
        lastMessagesLengthRef.current = messages.length;

        const firstMsg = messages[0];
        const firstMsgId = firstMsg?._id || firstMsg?.createdAt || null;
        const isRoomSwitch = firstMsgId !== prevFirstMsgIdRef.current;
        prevFirstMsgIdRef.current = firstMsgId;

        if (isNewMessage) {
            const lastMsg = messages[messages.length - 1];
            const isOwn = lastMsg?.username?.toLowerCase() === currentUser?.toLowerCase();
            const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
            const isNearBottom = distanceFromBottom < 300;

            if (isOwn || isNearBottom) {
                messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }
        } else if (isRoomSwitch) {
            // On initial load or room switch, scroll instantly to avoid smooth scroll jank
            messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
        }
    }, [messages, currentUser, messagesEndRef]);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        if (typingUser) {
            const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
            if (distanceFromBottom < 150) {
                messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }
        }
    }, [typingUser, messagesEndRef]);

    if (loadingMessages) {
        return (
            <div className="messages-wrapper">
                <div className="messages" style={{ overflow: 'hidden' }}>
                    {[1, 2, 3, 4, 5].map((val) => {
                        const isOwn = val % 2 === 0;
                        const widthVal = val === 1 ? '70%' : val === 2 ? '45%' : val === 3 ? '60%' : val === 4 ? '35%' : '50%';
                        return (
                            <div key={val} className={`message-row ${isOwn ? 'own' : 'other'}`}>
                                {!isOwn && <div className="avatar skeleton-avatar"></div>}
                                <div className={`message-bubble-wrapper ${isOwn ? 'own' : 'other'}`}>
                                    <div className={`skeleton-loader ${isOwn ? 'own' : 'other'}`} style={{ width: widthVal }}>
                                        <div className="skeleton-line first"></div>
                                        <div className="skeleton-line second"></div>
                                    </div>
                                </div>
                                {isOwn && <div className="avatar skeleton-avatar"></div>}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    if (messages.length === 0) {
        return (
            <div className="messages-wrapper">
                <div className="messages empty-chat-view" ref={scrollContainerRef} onScroll={handleScroll}>
                    <div className="empty-chat-illustration-container">
                        <img 
                            src="/mailbox-empty.png" 
                            alt="No messages" 
                            className="empty-chat-illustration" 
                        />
                        <p className="empty-chat-text">No messages here yet. Start the conversation!</p>
                    </div>
                    <div ref={messagesEndRef}></div>
                </div>
            </div>
        );
    }

    return (
        <div className="messages-wrapper">
            <div className="messages" ref={scrollContainerRef} onScroll={handleScroll}>
                {messages.map((msg, index) => {
                    if (msg.username === "System") {
                        const isLegacyDate = /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(msg.text);
                        if (isLegacyDate) return null;

                        let displayText = msg.text;
                        if (msg.text && msg.text.endsWith("pinned a message")) {
                            const pName = msg.text.replace(" pinned a message", "");
                            const isMe = pName.toLowerCase() === currentUser?.toLowerCase() || 
                                         (currentUserDisplayName && pName === currentUserDisplayName);
                            if (isMe) {
                                displayText = "You pinned a message";
                            }
                        }

                        return (
                            <div className="system-message" key={msg._id || index}>
                                {displayText}
                            </div>
                        );
                    }

                    const isOwn = msg.username?.toLowerCase() === currentUser?.toLowerCase();
                    const isSelected = selectedMessageIds.has(msg._id);
                    const selectionClass = isSelectionMode ? "selection-active" : "";
                    const selectedClass = isSelected ? "selected-row" : "";

                    const isLastStatus = index === messages.length - 1 && isOwn && isPrivate && !msg.isDeleted;
                    
                    let prevMsg = null;
                    for (let i = index - 1; i >= 0; i--) {
                        const m = messages[i];
                        if (m.username !== "System" || !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(m.text)) {
                            prevMsg = m;
                            break;
                        }
                    }

                    const showDateHeader = !prevMsg || (() => {
                        const prevDate = new Date(prevMsg.createdAt);
                        const currDate = new Date(msg.createdAt);
                        return prevDate.toDateString() !== currDate.toDateString();
                    })();

                    return (
                        <React.Fragment key={msg._id || index}>
                            {showDateHeader && (
                                <div className="system-message date-divider" style={{ 
                                    alignSelf: 'center', 
                                    margin: '18px auto 10px', 
                                    fontSize: '11.5px',
                                    fontWeight: '600',
                                    background: 'rgba(120, 120, 120, 0.18)',
                                    color: 'var(--text)',
                                    padding: '5px 14px',
                                    borderRadius: '999px',
                                    border: 'none',
                                    opacity: 0.8,
                                    userSelect: 'none',
                                    textAlign: 'center'
                                }}>
                                    {formatDividerDate(msg.createdAt)}
                                </div>
                            )}

                            <div 
                                id={`message_${msg._id}`}
                                className={`message-row ${isOwn ? "own" : "other"} ${selectionClass} ${selectedClass} ${highlightMessageId === msg._id ? "highlighted-message-flash" : ""}`} 
                                key={msg._id || index}
                            style={{
                                marginBottom: isLastStatus ? '20px' : '0px'
                            }}
                            onClick={() => {
                                if (isSelectionMode && onToggleMessageSelection) {
                                    onToggleMessageSelection(msg._id);
                                }
                            }}
                        >
                            {isSelectionMode && (
                                <div className="message-selection-checkbox-container">
                                    <div className={`message-selection-checkbox-unique ${isSelected ? "checked" : ""}`}>
                                        <svg viewBox="0 0 24 24" className="checkbox-bubble-svg">
                                            {/* Back bubble */}
                                            <path 
                                                d="M 9.5 6.5 C 6.2 6.5 3.5 9.2 3.5 12.5 C 3.5 14.5 4.5 16.3 6.1 17.4 L 4.5 21 L 8.5 19 C 8.8 19 9.2 19 9.5 19 C 12.8 19 15.5 16.3 15.5 12.5 C 15.5 9.2 12.8 6.5 9.5 6.5 Z" 
                                                className="checkbox-bubble-back"
                                            />
                                            {/* Mask to cut overlap gap */}
                                            <path 
                                                d="M 14.5 3 C 10.9 3 8 5.9 8 9.5 C 8 11.7 9.1 13.7 10.9 14.9 L 9.1 18.9 L 13.5 16.7 C 13.8 16.8 14.1 16.8 14.5 16.8 C 18.1 16.8 21 13.9 21 9.5 C 21 5.9 18.1 3 14.5 3 Z" 
                                                className="checkbox-bubble-front-mask"
                                            />
                                            {/* Front bubble */}
                                            <path 
                                                d="M 14.5 3 C 10.9 3 8 5.9 8 9.5 C 8 11.7 9.1 13.7 10.9 14.9 L 9.1 18.9 L 13.5 16.7 C 13.8 16.8 14.1 16.8 14.5 16.8 C 18.1 16.8 21 13.9 21 9.5 C 21 5.9 18.1 3 14.5 3 Z" 
                                                className="checkbox-bubble-front"
                                            />
                                            {/* Inside elements (dots or checkmark) */}
                                            {isSelected ? (
                                                <polyline 
                                                    points="11.5 9.5 13.5 11.5 17.5 7.5" 
                                                    className="checkbox-bubble-checkmark"
                                                />
                                            ) : (
                                                <g className="checkbox-bubble-dots">
                                                    <circle cx="11.5" cy="9.5" r="1" />
                                                    <circle cx="14.5" cy="9.5" r="1" />
                                                    <circle cx="17.5" cy="9.5" r="1" />
                                                </g>
                                            )}
                                        </svg>
                                    </div>
                                </div>
                            )}

                            {!isOwn && (
                                <div 
                                    onClick={(e) => {
                                        if (isSelectionMode) {
                                            e.stopPropagation();
                                            onToggleMessageSelection && onToggleMessageSelection(msg._id);
                                            return;
                                        }
                                        onUserProfileClick(msg.username);
                                    }} 
                                    style={{ cursor: isSelectionMode ? "default" : "pointer" }} 
                                    title={isSelectionMode ? "" : "View Profile"}
                                >
                                    <Avatar username={msg.username} avatarSrc={msg.avatar} />
                                </div>
                            )}

                            {isOwn && (
                                <div onClick={() => onUserProfileClick(msg.username)} style={{ cursor: "pointer" }} title="View Profile">
                                    <Avatar username={msg.username} avatarSrc={msg.avatar} />
                                </div>
                            )}

                            <div className={`message-bubble-wrapper ${isOwn ? "own" : "other"}`}>
                                <MessageActions
                                    msg={msg}
                                    currentUser={currentUser}
                                    onReact={(emoji) => onReact(msg._id, emoji)}
                                    onEdit={() => onEdit(msg)}
                                    onDelete={(scope) => onDelete(msg._id, scope)}
                                    onAddReactionClick={onAddReactionClick}
                                    onReply={onReply}
                                    onShowMessageInfo={onShowMessageInfo}
                                    onCopySuccess={onCopySuccess}
                                    isPrivate={isPrivate}
                                    onLockMessage={onLockMessage}
                                    isSelectionMode={isSelectionMode}
                                    index={index}
                                    totalCount={messages.length}
                                    onAddToWork={onAddToWork}
                                    onPin={onPin}
                                    onUnpin={onUnpin}
                                />

                                {msg.isLocked ? (
                                    <div 
                                        className={`message-bubble ${isOwn ? "own" : "other"} locked-message`}
                                        onClick={() => onUnlockLockedMessage(msg)}
                                        style={{ cursor: 'pointer' }}
                                        title="Locked message. Click to unlock."
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px' }}>
                                            <Lock size={16} className="lock-symbol" />
                                            <span style={{ fontSize: '13.5px', fontWeight: '600', fontStyle: 'italic' }}>Locked Message</span>
                                        </div>
                                        <div className="message-meta">
                                            <span className="message-time">
                                                {formatTimestamp(msg.createdAt)}
                                            </span>
                                        </div>
                                    </div>
                                ) : msg.sticker && !msg.isDeleted ? (
                                    <div className={`message-sticker-container-bubble ${isOwn ? "own" : "other"}`}>
                                        {!isOwn && (
                                            <span 
                                                className="message-username" 
                                                onClick={() => onUserProfileClick(msg.username)}
                                                style={{ cursor: "pointer", textDecoration: 'underline', display: 'block', marginBottom: '4px' }}
                                                title="View Profile"
                                            >
                                                {msg.displayName || msg.username}
                                                {msg.isGuest && <span className="guest-badge">[Guest]</span>}
                                            </span>
                                        )}
                                        <StickerBubble msg={msg} />
                                        <div className="message-meta">
                                            <span className="message-time">
                                                {formatTimestamp(msg.createdAt)}
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className={`message-bubble ${isOwn ? "own" : "other"} ${msg.isDeleted ? "deleted" : ""}`}>
                                        {msg.replyTo && msg.replyTo.messageId && (
                                            <div className="message-reply-preview">
                                                <div className="reply-preview-body">
                                                    <span className="reply-preview-user">
                                                        {msg.replyTo.username === currentUser ? "You" : msg.replyTo.username}
                                                    </span>
                                                    <p className="reply-preview-msg">
                                                        {msg.replyTo.text}
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                        {!isOwn && (
                                            <span 
                                                className="message-username" 
                                                onClick={() => onUserProfileClick(msg.username)}
                                                style={{ cursor: "pointer", textDecoration: 'underline' }}
                                                title="View Profile"
                                            >
                                                {msg.displayName || msg.username}
                                                {msg.isGuest && <span className="guest-badge">[Guest]</span>}
                                            </span>
                                        )}
                                        {msg.fileUrl && !msg.isDeleted && (
                                            <div className="message-attachment-container">
                                                {msg.fileType.startsWith("image/") ? (
                                                    <div className="attachment-image-wrapper">
                                                        <img 
                                                            src={`${getBackendUrl()}${msg.fileUrl}`} 
                                                            alt={msg.fileName || "Image"} 
                                                            className="attachment-img"
                                                            onClick={() => setActiveLightbox({ url: `${getBackendUrl()}${msg.fileUrl}`, name: msg.fileName })}
                                                        />
                                                        {msg.fileQuality === "HD" && (
                                                            <div className="hd-badge-corner" title="High Definition Quality">
                                                                HD
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : msg.fileType.startsWith("video/") ? (
                                                    <div className="attachment-video-wrapper">
                                                        <video 
                                                            src={`${getBackendUrl()}${msg.fileUrl}`} 
                                                            controls 
                                                            className="attachment-video"
                                                        />
                                                    </div>
                                                ) : msg.fileType === "audio/e2ee" || msg.fileType.startsWith("audio/") ? (() => {
                                                    let voiceData = null;
                                                    try {
                                                        if (msg.text && msg.text.trim().startsWith("{")) {
                                                            const parsed = JSON.parse(msg.text);
                                                            if (parsed && (parsed.__voice === true || typeof parsed.duration !== 'undefined')) {
                                                                voiceData = parsed;
                                                            }
                                                        }
                                                    } catch(e) {
                                                        console.error("Defensive voiceData parse failed:", e);
                                                    }
                                                    if (voiceData) {
                                                        console.log("[Nexus ASR J] React message object parsed voiceData:", JSON.stringify(voiceData));
                                                        return (
                                                            <VoiceMessageBubble
                                                                fileUrl={`${getBackendUrl()}${msg.fileUrl}`}
                                                                encryptedPayload={msg.fileType === "audio/e2ee" ? voiceData : null}
                                                                isE2EE={msg.fileType === "audio/e2ee"}
                                                                isOwnMessage={isOwn}
                                                                duration={voiceData.duration}
                                                                waveform={voiceData.waveform}
                                                                messageId={msg._id}
                                                            />
                                                        );
                                                    }
                                                    // Fallback for non-voice-recorder audio
                                                    return (
                                                        <div className="attachment-audio-wrapper" style={{ padding: '8px' }}>
                                                            <audio src={`${getBackendUrl()}${msg.fileUrl}`} controls />
                                                        </div>
                                                    );
                                                })() : (
                                                    <div className="attachment-document-card">
                                                        <div className="doc-icon-section">
                                                            <FileText size={24} className="purple-text" />
                                                        </div>
                                                        <div className="doc-info-section">
                                                            <span className="doc-filename" title={msg.fileName}>
                                                                {msg.fileName}
                                                            </span>
                                                            <span className="doc-filesize">
                                                                {formatFileSize(msg.fileSize)}
                                                            </span>
                                                        </div>
                                                        <a 
                                                            href={`${getBackendUrl()}${msg.fileUrl}`} 
                                                            download={msg.fileName} 
                                                            className="doc-download-btn"
                                                            title="Download file"
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                        >
                                                            <Download size={16} />
                                                        </a>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {msg.isDeleted ? (
                                            <p className="message-text">{msg.text}</p>
                                        ) : (msg.isDecrypting || (msg.text && (msg.text === "[Decrypting E2EE message...]" || msg.text.includes("Decrypting")))) ? (
                                            <div className="skeleton-loader">
                                                <div className="skeleton-line first"></div>
                                                <div className="skeleton-line second"></div>
                                            </div>
                                        ) : (
                                            <>
                                                {msg.text && (
                                                    !msg.fileType || 
                                                    (msg.fileType !== "audio/e2ee" && !msg.fileType.startsWith("audio/")) ||
                                                    // Fallback: If voice parsing of JSON metadata fails or lacks voice markers, render as normal text
                                                    (() => {
                                                        try {
                                                            if (!msg.text.trim().startsWith("{")) return true;
                                                            const parsed = JSON.parse(msg.text);
                                                            return !(parsed && (parsed.__voice === true || typeof parsed.duration !== 'undefined'));
                                                        } catch(e) {
                                                            return true;
                                                        }
                                                    })()
                                                ) && (
                                                    <div className="message-text markdown-content">
                                                        <ReactMarkdown 
                                                            remarkPlugins={[remarkGfm]} 
                                                            rehypePlugins={[rehypeRaw, [rehypeSanitize, customSchema]]}
                                                            components={{
                                                                a: ({ node, ...props }) => <a target="_blank" rel="noopener noreferrer" {...props} />,
                                                                p: ({ node, ...props }) => <span {...props} />
                                                            }}
                                                        >
                                                            {msg.text}
                                                        </ReactMarkdown>
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        <div className="message-meta">
                                            <span className="message-time">
                                                {formatTimestamp(msg.createdAt)}
                                                {msg.isEdited && !msg.isDeleted && <span className="edited-label"> edited</span>}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                <ReactionBar
                                    reactions={msg.reactions}
                                    onShowDetail={() => setSelectedReactionMsgId(msg._id)}
                                    currentUser={currentUser}
                                />

                                {index === messages.length - 1 && isOwn && isPrivate && !msg.isDeleted && msg.seenBy?.filter(u => u?.toLowerCase() !== currentUser?.toLowerCase()).length > 0 && (
                                    <div className="last-message-status" style={{ 
                                        fontSize: '11.5px', 
                                        color: 'var(--muted)', 
                                        position: 'absolute',
                                        bottom: '-20px',
                                        right: '4px',
                                        opacity: 0.85,
                                        userSelect: 'none',
                                        fontWeight: '500',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        <span>Seen {formatRelativeTime(msg.seenAt || msg.createdAt)}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </React.Fragment>
                );
            })}

                <ThoughtBubbleIndicator typingUser={typingUser} />
                <RecordingBubbleIndicator recordingUser={recordingUser} />
                <div ref={messagesEndRef}></div>
            </div>
            
            {showScrollBottom && (
                <button 
                    className="scroll-to-bottom-btn" 
                    onClick={scrollToBottom}
                    title="Scroll to bottom"
                    aria-label="Scroll to bottom"
                >
                    <ArrowDown size={20} />
                </button>
            )}

            {activeLightbox && (
                <div 
                    className="lightbox-overlay" 
                    onClick={() => setActiveLightbox(null)}
                >
                    <div className="lightbox-container" onClick={(e) => e.stopPropagation()}>
                        <div className="lightbox-header">
                            <span className="lightbox-filename" title={activeLightbox.name}>
                                {activeLightbox.name}
                            </span>
                            <div className="lightbox-actions">
                                <a 
                                    href={`${activeLightbox.url}?download=true`} 
                                    download={activeLightbox.name}
                                    className="lightbox-action-btn download-btn"
                                    title="Download Image"
                                >
                                    <Download size={20} />
                                    <span>Download</span>
                                </a>
                                <button 
                                    onClick={() => setActiveLightbox(null)} 
                                    className="lightbox-action-btn close-btn"
                                    title="Close"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>
                        <div className="lightbox-content">
                            <img 
                                src={activeLightbox.url} 
                                alt={activeLightbox.name} 
                                className="lightbox-image" 
                            />
                        </div>
                    </div>
                </div>
            )}

            {selectedReactionMsgId && activeReactionMsg && (
                <div 
                    className="modal-overlay" 
                    onClick={() => setSelectedReactionMsgId(null)}
                >
                    <div 
                        className="modal-content reactions-detail-modal" 
                        onClick={(e) => e.stopPropagation()}
                        style={{ width: 'min(90%, 360px)', padding: '20px' }}
                    >
                        <div className="modal-header-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>Reactions</h3>
                            <button className="close-picker-btn" onClick={() => setSelectedReactionMsgId(null)} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer' }}>×</button>
                        </div>
                        <div className="modal-body-section reactions-list-body" style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                            {(!activeReactionMsg.reactions || activeReactionMsg.reactions.length === 0) ? (
                                <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '14px', padding: '16px' }}>
                                    No reactions on this message.
                                </div>
                            ) : (
                                activeReactionMsg.reactions.map((r, idx) => {
                                    const isCurrentUser = r.username?.toLowerCase() === currentUser?.toLowerCase();
                                    const userDetail = allUsers.find(u => u.username?.toLowerCase() === r.username?.toLowerCase());
                                    const displayName = userDetail?.displayName || r.username;
                                    const avatarSrc = userDetail?.avatar;

                                    return (
                                        <div 
                                            key={idx} 
                                            className={`reaction-detail-row ${isCurrentUser ? "interactive-mine" : ""}`}
                                            onClick={isCurrentUser ? () => {
                                                onReact(activeReactionMsg._id, r.emoji);
                                                // If this is the last reaction, close the modal immediately
                                                if (activeReactionMsg.reactions.length <= 1) {
                                                    setSelectedReactionMsgId(null);
                                                }
                                            } : undefined}
                                            title={isCurrentUser ? "Click to remove reaction" : undefined}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '8px 10px',
                                                borderRadius: '8px',
                                                background: 'var(--soft)',
                                                border: '1px solid var(--border)',
                                                cursor: isCurrentUser ? 'pointer' : 'default',
                                                transition: 'background 0.2s, transform 0.2s'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                                <Avatar username={r.username} avatarSrc={avatarSrc} />
                                                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                                    <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {displayName}
                                                        {isCurrentUser && <span style={{ marginLeft: '4px', fontSize: '10px', color: 'var(--muted)', fontWeight: 'bold' }}>(You)</span>}
                                                    </span>
                                                    {isCurrentUser && (
                                                        <span style={{ fontSize: '10px', color: 'var(--danger)', fontWeight: '600', marginTop: '2px' }}>
                                                            Tap to remove reaction
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <span style={{ fontSize: '18px' }}>{r.emoji}</span>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default MessageList;
