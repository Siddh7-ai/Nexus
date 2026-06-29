import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import VoiceMessageBubble from "./VoiceMessageBubble";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { ArrowDown, FileText, Download, Film, X, Info, CornerUpLeft, Copy, CornerUpRight, Pin, Star, Pencil, Trash2, Lock, Mic } from "lucide-react";
import { getBackendUrl } from "../utils/config";

const customSchema = {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames || []), "u"]
};

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

function SeenStatus({ msg, currentUser, onlineUserList = [] }) {
    if (msg.username?.toLowerCase() !== currentUser?.toLowerCase() || msg.isDeleted) return null;

    const seenBy = msg.seenBy || [];
    const seenByOther = seenBy.filter(u => u?.toLowerCase() !== currentUser?.toLowerCase()).length > 0;
    const isSending = msg.status === 'sending' || (msg._id && msg._id.toString().startsWith('temp_'));

    if (isSending) {
        return (
            <span className="seen-status sending" title="Sending...">
                🕐
            </span>
        );
    }

    const isSelfChat = msg.privateChatId && msg.privateChatId.toLowerCase() === `${currentUser?.toLowerCase()}_${currentUser?.toLowerCase()}`;
    if (seenByOther || isSelfChat) {
        return (
            <span className="seen-status read" title="Read">
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
                    ✓✓
                </span>
            );
        }
    }

    return (
        <span className="seen-status sent" title="Sent">
            ✓
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

function MessageActions({ msg, currentUser, onReact, onEdit, onDelete, onAddReactionClick, onReply, onShowMessageInfo, onCopySuccess, isPrivate, onLockMessage, isSelectionMode = false, index, totalCount }) {
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
        navigator.clipboard.writeText(textToCopy);
        if (onCopySuccess) {
            onCopySuccess();
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
                        if ((isNearBottom && spaceAbove > 120) || (spaceBelow < 120 && spaceAbove > spaceBelow)) {
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
                        if ((isNearBottom && spaceAbove > 320) || (spaceBelow < 320 && spaceAbove > spaceBelow)) {
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
                    {!isVoice && !msg.isLocked && (
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
                    <button className="menu-item" onClick={() => { alert("Pinning will be available soon!"); setShowMenu(false); }}>
                        <Pin size={16} className="menu-icon" />
                        <span>Pin</span>
                    </button>
                    <button className="menu-item" onClick={() => { alert("Starring will be available soon!"); setShowMenu(false); }}>
                        <Star size={16} className="menu-icon" />
                        <span>Star</span>
                    </button>
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
    onToggleMessageSelection
}) {
    const [showScrollBottom, setShowScrollBottom] = useState(false);
    const [activeLightbox, setActiveLightbox] = useState(null); // { url, name }
    const [selectedReactionMsgId, setSelectedReactionMsgId] = useState(null);
    const scrollContainerRef = useRef(null);

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
                        return (
                            <div className="system-message" key={msg._id || index}>
                                {msg.text}
                            </div>
                        );
                    }

                    const isOwn = msg.username?.toLowerCase() === currentUser?.toLowerCase();
                    const isSelected = selectedMessageIds.has(msg._id);
                    const selectionClass = isSelectionMode ? "selection-active" : "";
                    const selectedClass = isSelected ? "selected-row" : "";

                    return (
                        <div 
                            className={`message-row ${isOwn ? "own" : "other"} ${selectionClass} ${selectedClass}`} 
                            key={msg._id || index}
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
                                            <SeenStatus msg={msg} currentUser={currentUser} onlineUserList={onlineUserList} />
                                        </div>
                                    </div>
                                )}

                                <ReactionBar
                                    reactions={msg.reactions}
                                    onShowDetail={() => setSelectedReactionMsgId(msg._id)}
                                    currentUser={currentUser}
                                />
                            </div>

                            {isOwn && (
                                <div onClick={() => onUserProfileClick(msg.username)} style={{ cursor: "pointer" }} title="View Profile">
                                    <Avatar username={msg.username} avatarSrc={msg.avatar} />
                                </div>
                            )}
                        </div>
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
