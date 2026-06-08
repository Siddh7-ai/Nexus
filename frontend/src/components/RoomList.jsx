import logo from "../assets/logo.png";
import { FiLock, FiEdit2 } from "react-icons/fi";

const ROOMS = ["General chat", "Project chat", "Study chat"];
const ROOM_ICONS = {
    "General chat": "💭",
    "Project chat": "🚀",
    "Study chat": "📝"
};

function Avatar({ username, avatarSrc, size = 28, className = "" }) {
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

function RoomList({ activeRoom, activePrivate, onSelectRoom, onSelectPrivate, onlineUserList, currentUser, currentUserProfile, isGuest, onProfileClick, onUserProfileClick }) {
    const otherUsers = onlineUserList.filter(u => u.username !== currentUser);
    const isCurrentUserOnline = onlineUserList.some(u => u.username === currentUser);

    return (
        <div className="room-sidebar">
            <div className="sidebar-brand">
                <img src={logo} alt="Nexus logo" className="sidebar-logo" />
                <div>
                    <div className="sidebar-title">Nexus</div>
                    <div className="sidebar-subtitle">Messenger</div>
                </div>
            </div>

            <div
                className="sidebar-user clickable-guest-profile"
                onClick={onProfileClick}
                title="Profile Settings"
            >
                <Avatar 
                    username={currentUser || "U"} 
                    avatarSrc={currentUserProfile?.avatar} 
                    size={34} 
                    className="sidebar-avatar" 
                />
                <div className="sidebar-user-copy">
                    <span>
                        {currentUserProfile?.displayName || currentUser || "User"}
                        {isGuest && <span className="guest-badge">[Guest]</span>}
                    </span>
                    <small>
                        {isGuest 
                            ? "Guest Mode (Click to edit)" 
                            : (currentUserProfile?.status || "Online")}
                    </small>
                </div>
                <FiEdit2 className="sidebar-edit-icon" />
                <span className={`sidebar-online-dot ${
                    isGuest ? (isCurrentUserOnline ? "guest-dot" : "muted") :
                    currentUserProfile?.status === "Online" ? "" :
                    currentUserProfile?.status === "Away" ? "away" :
                    currentUserProfile?.status === "Busy" ? "busy" : "offline"
                }`} />
            </div>

            <div className="room-section-label">Rooms</div>
            {ROOMS.map(room => {
                const isLocked = isGuest && room !== "General chat";
                return (
                    <button
                        key={room}
                        className={`room-item ${activeRoom === room && !activePrivate ? "active" : ""} ${isLocked ? "locked-room" : ""}`}
                        onClick={() => onSelectRoom(room)}
                        title={isLocked ? "Login required" : undefined}
                    >
                        <span className="room-icon">{ROOM_ICONS[room]}</span>
                        <span className="room-name">{room}</span>
                        {isLocked && <FiLock className="sidebar-lock-icon" />}
                    </button>
                );
            })}

            <div className="room-section-label direct-label">Direct</div>

            {otherUsers.length === 0 && (
                <div className="room-empty">No users online</div>
            )}

            {otherUsers.map(user => {
                const privateChatId = [currentUser, user.username].sort().join("_");
                const isLocked = isGuest;
                return (
                    <div
                        key={user.username}
                        className={`room-item room-item-direct ${activePrivate === privateChatId ? "active" : ""} ${isLocked ? "locked-room" : ""}`}
                        onClick={() => onSelectPrivate(privateChatId, user.username)}
                        title={isLocked ? "Login required" : undefined}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px', cursor: 'pointer' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                            <div 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onUserProfileClick(user.username);
                                }}
                                style={{ display: 'flex', position: 'relative', cursor: 'pointer' }}
                                title="View Profile"
                            >
                                <Avatar username={user.username} avatarSrc={user.avatar} size={26} />
                                <span className={`sidebar-online-dot ${
                                    user.role === "guest" ? "guest-dot" :
                                    user.status === "Online" ? "" :
                                    user.status === "Away" ? "away" :
                                    user.status === "Busy" ? "busy" : "offline"
                                }`} style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '8px', height: '8px', border: '1px solid var(--sidebar)' }} />
                            </div>
                            <span className="room-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {user.displayName || user.username}
                                {user.role === "guest" && <span className="guest-badge">[Guest]</span>}
                            </span>
                        </div>
                        {isLocked ? (
                            <FiLock className="sidebar-lock-icon dm-lock" />
                        ) : (
                            <span className="dm-badge">DM</span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export default RoomList;
