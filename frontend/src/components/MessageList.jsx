import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import VoiceMessageBubble from "./VoiceMessageBubble";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { ArrowDown, FileText, Download, Film, X, Info, CornerUpLeft, Copy, CornerUpRight, Pin, Star, Pencil, Trash2, Lock } from "lucide-react";
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

function MessageActions({ msg, currentUser, onReact, onEdit, onDelete, onAddReactionClick, onReply, onShowMessageInfo, onCopySuccess, isPrivate, onLockMessage }) {
    const [showReactions, setShowReactions] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [openUp, setOpenUp] = useState(false);
    const isOwn = msg.username?.toLowerCase() === currentUser?.toLowerCase();

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
                        if (spaceBelow < 120 && spaceAbove > spaceBelow) {
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
                        if (spaceBelow < 320 && spaceAbove > spaceBelow) {
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
                    <button className="menu-item" onClick={() => { handleCopy(); setShowMenu(false); }}>
                        <Copy size={16} className="menu-icon" />
                        <span>Copy</span>
                    </button>
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
                    {isOwn && !msg.isLocked && (
                        <button className="menu-item" onClick={() => { onEdit(); setShowMenu(false); }}>
                            <Pencil size={16} className="menu-icon" />
                            <span>Edit</span>
                        </button>
                    )}
                    {isPrivate && !msg.isLocked && (
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

function MessageList({ messages, currentUser, messagesEndRef, onReact, onEdit, onDelete, isPrivate, onAddReactionClick, typingUser, onUserProfileClick, allUsers = [], onlineUserList = [], onReply, onShowMessageInfo, onCopySuccess, onLockMessage, onUnlockLockedMessage }) {
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

    useEffect(() => {
        setShowScrollBottom(false);

        const container = scrollContainerRef.current;
        if (!container) return;

        const isNewMessage = messages.length > lastMessagesLengthRef.current;
        lastMessagesLengthRef.current = messages.length;

        if (isNewMessage) {
            const lastMsg = messages[messages.length - 1];
            const isOwn = lastMsg?.username?.toLowerCase() === currentUser?.toLowerCase();
            const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
            const isNearBottom = distanceFromBottom < 300;

            if (isOwn || isNearBottom) {
                messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }
        } else {
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

                    return (
                        <div className={`message-row ${isOwn ? "own" : "other"}`} key={msg._id || index}>
                            {!isOwn && (
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
                                                    try { voiceData = JSON.parse(msg.text); } catch(e) {}
                                                    if (voiceData && typeof voiceData.duration !== 'undefined') {
                                                        return (
                                                            <VoiceMessageBubble
                                                                fileUrl={`${getBackendUrl()}${msg.fileUrl}`}
                                                                encryptedPayload={msg.fileType === "audio/e2ee" ? voiceData : null}
                                                                isE2EE={msg.fileType === "audio/e2ee"}
                                                                isOwnMessage={isOwn}
                                                                duration={voiceData.duration}
                                                                waveform={voiceData.waveform}
                                                                transcript={voiceData.transcript}
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
                                                {msg.text && (!msg.fileType || (msg.fileType !== "audio/e2ee" && !msg.fileType.startsWith("audio/"))) && (
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
