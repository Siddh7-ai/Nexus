import React from "react";
import { FiArrowLeft, FiCheck } from "react-icons/fi";
import { Lock } from "lucide-react";

export default function MessageInfoModal({ msg, currentUser, onClose, isPrivate }) {
    if (!msg) return null;

    const isOwn = msg.username?.toLowerCase() === currentUser?.toLowerCase();
    
    // Check if message is read
    // In private chats: read if the other user has seen it.
    // In group chats: read if seenBy has more than 1 user.
    const isRead = isPrivate 
        ? msg.seenBy?.some(u => u.toLowerCase() !== msg.username?.toLowerCase())
        : msg.seenBy?.length > 1;

    // Get time elapsed or formatted time
    const formatRelativeTime = (dateStr) => {
        if (!dateStr) return "Just now";
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) return "Just now";
        if (diffMins === 1) return "1 minute ago";
        if (diffMins < 60) return `${diffMins} minutes ago`;
        
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours === 1) return "1 hour ago";
        if (diffHours < 24) return `${diffHours} hours ago`;
        
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    const formattedTime = formatRelativeTime(msg.createdAt);

    const formatLockTimeAndUser = (msg) => {
        const lockTime = msg.lockedAt || msg.createdAt;
        const relativeTime = formatRelativeTime(lockTime);
        const locker = msg.lockedBy || msg.username || "Someone";
        const lockerDisplay = locker.toLowerCase() === currentUser?.toLowerCase() ? "You" : locker;
        return `${relativeTime} by ${lockerDisplay}`;
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content vault-pin-modal message-info-modal" onClick={e => e.stopPropagation()}>
                <div className="message-info-header">
                    <button className="info-back-btn" onClick={onClose} aria-label="Back">
                        <FiArrowLeft size={20} />
                    </button>
                    <h3 className="info-title">Message info</h3>
                </div>

                <div className="info-preview-section">
                    <div className={`message-row ${isOwn ? "own" : "other"}`} style={{ width: '100%' }}>
                        {msg.isLocked ? (
                            <div 
                                className={`message-bubble ${isOwn ? "own" : "other"} locked-message`} 
                                style={{ margin: '0 auto', maxWidth: '85%', pointerEvents: 'none' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px' }}>
                                    <Lock size={16} className="lock-symbol" />
                                    <span style={{ fontSize: '13.5px', fontWeight: '600', fontStyle: 'italic' }}>Locked Message</span>
                                </div>
                                <div className="message-meta">
                                    <span className="message-time">
                                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className={`message-bubble ${isOwn ? "own" : "other"}`} style={{ margin: '0 auto', maxWidth: '85%', pointerEvents: 'none' }}>
                                <p className="message-text" style={{ margin: 0 }}>{msg.text}</p>
                                <div className="message-meta">
                                    <span className="message-time">
                                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="info-status-list">
                    {msg.isLocked && (
                        <div className="info-status-item">
                            <div className="info-status-left">
                                <span className="status-icon-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Lock size={16} className="lock-symbol" />
                                </span>
                                <div className="status-details">
                                    <span className="status-label">Locked</span>
                                    <span className="status-time">{formatLockTimeAndUser(msg)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="info-status-item">
                        <div className="info-status-left">
                            <span className="status-icon-wrap">
                                <FiCheck size={16} className={isRead ? "blue-tick" : "grey-tick"} />
                                <FiCheck size={16} className={`${isRead ? "blue-tick" : "grey-tick"} offset-tick`} />
                            </span>
                            <div className="status-details">
                                <span className="status-label">Read</span>
                                <span className="status-time">{isRead ? formattedTime : "--"}</span>
                            </div>
                        </div>
                    </div>

                    <div className="info-status-item">
                        <div className="info-status-left">
                            <span className="status-icon-wrap">
                                <FiCheck size={16} className="grey-tick" />
                                <FiCheck size={16} className="grey-tick offset-tick" />
                            </span>
                            <div className="status-details">
                                <span className="status-label">Delivered</span>
                                <span className="status-time">{formattedTime}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
