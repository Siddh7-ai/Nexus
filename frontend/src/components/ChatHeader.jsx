import { FiSun, FiMoon } from "react-icons/fi";

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

function ChatHeader({ username, onLogout, chatTitle, onMenuToggle, onlineUsers, isGuest, onClearChatClick, theme, onThemeToggle, isPrivate, privateUser, onUserProfileClick }) {
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
                <button className="theme-toggle-btn" onClick={onThemeToggle} aria-label="Toggle theme" style={{ marginRight: '8px' }}>
                    {theme === "dark" ? <FiSun /> : <FiMoon />}
                </button>
                {isGuest && <span className="guest-badge-header">Guest Mode</span>}
                {username && <span className="active-room-label">{username}{isGuest && <span className="guest-badge">[Guest]</span>}</span>}
                <button className="clear-chat-btn" onClick={onClearChatClick} title="Clear conversation for you">
                    Clear Chat
                </button>
                <button className="logout-btn" onClick={onLogout}>
                    {isGuest ? "Sign In" : "Logout"}
                </button>
            </div>
        </div>
    );
}

export default ChatHeader;
