import { FiSun, FiMoon } from "react-icons/fi";

function ChatHeader({ username, onLogout, chatTitle, onMenuToggle, onlineUsers, isGuest, onClearChatClick, theme, onThemeToggle }) {
    const onlineLabel = `${onlineUsers} ${onlineUsers === 1 ? "user" : "users"} online`;

    return (
        <div className="chat-header">
            <div className="chat-header-left">
                <button className="menu-toggle-btn" onClick={onMenuToggle} aria-label="Toggle sidebar">
                    Menu
                </button>

                <div>
                    <div className="chat-title">{chatTitle || "# General chat"}</div>
                    <div className="welcome-text">{onlineLabel}</div>
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
