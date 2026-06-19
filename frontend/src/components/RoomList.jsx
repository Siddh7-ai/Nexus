import React, { useState, useMemo } from "react";
import logo from "../assets/logo.png";
import { SmoothInput } from "./SmoothInput";
import { FiLock, FiPlus, FiHome, FiSend, FiSettings } from "react-icons/fi";

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
    unreadCounts,
    allUsers = [],
    dmConversations = [],
    customRooms = [],
    customRoomsLoading = false,
    onCreateRoomClick,
    activeSidebarTab = "rooms",
    setActiveSidebarTab
}) {
    const [dmSearch, setDmSearch] = useState("");

    const totalDmUnread = useMemo(() => {
        if (!unreadCounts) return 0;
        let count = 0;
        Object.keys(unreadCounts).forEach(key => {
            if (key.includes("_")) {
                count += unreadCounts[key] || 0;
            }
        });
        return count;
    }, [unreadCounts]);

    const filteredSearchUsers = useMemo(() => {
        if (!dmSearch.trim()) return [];
        const query = dmSearch.trim().toLowerCase();

        const matched = allUsers.filter(user => {
            if (user.username?.toLowerCase() === currentUser?.toLowerCase()) return false;
            const uName = (user.username || "").toLowerCase();
            const dName = (user.displayName || "").toLowerCase();
            return uName.includes(query) || dName.includes(query);
        });

        const existingUsernames = new Set(dmConversations.map(u => u.username?.toLowerCase()));
        const onlineUsernames = new Set(onlineUserList.map(u => u.username?.toLowerCase()));

        const group1 = [];
        const group2 = [];
        const group3 = [];

        matched.forEach(user => {
            const uLower = user.username?.toLowerCase();
            if (existingUsernames.has(uLower)) {
                const dmUser = dmConversations.find(u => u.username?.toLowerCase() === uLower);
                group1.push({
                    ...user,
                    status: dmUser?.status || "Offline",
                    isOnline: dmUser?.isOnline || false,
                    role: dmUser?.role
                });
            } else if (onlineUsernames.has(uLower)) {
                const onlineUser = onlineUserList.find(u => u.username?.toLowerCase() === uLower);
                group2.push({
                    ...user,
                    status: onlineUser?.status || "Online",
                    isOnline: true,
                    role: onlineUser?.role
                });
            } else {
                group3.push({
                    ...user,
                    status: "Offline",
                    isOnline: false
                });
            }
        });

        return [...group1, ...group2, ...group3];
    }, [dmSearch, allUsers, dmConversations, onlineUserList, currentUser]);

    return (
        <div style={{ display: 'flex', width: '100%', height: '100%' }}>
            {/* 1. Left narrow bar (Instagram-style) */}
            <div className="sidebar-narrow-nav">
                <div className="narrow-nav-top">
                    {/* Brand logo */}
                    <div className="narrow-nav-logo-box" onClick={() => setActiveSidebarTab("rooms")} title="Nexus Rooms">
                        <img src={logo} alt="Nexus Logo" className="narrow-nav-logo-img" />
                    </div>

                    {/* Nav stack */}
                    <div className="narrow-nav-items">
                        <button 
                            className={`narrow-nav-btn ${activeSidebarTab === "rooms" ? "active" : ""}`}
                            onClick={() => setActiveSidebarTab("rooms")}
                            title="Rooms"
                        >
                            <FiHome />
                        </button>

                        <button 
                            className={`narrow-nav-btn ${activeSidebarTab === "dms" ? "active" : ""}`}
                            onClick={() => setActiveSidebarTab("dms")}
                            title="Direct Messages"
                        >
                            <FiSend />
                            {totalDmUnread > 0 && (
                                <span className="narrow-nav-btn-unread">{totalDmUnread}</span>
                            )}
                        </button>

                        {!isGuest && (
                            <button 
                                className="narrow-nav-btn"
                                onClick={onCreateRoomClick}
                                title="Create/Join Private Room"
                            >
                                <FiPlus />
                            </button>
                        )}
                    </div>
                </div>

                <div className="narrow-nav-bottom">
                    {/* User profile avatar settings */}
                    <div 
                        className={`narrow-avatar-wrapper ${activeSidebarTab === "profile" ? "active" : ""}`}
                        onClick={onProfileClick}
                        title="Profile Settings"
                    >
                        <div className="narrow-avatar-border">
                            <Avatar 
                                username={currentUser || "U"} 
                                avatarSrc={currentUserProfile?.avatar} 
                                size={32} 
                                darkVariant={true}
                            />
                        </div>
                        <span className="narrow-nav-status-dot" />
                    </div>

                    <button 
                        className="narrow-nav-btn"
                        onClick={() => alert("Settings feature coming soon!")}
                        title="Settings"
                    >
                        <FiSettings />
                    </button>
                </div>
            </div>

            {/* 2. Right active list panel */}
            <div className="sidebar-active-panel">
                {activeSidebarTab === "rooms" ? (
                    <>
                        <div className="panel-header-section">
                            <h3 className="panel-header-title">Rooms</h3>
                        </div>
                        <div className="panel-content-scroll">
                            {/* Grid of rooms (public) */}
                            <div className="grid-rooms-container" style={{ marginBottom: "18px" }}>
                                {ROOMS.map(room => {
                                    const isActive = activeRoom === room && !activePrivate;
                                    const unread = unreadCounts && unreadCounts[room] ? unreadCounts[room] : 0;
                                    const isLocked = isGuest && room !== "General chat";
                                    
                                    return (
                                        <div 
                                            key={room} 
                                            className={`room-grid-card ${isActive ? "active" : ""} ${isLocked ? "locked-room" : ""}`}
                                            onClick={() => !isLocked && onSelectRoom(room)}
                                            title={isLocked ? "Login required" : undefined}
                                            style={isActive ? { border: '1.5px solid var(--accent)', boxShadow: '0 0 10px rgba(18, 199, 189, 0.15)' } : undefined}
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
                                                {unread > 0 ? `${unread} unread` : "No unread"}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Private rooms section */}
                            <div className="sidebar-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Your Rooms</span>
                                {!isGuest && (
                                    <button 
                                        className="create-room-btn-plus" 
                                        onClick={onCreateRoomClick} 
                                        title="Create or Join a Room"
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: 'var(--muted)',
                                            cursor: 'pointer',
                                            padding: '4px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            borderRadius: '50%',
                                            transition: 'color 0.2s, background-color 0.2s'
                                        }}
                                    >
                                        <FiPlus size={18} />
                                    </button>
                                )}
                            </div>

                            <div className="grid-rooms-container" style={{ marginBottom: "18px" }}>
                                {customRoomsLoading ? (
                                    Array.from({ length: 3 }).map((_, idx) => (
                                        <div key={`shimmer-${idx}`} className="room-grid-card shimmer-card" style={{ height: '78px', pointerEvents: 'none', opacity: 0.5 }}>
                                            <div className="shimmer-line" style={{ width: '40px', height: '20px', borderRadius: '4px', background: 'rgba(0,0,0,0.1)', marginBottom: '8px' }} />
                                            <div className="shimmer-line" style={{ width: '80%', height: '14px', borderRadius: '4px', background: 'rgba(0,0,0,0.06)', marginBottom: '4px' }} />
                                            <div className="shimmer-line" style={{ width: '50%', height: '10px', borderRadius: '4px', background: 'rgba(0,0,0,0.04)' }} />
                                        </div>
                                    ))
                                ) : customRooms.length === 0 ? (
                                    <div style={{ gridColumn: 'span 2', textAlign: 'center', padding: '16px 8px', fontSize: '11px', color: 'var(--muted)', fontWeight: '500' }}>
                                        No private rooms yet.<br/>Click + to create/join one!
                                    </div>
                                ) : (
                                    customRooms.map(room => {
                                        const isActive = activeRoom === room.name && !activePrivate;
                                        const unread = unreadCounts && unreadCounts[room.name] ? unreadCounts[room.name] : 0;
                                        
                                        return (
                                            <div 
                                                key={room.code} 
                                                className={`room-grid-card ${isActive ? "active" : ""}`}
                                                onClick={() => onSelectRoom(room.name)}
                                                style={isActive ? { border: '1.5px solid var(--accent)', boxShadow: '0 0 10px rgba(18, 199, 189, 0.15)' } : undefined}
                                            >
                                                <div className="grid-card-top">
                                                    {room.avatar ? (
                                                        <img 
                                                            src={room.avatar} 
                                                            alt={room.name} 
                                                            style={{ width: '32px', height: '32px', borderRadius: '8px', objectFit: 'cover' }} 
                                                        />
                                                    ) : (
                                                        <div className="grid-card-icon-box">
                                                            <span className="grid-card-emoji-icon">🔒</span>
                                                        </div>
                                                    )}
                                                    {unread > 0 ? (
                                                        <span className="grid-unread-badge">{unread}</span>
                                                    ) : null}
                                                </div>
                                                <span className="grid-card-title">{room.name}</span>
                                                <span className="grid-card-unread-text" style={{ fontSize: '10px' }}>
                                                    {unread > 0 ? `${unread} unread` : `Code: ${room.code}`}
                                                </span>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="panel-header-section">
                            <h3 className="panel-header-title">Direct Messages</h3>
                            {!isGuest && (
                                <div className="panel-search-box" style={{ position: 'relative' }}>
                                    <SmoothInput
                                        type="text"
                                        placeholder="Search your chat..."
                                        value={dmSearch}
                                        onChange={(e) => setDmSearch(e.target.value)}
                                        className="dm-search-input"
                                    />
                                    {dmSearch && (
                                        <button className="dm-search-clear" onClick={() => setDmSearch("")} style={{ position: 'absolute', top: '14px', right: '10px', border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '16px' }}>×</button>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="panel-content-scroll" style={{ padding: '8px 16px' }}>
                            <div className="dm-list-container" style={{ height: '100%', overflowY: 'visible' }}>
                                {dmSearch.trim() ? (
                                    filteredSearchUsers.length === 0 ? (
                                        <div className="sidebar-empty-state">No users found. Try another search term.</div>
                                    ) : (
                                        filteredSearchUsers.map(user => {
                                            const privateChatId = [currentUser.toLowerCase(), user.username.toLowerCase()].sort().join("_");
                                            const isLocked = isGuest;
                                            const unreadKey = unreadCounts ? Object.keys(unreadCounts).find(k => k.toLowerCase() === privateChatId.toLowerCase()) : null;
                                            const unread = unreadKey ? unreadCounts[unreadKey] : 0;
                                            
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
                                    )
                                ) : (
                                    dmConversations.length === 0 ? (
                                        <div className="sidebar-empty-state">No direct messages yet. Search for a user to start chatting.</div>
                                    ) : (
                                        dmConversations.map(user => {
                                            const privateChatId = [currentUser.toLowerCase(), user.username.toLowerCase()].sort().join("_");
                                            const isLocked = isGuest;
                                            const unreadKey = unreadCounts ? Object.keys(unreadCounts).find(k => k.toLowerCase() === privateChatId.toLowerCase()) : null;
                                            const unread = unreadKey ? unreadCounts[unreadKey] : 0;
                                            
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
                                    )
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default RoomList;
