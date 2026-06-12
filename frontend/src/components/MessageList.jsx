import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { ArrowDown, FileText, Download, Film, X } from "lucide-react";
import { getBackendUrl } from "../utils/config";


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

function SeenStatus({ msg, currentUser, isPrivate }) {
    if (!isPrivate || msg.username?.toLowerCase() !== currentUser?.toLowerCase() || msg.isDeleted) return null;

    const seenBy = msg.seenBy || [];
    const seenByOther = seenBy.filter(u => u?.toLowerCase() !== currentUser?.toLowerCase()).length > 0;

    return (
        <span className={`seen-status ${seenByOther ? "seen" : "delivered"}`}>
            {seenByOther ? "Seen" : "Sent"}
        </span>
    );
}

function ReactionBar({ reactions, onReact, currentUser }) {
    if (!reactions || reactions.length === 0) return null;

    const counts = {};
    reactions.forEach(r => {
        counts[r.emoji] = (counts[r.emoji] || 0) + 1;
    });

    return (
        <div className="reaction-bar">
            {Object.entries(counts).map(([emoji, count]) => {
                const myReaction = reactions.find(r => r.username?.toLowerCase() === currentUser?.toLowerCase() && r.emoji === emoji);
                return (
                    <button
                        key={emoji}
                        className={`reaction-chip ${myReaction ? "mine" : ""}`}
                        onClick={() => onReact(emoji)}
                    >
                        {emoji} {count}
                    </button>
                );
            })}
        </div>
    );
}

function MessageActions({ msg, currentUser, onReact, onEdit, onDelete, onAddReactionClick }) {
    const [showReactions, setShowReactions] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const isOwn = msg.username?.toLowerCase() === currentUser?.toLowerCase();

    if (msg.isDeleted || msg.username === "System") return null;

    return (
        <div className={`message-actions ${isOwn ? "own" : "other"}`}>
            <div className="action-btn-group">
                <button
                    className="action-btn"
                    title="React"
                    onClick={() => { setShowReactions(v => !v); setShowMenu(false); }}
                >
                    ☺
                </button>

                <button
                    className="action-btn"
                    title="More"
                    onClick={() => { setShowMenu(v => !v); setShowReactions(false); }}
                >
                    ...
                </button>
            </div>

            {showReactions && (
                <div className="reaction-emoji-bar">
                    {REACTION_EMOJIS.map(emoji => (
                        <button
                            key={emoji}
                            className="emoji-option"
                            onClick={() => { onReact(emoji); setShowReactions(false); }}
                        >
                            {emoji}
                        </button>
                    ))}
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
                <div className="message-menu">
                    {isOwn ? (
                        <>
                            <button className="menu-item" onClick={() => { onEdit(); setShowMenu(false); }}>
                                Edit
                            </button>
                            <button className="menu-item danger" onClick={() => { onDelete("me"); setShowMenu(false); }}>
                                Delete for me
                            </button>
                            <button className="menu-item danger" onClick={() => { onDelete("everyone"); setShowMenu(false); }}>
                                Delete for everyone
                            </button>
                        </>
                    ) : (
                        <button className="menu-item danger" onClick={() => { onDelete("me"); setShowMenu(false); }}>
                            Delete for me
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

function MessageList({ messages, currentUser, messagesEndRef, onReact, onEdit, onDelete, isPrivate, onAddReactionClick, typingUser, onUserProfileClick }) {
    const [showScrollBottom, setShowScrollBottom] = useState(false);
    const [activeLightbox, setActiveLightbox] = useState(null); // { url, name }
    const scrollContainerRef = useRef(null);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === "Escape") {
                setActiveLightbox(null);
            }
        };
        if (activeLightbox) {
            window.addEventListener("keydown", handleKeyDown);
        }
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [activeLightbox]);

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
                <div className="messages" ref={scrollContainerRef} onScroll={handleScroll}>
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
                                />

                                <div className={`message-bubble ${isOwn ? "own" : "other"} ${msg.isDeleted ? "deleted" : ""}`}>
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
                                            ) : (
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
                                    ) : (
                                        <>
                                            {msg.text && (
                                                <div className="message-text markdown-content">
                                                    <ReactMarkdown 
                                                        remarkPlugins={[remarkGfm]} 
                                                        rehypePlugins={[rehypeSanitize]}
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
                                        <SeenStatus msg={msg} currentUser={currentUser} isPrivate={isPrivate} />
                                    </div>
                                </div>

                                <ReactionBar
                                    reactions={msg.reactions}
                                    onReact={(emoji) => onReact(msg._id, emoji)}
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
        </div>
    );
}

export default MessageList;
