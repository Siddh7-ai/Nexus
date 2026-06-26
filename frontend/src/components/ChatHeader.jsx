import { useState, useEffect, useRef } from "react";
import { FiSun, FiMoon, FiMoreVertical, FiUser, FiSlash, FiTrash2, FiLogOut, FiLogIn, FiCopy, FiShare2, FiSettings, FiMenu, FiChevronLeft, FiLock, FiActivity, FiBriefcase, FiCheckSquare, FiX, FiStar, FiCornerUpRight, FiDownload } from "react-icons/fi";

const VerifiedRoomBadge = ({ size = 15, style = {} }) => (
    <svg 
        viewBox="0 0 16 16" 
        width={size} 
        height={size} 
        style={{ flexShrink: 0, ...style }}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path 
            d="M10.067.87a2.89 2.89 0 0 0-4.134 0l-.622.638-.89-.011a2.89 2.89 0 0 0-2.924 2.924l.01.89-.636.622a2.89 2.89 0 0 0 0 4.134l.637.622-.011.89a2.89 2.89 0 0 0 2.924 2.924l.89-.01.622.636a2.89 2.89 0 0 0 4.134 0l.622-.637.89.011a2.89 2.89 0 0 0 2.924-2.924l-.01-.89.636-.622a2.89 2.89 0 0 0 0-4.134l-.637-.622.011-.89a2.89 2.89 0 0 0-2.924-2.924l-.89.01z" 
            fill="#12c7bd" 
        />
        <path 
            d="M4.8 8.0 l2.2 2.2 l4.2 -4.2" 
            fill="none" 
            stroke="#ffffff" 
            strokeWidth="1.8" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
        />
    </svg>
);

import OnlineUsers from "./OnlineUsers";
import savedMessagesLogo from "../assets/saved_messages.png";
import logo from "../assets/logo.png";
import { setThemeBrightness } from "../utils/theme";
import { ThemeToggleIcon } from "./ThemeToggleButton";

function Avatar({ username, avatarSrc, size = 32, className = "" }) {
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
    const colors = ["#bff7f2", "#c8eeff", "#d8f7cf", "#ffe1b8", "#e7dcff"];
    let colorIndex = 0;
    for (let i = 0; i < username.length; i++) {
        colorIndex += username.charCodeAt(i);
    }
    const color = colors[colorIndex % colors.length];

    return (
        <div className={`avatar ${className}`} style={{ backgroundColor: color, width: size, height: size, fontSize: size * 0.45 }}>
            {username.charAt(0).toUpperCase()}
        </div>
    );
}

function ChatHeader({ 
    username, 
    onLogout, 
    chatTitle, 
    onMenuToggle, 
    onBack,
    onlineUsers, 
    onlineUserList = [],
    isGuest, 
    onClearChatClick, 
    theme, 
    onThemeToggle, 
    isPrivate, 
    privateUser, 
    onUserProfileClick,
    onShowOnlineListClick,
    isBlocked,
    onToggleBlock,
    roomDetails,
    onLeaveRoom,
    onEditRoomClick,
    onVerifyClick,
    onToggleVisualizer,
    onVaultClick,
    isSelectionMode = false,
    selectedMessageIds = new Set(),
    onStartSelectionMode,
    onCancelSelection,
    onBulkDelete,
    onBulkDownload,
    onBulkStar,
    onBulkForward,
    messages = []
}) {
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef(null);
    const [copiedCode, setCopiedCode] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);
    const [brightness, setBrightness] = useState(() => {
        return localStorage.getItem("themeBrightness") || "100";
    });

    const handleBrightnessChange = (value) => {
        setBrightness(value);
        setThemeBrightness(value);
    };

    const handleCopyCode = (e) => {
        e.stopPropagation();
        if (!roomDetails?.code) return;
        navigator.clipboard.writeText(roomDetails.code);
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 1500);
    };

    const handleCopyLink = (e) => {
        e.stopPropagation();
        if (!roomDetails?.code) return;
        const inviteUrl = `${window.location.origin}?joinRoomCode=${roomDetails.code}`;
        navigator.clipboard.writeText(inviteUrl);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 1500);
    };

    useEffect(() => {
        if (!showDropdown) return;
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [showDropdown]);

    const isRoomAdmin = roomDetails?.admin?._id === username || 
                        roomDetails?.admin?.username === username || 
                        roomDetails?.admin === username;

    const selectedMessages = messages.filter(m => selectedMessageIds.has(m._id));
    const canDownload = selectedMessages.length > 0 && selectedMessages.every(msg => {
        const isVoice = msg.fileType === "audio/e2ee" || msg.fileType?.startsWith("audio/");
        return msg.fileUrl && !isVoice;
    });

    if (isSelectionMode) {
        return (
            <div className="chat-header">
                <div className="selection-header-container">
                    <div className="selection-header-left">
                        <button className="selection-cancel-btn" onClick={onCancelSelection} aria-label="Cancel selection" title="Cancel Selection">
                            <FiX size={20} />
                        </button>
                        <span className="selection-count-text">{selectedMessageIds.size} Selected</span>
                    </div>
                    <div className="selection-header-actions">
                        <button className="selection-action-btn" onClick={onBulkStar} title="Star selected messages">
                            <FiStar size={18} />
                        </button>
                        <button className="selection-action-btn" onClick={onBulkForward} title="Forward selected messages">
                            <FiCornerUpRight size={18} />
                        </button>
                        {canDownload && (
                            <button className="selection-action-btn" onClick={onBulkDownload} title="Download selected files">
                                <FiDownload size={18} />
                            </button>
                        )}
                        <button className="selection-action-btn danger" onClick={onBulkDelete} title="Delete selected messages">
                            <FiTrash2 size={18} />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="chat-header">
            <div className="chat-header-left">
                <button className="header-back-btn" onClick={onBack} aria-label="Go back to chat list" title="Back to Chats">
                    <FiChevronLeft size={20} />
                </button>
                <button className="menu-toggle-btn" onClick={onMenuToggle} aria-label="Toggle sidebar" title="Toggle Sidebar">
                    <FiMenu size={20} />
                </button>

                <div className="chat-header-info">
                    {isPrivate ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            <div 
                                className="chat-header-profile-trigger"
                                onClick={() => {
                                    if (privateUser?.username?.toLowerCase() !== username?.toLowerCase()) {
                                        onUserProfileClick && onUserProfileClick(privateUser?.username || chatTitle);
                                    }
                                }}
                                style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: privateUser?.username?.toLowerCase() === username?.toLowerCase() ? 'default' : 'pointer', minWidth: 0 }}
                                title={privateUser?.username?.toLowerCase() === username?.toLowerCase() ? "" : "View Profile"}
                            >
                                {privateUser?.username?.toLowerCase() === username?.toLowerCase() ? (
                                    <>
                                        <img 
                                            src={savedMessagesLogo} 
                                            alt="Saved Messages" 
                                            className="avatar header-avatar"
                                            style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }}
                                        />
                                        <div className="chat-title">Saved Messages</div>
                                    </>
                                ) : (
                                    <>
                                        <Avatar username={privateUser?.username || chatTitle} avatarSrc={privateUser?.avatar} size={36} className="header-avatar" />
                                        <div className="chat-title">{privateUser?.displayName || privateUser?.username || chatTitle}</div>
                                    </>
                                )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                <button 
                                    className="header-lock-btn" 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onVerifyClick && onVerifyClick();
                                    }}
                                    title="Verify Encryption"
                                    style={{ 
                                        background: 'none', 
                                        border: 'none', 
                                        color: 'var(--accent, #a855f7)', 
                                        cursor: 'pointer', 
                                        padding: '4px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        opacity: 0.8
                                    }}
                                >
                                    <FiLock size={16} />
                                </button>
                                <button 
                                    className="header-activity-btn" 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onToggleVisualizer && onToggleVisualizer();
                                    }}
                                    title="Toggle Data-Flow Visualizer"
                                    style={{ 
                                        background: 'none', 
                                        border: 'none', 
                                        color: 'var(--accent, #a855f7)', 
                                        cursor: 'pointer', 
                                        padding: '4px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        opacity: 0.8
                                    }}
                                >
                                    <FiActivity size={16} />
                                </button>
                                <button 
                                    className="header-vault-btn" 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onVaultClick && onVaultClick();
                                    }}
                                    title="Open Shared Vault"
                                    style={{ 
                                        background: 'none', 
                                        border: 'none', 
                                        color: 'var(--accent, #a855f7)', 
                                        cursor: 'pointer', 
                                        padding: '4px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        opacity: 0.8
                                    }}
                                >
                                    <FiBriefcase size={16} />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                {chatTitle === "Nexus Official" ? (
                                    <img 
                                        src={logo} 
                                        alt="Nexus Logo" 
                                        className="avatar header-avatar"
                                        style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }}
                                    />
                                ) : (
                                    roomDetails && roomDetails.isPrivate && (
                                        <Avatar 
                                            username={roomDetails.name} 
                                            avatarSrc={roomDetails.avatar} 
                                            size={36} 
                                            className="header-avatar" 
                                        />
                                    )
                                )}
                                <div className="chat-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {chatTitle || "Nexus Official"}
                                    {chatTitle === "Nexus Official" && (
                                        <VerifiedRoomBadge size={16} />
                                    )}
                                </div>
                            </div>
                            {roomDetails && roomDetails.isPrivate && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: (roomDetails.avatar ? '46px' : '0') }}>
                                    <span 
                                        className="room-code-badge" 
                                        style={{ 
                                            fontFamily: 'monospace', 
                                            background: 'var(--card-bg, rgba(255, 255, 255, 0.05))', 
                                            padding: '2px 6px', 
                                            borderRadius: '4px', 
                                            fontSize: '11px', 
                                            fontWeight: '700', 
                                            letterSpacing: '1px',
                                            border: '1px solid rgba(255, 255, 255, 0.1)',
                                            color: 'var(--accent)'
                                        }}
                                        title="Room Invite Code"
                                    >
                                        Code: {roomDetails.code}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="chat-header-right">
                <OnlineUsers
                    onlineUsers={onlineUsers}
                    onlineUserList={onlineUserList}
                    currentUser={username}
                    onUserProfileClick={onUserProfileClick}
                    onShowOnlineListClick={onShowOnlineListClick}
                />
                <div className="header-dropdown-container" ref={dropdownRef}>
                    <button 
                        className={`header-menu-trigger ${showDropdown ? 'active' : ''}`} 
                        onClick={() => setShowDropdown(prev => !prev)}
                        aria-label="More options"
                        title="Options"
                    >
                        <FiMoreVertical />
                    </button>
                    {showDropdown && (
                        <div className="header-dropdown-menu">
                            {/* Username display (clean, no button box) */}
                            <div className="header-dropdown-user">
                                <span className="header-dropdown-username">
                                    {username}
                                    {isGuest && <span className="guest-badge" style={{ marginLeft: '6px' }}>[Guest]</span>}
                                </span>
                            </div>

                            {isPrivate ? (
                                /* Option list for private chat */
                                <>
                                    {/* 1. View Profile (Only if not self / Saved Messages) */}
                                    {privateUser?.username?.toLowerCase() !== username?.toLowerCase() && (
                                        <button 
                                            className="header-dropdown-item" 
                                            onClick={() => {
                                                setShowDropdown(false);
                                                if (onUserProfileClick) onUserProfileClick(privateUser?.username || chatTitle);
                                            }}
                                        >
                                            <FiUser /> View Profile
                                        </button>
                                    )}

                                    <button 
                                        className="header-dropdown-item" 
                                        onClick={() => {
                                            setShowDropdown(false);
                                            onStartSelectionMode && onStartSelectionMode();
                                        }}
                                    >
                                        <FiCheckSquare /> Select messages
                                    </button>

                                    {/* 2. Dark Mode */}
                                    <button 
                                        className="header-dropdown-item" 
                                        onClick={(e) => {
                                            setShowDropdown(false);
                                            if (onThemeToggle) onThemeToggle(e);
                                        }}
                                    >
                                        <ThemeToggleIcon theme={theme} />
                                        {theme === "dark" ? "Light Mode" : "Dark Mode"}
                                    </button>



                                    {/* 4. Clear Chat (red) */}
                                    <button 
                                        className="header-dropdown-item logout" 
                                        onClick={() => {
                                            setShowDropdown(false);
                                            if (onClearChatClick) onClearChatClick();
                                        }}
                                    >
                                        <FiTrash2 /> Clear Chat
                                    </button>

                                    {/* 5. Block User (red, only if not guest) */}
                                    {!isGuest && (
                                        <button 
                                            className="header-dropdown-item logout" 
                                            onClick={() => {
                                                setShowDropdown(false);
                                                if (onToggleBlock) onToggleBlock();
                                            }}
                                        >
                                            <FiSlash /> {isBlocked ? "Unblock User" : "Block User"}
                                        </button>
                                    )}

                                    {/* 6. Sign Out (red) */}
                                    <button 
                                        className="header-dropdown-item logout" 
                                        onClick={() => {
                                            setShowDropdown(false);
                                            if (onLogout) onLogout();
                                        }}
                                    >
                                        {isGuest ? <FiLogIn /> : <FiLogOut />}
                                        {isGuest ? "Sign In" : "Logout"}
                                    </button>
                                </>
                            ) : (
                                /* Option list for group chat */
                                <>
                                    {/* 1. Group info */}
                                    <button 
                                        className="header-dropdown-item" 
                                        onClick={() => {
                                            setShowDropdown(false);
                                            if (onShowOnlineListClick) onShowOnlineListClick();
                                        }}
                                    >
                                        <FiUser /> Group Info
                                    </button>

                                    <button 
                                        className="header-dropdown-item" 
                                        onClick={() => {
                                            setShowDropdown(false);
                                            onStartSelectionMode && onStartSelectionMode();
                                        }}
                                    >
                                        <FiCheckSquare /> Select messages
                                    </button>

                                    {/* 2. Copy Code */}
                                    {roomDetails && roomDetails.isPrivate && (
                                        <button 
                                            className="header-dropdown-item" 
                                            onClick={(e) => {
                                                handleCopyCode(e);
                                                setTimeout(() => setShowDropdown(false), 800);
                                            }}
                                        >
                                            <FiCopy /> {copiedCode ? "Copied!" : "Copy Code"}
                                        </button>
                                    )}

                                    {/* 3. Dark Mode */}
                                    <button 
                                        className="header-dropdown-item" 
                                        onClick={(e) => {
                                            setShowDropdown(false);
                                            if (onThemeToggle) onThemeToggle(e);
                                        }}
                                    >
                                        <ThemeToggleIcon theme={theme} />
                                        {theme === "dark" ? "Light Mode" : "Dark Mode"}
                                    </button>



                                    {/* 5. Clear Chat (red) */}
                                    <button 
                                        className="header-dropdown-item logout" 
                                        onClick={() => {
                                            setShowDropdown(false);
                                            if (onClearChatClick) onClearChatClick();
                                        }}
                                    >
                                        <FiTrash2 /> Clear Chat
                                    </button>

                                    {/* 6. Leave Room (red) */}
                                    <button 
                                        className="header-dropdown-item logout" 
                                        onClick={() => {
                                            setShowDropdown(false);
                                            if (onLeaveRoom) onLeaveRoom();
                                        }}
                                    >
                                        <FiTrash2 /> {(!roomDetails || !roomDetails.isPrivate) ? "Delete Room" : (isRoomAdmin ? "Delete Room" : "Leave Room")}
                                    </button>

                                    {/* 7. Sign Out (red) */}
                                    <button 
                                        className="header-dropdown-item logout" 
                                        onClick={() => {
                                            setShowDropdown(false);
                                            if (onLogout) onLogout();
                                        }}
                                    >
                                        {isGuest ? <FiLogIn /> : <FiLogOut />}
                                        {isGuest ? "Sign In" : "Logout"}
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ChatHeader;

