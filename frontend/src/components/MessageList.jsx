import { useState, useEffect, useRef } from "react";

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
                }, 1000);
            }
        }

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [typingUser, visible, isExiting]);

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

const REACTION_EMOJIS = ["👍", "❤️", "🔥", "😂"];

function SeenStatus({ msg, currentUser, isPrivate }) {
    if (!isPrivate || msg.username !== currentUser || msg.isDeleted) return null;

    const seenBy = msg.seenBy || [];
    const seenByOther = seenBy.filter(u => u !== currentUser).length > 0;

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
                const myReaction = reactions.find(r => r.username === currentUser && r.emoji === emoji);
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
    const isOwn = msg.username === currentUser;

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

                {isOwn && (
                    <button
                        className="action-btn"
                        title="More"
                        onClick={() => { setShowMenu(v => !v); setShowReactions(false); }}
                    >
                        ...
                    </button>
                )}
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

            {showMenu && isOwn && (
                <div className="message-menu">
                    <button className="menu-item" onClick={() => { onEdit(); setShowMenu(false); }}>
                        Edit
                    </button>
                    <button className="menu-item danger" onClick={() => { onDelete("me"); setShowMenu(false); }}>
                        Delete for me
                    </button>
                    <button className="menu-item danger" onClick={() => { onDelete("everyone"); setShowMenu(false); }}>
                        Delete for everyone
                    </button>
                </div>
            )}
        </div>
    );
}

function MessageList({ messages, currentUser, messagesEndRef, onReact, onEdit, onDelete, isPrivate, onAddReactionClick, typingUser, onUserProfileClick }) {
    if (messages.length === 0) {
        return (
            <div className="messages empty-messages-placeholder">
                <div className="empty-chat-illustration">💬</div>
                <h3>No messages yet</h3>
                <p>Messages sent after clearing the chat will appear here.</p>
                <div ref={messagesEndRef}></div>
            </div>
        );
    }

    return (
        <div className="messages">
            {messages.map((msg, index) => {
                if (msg.username === "System") {
                    return (
                        <div className="system-message" key={msg._id || index}>
                            {msg.text}
                        </div>
                    );
                }

                const isOwn = msg.username === currentUser;

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
                                <p className="message-text">{msg.text}</p>

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
    );
}

export default MessageList;
