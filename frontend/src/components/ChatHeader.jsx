import { useState, useEffect, useRef } from "react";
import { FiSun, FiMoon, FiMoreVertical, FiUser, FiSlash, FiTrash2, FiLogOut, FiLogIn, FiCopy, FiShare2, FiSettings, FiMenu, FiChevronLeft } from "react-icons/fi";
import OnlineUsers from "./OnlineUsers";
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
    onEditRoomClick
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
                        <div 
                            className="chat-header-profile-trigger"
                            onClick={() => onUserProfileClick && onUserProfileClick(privateUser?.username || chatTitle)}
                            style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', minWidth: 0 }}
                            title="View Profile"
                        >
                            <Avatar username={privateUser?.username || chatTitle} avatarSrc={privateUser?.avatar} size={36} className="header-avatar" />
                            <div className="chat-title">{privateUser?.displayName || privateUser?.username || chatTitle}</div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                {roomDetails && roomDetails.isPrivate && (
                                    <Avatar 
                                        username={roomDetails.name} 
                                        avatarSrc={roomDetails.avatar} 
                                        size={36} 
                                        className="header-avatar" 
                                    />
                                )}
                                <div className="chat-title">{chatTitle || "# General chat"}</div>
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
                            {/* 1. Username display (clean, no button box) */}
                            <div className="header-dropdown-user">
                                <span className="header-dropdown-username">
                                    {username}
                                    {isGuest && <span className="guest-badge" style={{ marginLeft: '6px' }}>[Guest]</span>}
                                </span>
                            </div>

                            {/* 2. View Profile */}
                            <button 
                                className="header-dropdown-item" 
                                onClick={() => {
                                    setShowDropdown(false);
                                    if (isPrivate) {
                                        if (onUserProfileClick) onUserProfileClick(privateUser?.username || chatTitle);
                                    } else {
                                        if (onShowOnlineListClick) onShowOnlineListClick();
                                    }
                                }}
                            >
                                <FiUser /> View Profile
                            </button>

                            {/* Copy Room Code & Link (only for custom private rooms) */}
                            {roomDetails && roomDetails.isPrivate && (
                                <>
                                    <button 
                                        className="header-dropdown-item" 
                                        onClick={(e) => {
                                            handleCopyCode(e);
                                            setTimeout(() => setShowDropdown(false), 800);
                                        }}
                                    >
                                        <FiCopy /> {copiedCode ? "Copied!" : "Copy Code"}
                                    </button>
                                    <button 
                                        className="header-dropdown-item" 
                                        onClick={(e) => {
                                            handleCopyLink(e);
                                            setTimeout(() => setShowDropdown(false), 800);
                                        }}
                                    >
                                        <FiShare2 /> {copiedLink ? "Copied Link!" : "Copy Link"}
                                    </button>
                                </>
                            )}

                            {/* 3. Block/Unblock (only in private chat and if not guest) */}
                            {isPrivate && !isGuest && (
                                <button 
                                    className="header-dropdown-item" 
                                    onClick={() => {
                                        setShowDropdown(false);
                                        if (onToggleBlock) onToggleBlock();
                                    }}
                                >
                                    <FiSlash /> {isBlocked ? "Unblock User" : "Block User"}
                                </button>
                            )}

                            {/* Edit Room Details (only for admin) */}
                            {roomDetails && roomDetails.isPrivate && isRoomAdmin && (
                                <button 
                                    className="header-dropdown-item" 
                                    onClick={() => {
                                        setShowDropdown(false);
                                        if (onEditRoomClick) onEditRoomClick();
                                    }}
                                >
                                    <FiSettings /> Edit Room
                                </button>
                            )}

                            {/* 4. Leave / Delete Custom Private Room */}
                            {roomDetails && roomDetails.isPrivate && (
                                <button 
                                    className="header-dropdown-item logout" 
                                    onClick={() => {
                                        setShowDropdown(false);
                                        if (onLeaveRoom) onLeaveRoom();
                                    }}
                                >
                                    <FiTrash2 /> {isRoomAdmin ? "Delete Room" : "Leave Room"}
                                </button>
                            )}

                            {/* Delete System Room */}
                            {!isPrivate && (!roomDetails || !roomDetails.isPrivate) && (
                                <button 
                                    className="header-dropdown-item logout" 
                                    onClick={() => {
                                        setShowDropdown(false);
                                        if (onLeaveRoom) onLeaveRoom();
                                    }}
                                >
                                    <FiTrash2 /> Delete Room
                                </button>
                            )}

                             {/* Theme Brightness Slider */}
                            <div className="header-dropdown-brightness">
                                <span className="brightness-label">
                                    <FiSun /> Brightness: {brightness}%
                                </span>
                                <div className="brightness-slider-container">
                                    <input 
                                        type="range" 
                                        min="40" 
                                        max="130" 
                                        value={brightness} 
                                        onChange={(e) => handleBrightnessChange(e.target.value)}
                                        className="brightness-slider"
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                </div>
                            </div>

                            {/* 5. Theme Toggle */}
                            <button 
                                className="header-dropdown-item" 
                                onClick={() => {
                                    setShowDropdown(false);
                                    if (onThemeToggle) onThemeToggle();
                                }}
                            >
                                <ThemeToggleIcon theme={theme} />
                                {theme === "dark" ? "Light Mode" : "Dark Mode"}
                            </button>


                            {/* 6. Clear Chat */}
                            <button 
                                className="header-dropdown-item" 
                                onClick={() => {
                                    setShowDropdown(false);
                                    if (onClearChatClick) onClearChatClick();
                                }}
                            >
                                <FiTrash2 /> Clear Chat
                            </button>

                            {/* 7. Logout / Sign In */}
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
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ChatHeader;

