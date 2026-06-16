import { useState, useEffect, useRef } from "react";
import { FiSun, FiMoon, FiMoreVertical, FiUser, FiSlash, FiTrash2, FiLogOut, FiLogIn } from "react-icons/fi";

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
    onlineUsers, 
    isGuest, 
    onClearChatClick, 
    theme, 
    onThemeToggle, 
    isPrivate, 
    privateUser, 
    onUserProfileClick,
    onShowOnlineListClick,
    isBlocked,
    onToggleBlock
}) {
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef(null);

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

    return (
        <div className="chat-header">
            <div className="chat-header-left">
                <button className="menu-toggle-btn" onClick={onMenuToggle} aria-label="Toggle sidebar">
                    Menu
                </button>

                <div>
                    {isPrivate ? (
                        <div 
                            className="chat-header-profile-trigger"
                            onClick={() => onUserProfileClick && onUserProfileClick(privateUser?.username || chatTitle)}
                            style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                            title="View Profile"
                        >
                            <Avatar username={privateUser?.username || chatTitle} avatarSrc={privateUser?.avatar} size={36} className="header-avatar" />
                            <div className="chat-title">{privateUser?.displayName || privateUser?.username || chatTitle}</div>
                        </div>
                    ) : (
                        <div className="chat-title">{chatTitle || "# General chat"}</div>
                    )}
                </div>
            </div>

            <div className="chat-header-right">
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

                            {/* 4. Theme Toggle */}
                            <button 
                                className="header-dropdown-item" 
                                onClick={() => {
                                    setShowDropdown(false);
                                    if (onThemeToggle) onThemeToggle();
                                }}
                            >
                                {theme === "dark" ? <FiSun /> : <FiMoon />}
                                {theme === "dark" ? "Light Mode" : "Dark Mode"}
                            </button>

                            {/* 5. Clear Chat */}
                            <button 
                                className="header-dropdown-item" 
                                onClick={() => {
                                    setShowDropdown(false);
                                    if (onClearChatClick) onClearChatClick();
                                }}
                            >
                                <FiTrash2 /> Clear Chat
                            </button>

                            {/* 6. Logout / Sign In */}
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

