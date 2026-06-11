import logo from "../assets/logo.png";
import { FiLock, FiEdit2, FiMessageSquare } from "react-icons/fi";

const ROOMS = ["General chat", "Project chat", "Study chat"];
const ROOM_ICONS = {
    "General chat": "💭",
    "Project chat": "🚀",
    "Study chat": "📝"
};

function Avatar({ username, avatarSrc, size = 28, className = "", darkVariant = false }) {
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
    const colors = darkVariant ? ["#121212"] : ["#bff7f2", "#c8eeff", "#d8f7cf", "#ffe1b8", "#e7dcff"];
    let colorIndex = 0;
    if (!darkVariant) {
        for (let i = 0; i < username.length; i++) {
            colorIndex += username.charCodeAt(i);
        }
    }
    const color = colors[colorIndex % colors.length];

    return (
        <div 
            className={`avatar ${className}`} 
            style={{ 
                backgroundColor: color, 
                color: darkVariant ? "#ffffff" : "#23303d", 
                width: size, 
                height: size, 
                fontSize: size * 0.42,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%'
            }}
        >
            {username.charAt(0).toUpperCase()}
        </div>
    );
}

function RoomList({ 
    activeRoom, 
    activePrivate, 
    onSelectRoom, 
    onSelectPrivate, 
    onlineUserList, 
    currentUser, 
    currentUserProfile, 
    isGuest, 
    onProfileClick, 
    onUserProfileClick, 
    unreadCounts 
}) {
    const otherUsers = onlineUserList.filter(u => u.username?.toLowerCase() !== currentUser?.toLowerCase());
    
    // Determine the active room at the top (default to "General chat" if none or if viewing direct messages)
    const activeRoomName = activeRoom && !activePrivate ? activeRoom : null;
    const topRoomName = activeRoomName || "General chat";
    const isTopRoomActive = !!activeRoomName;
    const gridRooms = ROOMS.filter(r => r !== topRoomName);

    // Active Members slice for stacks
    const activeMembers = otherUsers;
    const visibleMembers = activeMembers.slice(0, 3);
    const remainingCount = activeMembers.length - visibleMembers.length;

    return (
        <div className="room-sidebar">
            {/* Brand Header */}
            <div className="brand-header">
                <div className="brand-left">
                    <div className="brand-logo-box">
                        <img src={logo} alt="Nexus logo" className="brand-logo-img" />
                    </div>
                    <span className="brand-name">Nexus</span>
                </div>
                <span className="rooms-pill">3 rooms</span>
            </div>

            {/* Current User Card */}
            <div className="user-profile-card" onClick={onProfileClick} title="Profile Settings">
                <div className="user-card-info">
                    <Avatar 
                        username={currentUser || "U"} 
                        avatarSrc={currentUserProfile?.avatar} 
                        size={36} 
                        className="user-card-avatar" 
                        darkVariant={true}
                    />
                    <span className="user-card-name">
                        {currentUserProfile?.displayName || currentUser || "User"}
                        {isGuest && <span className="guest-badge-inline">[Guest]</span>}
                    </span>
                </div>
                <FiEdit2 className="user-card-edit-icon" />
            </div>

            {/* YOUR ROOMS Section */}
            <div className="sidebar-section-label">Your Rooms</div>

            {/* Top Active/Primary Room Card */}
            <div 
                className={`active-room-card ${isTopRoomActive ? "active" : "inactive"}`}
                onClick={() => onSelectRoom(topRoomName)}
            >
                <div className="active-room-header">
                    <div className="active-room-icon-box">
                        <FiMessageSquare className="active-room-icon" />
                    </div>
                    <span className="active-room-title">{topRoomName}</span>
                </div>
                <div className="active-room-status">
                    Active now · {onlineUserList.length} {onlineUserList.length === 1 ? "member" : "members"} online
                </div>
                {activeMembers.length > 0 && (
                    <div className="avatar-stack">
                        {visibleMembers.map((member, idx) => (
                            <Avatar 
                                key={member.username} 
                                username={member.username} 
                                avatarSrc={member.avatar} 
                                size={22} 
                                className="stack-avatar" 
                                style={{ zIndex: 10 - idx }} 
                            />
                        ))}
                        {remainingCount > 0 && (
                            <div className="stack-avatar stack-remaining" style={{ zIndex: 1 }}>
                                +{remainingCount}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Inactive Rooms Grid */}
            <div className="grid-rooms-container">
                {gridRooms.map(room => {
                    const unread = unreadCounts && unreadCounts[room] ? unreadCounts[room] : 0;
                    const isLocked = isGuest && room !== "General chat";
                    
                    const roomOnline = otherUsers;
                    const visibleRoomOnline = roomOnline.slice(0, 2);
                    const remainingRoomOnline = roomOnline.length - visibleRoomOnline.length;

                    return (
                        <div 
                            key={room} 
                            className={`room-grid-card ${isLocked ? "locked-room" : ""}`}
                            onClick={() => !isLocked && onSelectRoom(room)}
                            title={isLocked ? "Login required" : undefined}
                        >
                            <div className="grid-card-top">
                                <div className="grid-card-icon-box">
                                    <span className="grid-card-emoji-icon">{ROOM_ICONS[room]}</span>
                                </div>
                                {isLocked ? (
                                    <FiLock className="grid-lock-icon" />
                                ) : unread > 0 ? (
                                    <span className="grid-unread-badge">{unread}</span>
                                ) : null}
                            </div>
                            <span className="grid-card-title">{room.replace(" chat", "")}</span>
                            <span className="grid-card-unread-text">
                                {unread > 0 ? `${unread} unread msg` : "No unread msg"}
                            </span>
                            {roomOnline.length > 0 && (
                                <div className="avatar-stack">
                                    {visibleRoomOnline.map((member, idx) => (
                                        <Avatar 
                                            key={member.username} 
                                            username={member.username} 
                                            avatarSrc={member.avatar} 
                                            size={18} 
                                            className="stack-avatar" 
                                            style={{ zIndex: 10 - idx }} 
                                        />
                                    ))}
                                    {remainingRoomOnline > 0 && (
                                        <div className="stack-avatar stack-remaining" style={{ zIndex: 1, width: 18, height: 18, fontSize: 8 }}>
                                            +{remainingRoomOnline}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* DIRECT Section */}
            <div className="sidebar-section-label direct-label">Direct</div>

            <div className="dm-list-container">
                {otherUsers.length === 0 ? (
                    <div className="room-empty">No users online</div>
                ) : (
                    otherUsers.map(user => {
                        const privateChatId = [currentUser.toLowerCase(), user.username.toLowerCase()].sort().join("_");
                        const isLocked = isGuest;
                        const unread = unreadCounts && unreadCounts[privateChatId] ? unreadCounts[privateChatId] : 0;
                        
                        return (
                            <div 
                                key={user.username}
                                className={`dm-row-card ${activePrivate === privateChatId ? "active" : ""} ${isLocked ? "locked-room" : ""}`}
                                onClick={() => !isLocked && onSelectPrivate(privateChatId, user.username)}
                                title={isLocked ? "Login required" : undefined}
                            >
                                <div className="dm-row-left">
                                    <div 
                                        className="dm-avatar-wrapper"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onUserProfileClick(user.username);
                                        }}
                                        title="View Profile"
                                    >
                                        <Avatar 
                                            username={user.username} 
                                            avatarSrc={user.avatar} 
                                            size={32} 
                                            className="dm-row-avatar" 
                                        />
                                        <span className={`dm-status-dot ${
                                            user.role === "guest" ? "guest-dot" :
                                            user.status === "Online" ? "" :
                                            user.status === "Away" ? "away" :
                                            user.status === "Busy" ? "busy" : "offline"
                                        }`} />
                                    </div>
                                    <span className="dm-row-name">
                                        {user.displayName || user.username}
                                        {user.role === "guest" && <span className="guest-badge-pill">GUEST</span>}
                                    </span>
                                </div>
                                <div className="dm-row-right">
                                    {isLocked ? (
                                        <FiLock className="dm-lock-icon" />
                                    ) : unread > 0 ? (
                                        <span className="dm-unread-badge">{unread}</span>
                                    ) : (
                                        <span className="dm-pill">DM</span>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

export default RoomList;
