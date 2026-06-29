import React, { useState, useMemo } from "react";
import logo from "../assets/logo.png";
import savedMessagesLogo from "../assets/saved_messages.png";
import { SmoothInput } from "./SmoothInput";
import { FiLock, FiPlus, FiHome, FiSend, FiSettings, FiMessageSquare, FiUsers, FiActivity, FiLogOut } from "react-icons/fi";

const VerifiedRoomBadge = ({ size = 13, style = {} }) => (
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


const ROOMS = ["Nexus Official"];
const ROOM_ICONS = {
    "Nexus Official": "🌐"
};



function formatTimeAgo(date) {
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
}

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
    activeSidebarTab = "messages",
    setActiveSidebarTab,
    pendingRequestsCount = 0,
    deletedSystemRooms = [],
    onLogoClick,
    onLogout
}) {
    const [dmSearch, setDmSearch] = useState("");

    const savedMessagesTitle = "Your Messages";
    const showSavedMessages = !isGuest && currentUser && (!dmSearch || savedMessagesTitle.toLowerCase().includes(dmSearch.toLowerCase()));

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
                    <div 
                        className="narrow-nav-logo-box" 
                        onClick={() => {
                            setActiveSidebarTab("messages");
                            if (onLogoClick) onLogoClick();
                        }} 
                        title="Nexus Messages"
                    >
                        <img src={logo} alt="Nexus Logo" className="narrow-nav-logo-img" />
                    </div>

                    {/* Nav stack */}
                    <div className="narrow-nav-items">
                        <button 
                            className={`narrow-nav-btn ${activeSidebarTab === "messages" ? "active" : ""}`}
                            onClick={() => setActiveSidebarTab("messages")}
                            title="Messages"
                        >
                            <FiMessageSquare />
                            {totalDmUnread > 0 && (
                                <span className="narrow-nav-btn-unread">{totalDmUnread}</span>
                            )}
                        </button>

                        <button 
                            className={`narrow-nav-btn ${activeSidebarTab === "rooms" ? "active" : ""}`}
                            onClick={() => setActiveSidebarTab("rooms")}
                            title="Rooms Only"
                        >
                            <FiUsers />
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
                        style={{ position: 'relative' }}
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
                        {pendingRequestsCount > 0 && (
                            <span 
                                className="narrow-nav-btn-unread" 
                                style={{ 
                                    background: '#ef4444', 
                                    top: '-4px', 
                                    right: '-4px', 
                                    zIndex: 12,
                                    position: 'absolute',
                                    fontSize: '9px',
                                    minWidth: '14px',
                                    height: '14px',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#fff',
                                    fontWeight: '800'
                                }}
                            >
                                {pendingRequestsCount}
                            </span>
                        )}
                    </div>

                    <button 
                        className="narrow-nav-btn"
                        onClick={() => alert("Settings feature coming soon!")}
                        title="Settings"
                    >
                        <FiSettings />
                    </button>

                    {onLogout && (
                        <button 
                            className="narrow-nav-btn logout-btn"
                            onClick={onLogout}
                            title="Log Out"
                            style={{ color: '#f87171' }}
                        >
                            <FiLogOut />
                        </button>
                    )}
                </div>
            </div>

            {/* 2. Right active list panel */}
            <div className="sidebar-active-panel">
                {activeSidebarTab === "messages" ? (
                    <>
                        <div className="panel-header-section">
                            <h3 className="panel-header-title">Direct Messages</h3>
                            <div className="panel-search-box">
                                <div style={{ position: 'relative', width: '100%' }}>
                                    <SmoothInput
                                        type="text"
                                        placeholder="Search chats or users..."
                                        value={dmSearch}
                                        onChange={(e) => setDmSearch(e.target.value)}
                                        className="dm-search-input"
                                    />
                                    {dmSearch && (
                                        <button className="dm-search-clear" onClick={() => setDmSearch("")}>×</button>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="panel-content-scroll" style={{ padding: '8px 16px' }}>
                            <div className="dm-list-container" style={{ height: '100%', overflowY: 'visible' }}>
                                
                                {/* Private chats Section */}
                                <div className="sidebar-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <span>Private chats</span>
                                </div>
                                <div className="unified-dms-list" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {showSavedMessages && (() => {
                                        const privateChatId = `${currentUser.toLowerCase()}_${currentUser.toLowerCase()}`;
                                        const isActive = activePrivate === privateChatId;
                                        const unread = unreadCounts && unreadCounts[privateChatId] ? unreadCounts[privateChatId] : 0;
                                        return (
                                            <div 
                                                key="saved_messages_chat"
                                                className={`dm-row-card ${isActive ? "active" : ""}`}
                                                onClick={() => onSelectPrivate(privateChatId, currentUser)}
                                                style={{ padding: '10px 12px', borderRadius: '10px' }}
                                            >
                                                <div className="dm-row-left">
                                                    <div className="dm-avatar-wrapper">
                                                        <img 
                                                            src={savedMessagesLogo} 
                                                            alt="Your Messages" 
                                                            className="dm-row-avatar" 
                                                            style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
                                                        />
                                                    </div>
                                                    <span className="dm-row-name">
                                                        {savedMessagesTitle}
                                                    </span>
                                                </div>
                                                <div className="dm-row-right">
                                                    {unread > 0 && (
                                                        <span className="dm-unread-badge">{unread}</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                    {dmSearch.trim() ? (
                                        filteredSearchUsers.length === 0 ? (
                                            <div className="sidebar-empty-state">No users found.</div>
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
                                                        style={{ padding: '10px 12px', borderRadius: '10px' }}
                                                    >
                                                        <div className="dm-row-left">
                                                            <div 
                                                                className="dm-avatar-wrapper"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onUserProfileClick(user.username);
                                                                }}
                                                            >
                                                                <Avatar 
                                                                    username={user.username} 
                                                                    avatarSrc={user.avatar} 
                                                                    size={28} 
                                                                    className="dm-row-avatar" 
                                                                />
                                                                <span className={`dm-status-dot ${
                                                                    user.role === "guest" ? "guest-dot" :
                                                                    user.status === "Online" ? "" :
                                                                    user.status === "Away" ? "away" :
                                                                    user.status === "Busy" ? "busy" : "offline"
                                                                }`} />
                                                            </div>
                                                            <span className="dm-row-name" style={{ fontSize: '13px' }}>
                                                                {user.displayName || user.username}
                                                            </span>
                                                        </div>
                                                        <div className="dm-row-right">
                                                            {isLocked ? (
                                                                <FiLock className="dm-lock-icon" />
                                                            ) : unread > 0 ? (
                                                                <span className="dm-unread-badge">{unread}</span>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )
                                    ) : (
                                        dmConversations.length === 0 && !showSavedMessages ? (
                                            <div className="sidebar-empty-state" style={{ fontSize: '11px' }}>No private chats yet.</div>
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
                                                        style={{ padding: '10px 12px', borderRadius: '10px' }}
                                                    >
                                                        <div className="dm-row-left">
                                                            <div 
                                                                className="dm-avatar-wrapper"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onUserProfileClick(user.username);
                                                                }}
                                                            >
                                                                <Avatar 
                                                                    username={user.username} 
                                                                    avatarSrc={user.avatar} 
                                                                    size={28} 
                                                                    className="dm-row-avatar" 
                                                                />
                                                                <span className={`dm-status-dot ${
                                                                    user.role === "guest" ? "guest-dot" :
                                                                    user.status === "Online" ? "" :
                                                                    user.status === "Away" ? "away" :
                                                                    user.status === "Busy" ? "busy" : "offline"
                                                                }`} />
                                                            </div>
                                                            <span className="dm-row-name" style={{ fontSize: '13px' }}>
                                                                {user.displayName || user.username}
                                                            </span>
                                                        </div>
                                                        <div className="dm-row-right">
                                                            {isLocked ? (
                                                                <FiLock className="dm-lock-icon" />
                                                            ) : unread > 0 ? (
                                                                <span className="dm-unread-badge">{unread}</span>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                ) : activeSidebarTab === "rooms" ? (
                    <>
                        <div className="panel-header-section">
                            <h3 className="panel-header-title">Rooms</h3>
                        </div>
                        <div className="panel-content-scroll" style={{ padding: '8px 16px' }}>
                            {/* Public Rooms Section */}
                            <div className="sidebar-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span>Public Rooms</span>
                            </div>
                            <div className="unified-rooms-list" style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '20px' }}>
                                {ROOMS.filter(room => !deletedSystemRooms.includes(room)).map(room => {
                                    const isActive = activeRoom === room && !activePrivate;
                                    const unread = unreadCounts && unreadCounts[room] ? unreadCounts[room] : 0;
                                    const isLocked = isGuest && room !== "Nexus Official";
                                    
                                    return (
                                        <div 
                                            key={room} 
                                            className={`dm-row-card ${isActive ? "active" : ""} ${isLocked ? "locked-room" : ""}`}
                                            onClick={() => !isLocked && onSelectRoom(room)}
                                            style={{ padding: '10px 12px', borderRadius: '10px' }}
                                        >
                                            <div className="dm-row-left">
                                                <div className="dm-avatar-wrapper">
                                                    {room === "Nexus Official" ? (
                                                        <img src={logo} alt="Nexus Logo" className="dm-row-avatar" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                                                    ) : (
                                                        <div className="dm-row-avatar" style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                                                            {ROOM_ICONS[room] || "🌐"}
                                                        </div>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                                    <span className="dm-row-name" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
                                                        {room.replace(" chat", "")}
                                                        {room === "Nexus Official" && (
                                                            <VerifiedRoomBadge size={13} />
                                                        )}
                                                    </span>
                                                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                                        {unread > 0 ? `${unread} unread` : "No unread"}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="dm-row-right">
                                                {isLocked ? (
                                                    <FiLock className="dm-lock-icon" />
                                                ) : unread > 0 ? (
                                                    <span className="dm-unread-badge">{unread}</span>
                                                ) : null}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Private Rooms Section */}
                            <div className="sidebar-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span>Private Rooms</span>
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
                                        <FiPlus />
                                    </button>
                                )}
                            </div>
                            <div className="unified-rooms-list" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {customRoomsLoading ? (
                                    Array.from({ length: 3 }).map((_, idx) => (
                                        <div key={`shimmer-${idx}`} className="dm-row-card shimmer-card" style={{ height: '48px', pointerEvents: 'none', opacity: 0.5, padding: '10px 12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div className="shimmer-line" style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(0,0,0,0.1)' }} />
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <div className="shimmer-line" style={{ width: '60%', height: '12px', borderRadius: '4px', background: 'rgba(0,0,0,0.06)' }} />
                                                <div className="shimmer-line" style={{ width: '40%', height: '8px', borderRadius: '4px', background: 'rgba(0,0,0,0.04)' }} />
                                            </div>
                                        </div>
                                    ))
                                ) : customRooms.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '16px 8px', fontSize: '11px', color: 'var(--muted)', fontWeight: '500' }}>
                                        No private rooms yet.<br/>Click + to create/join one!
                                    </div>
                                ) : (
                                    customRooms.map(room => {
                                        const isActive = activeRoom === room.name && !activePrivate;
                                        const unread = unreadCounts && unreadCounts[room.name] ? unreadCounts[room.name] : 0;
                                        
                                        return (
                                            <div 
                                                key={room.code} 
                                                className={`dm-row-card ${isActive ? "active" : ""}`}
                                                onClick={() => onSelectRoom(room.name)}
                                                style={{ padding: '10px 12px', borderRadius: '10px' }}
                                            >
                                                <div className="dm-row-left">
                                                    <div className="dm-avatar-wrapper">
                                                        {room.avatar ? (
                                                            <img 
                                                                src={room.avatar} 
                                                                alt={room.name} 
                                                                className="dm-row-avatar"
                                                                style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} 
                                                            />
                                                        ) : (
                                                            <div className="dm-row-avatar" style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                                                                🔒
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                                        <span className="dm-row-name" style={{ fontSize: '13px' }}>
                                                            {room.name}
                                                        </span>
                                                        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                                            {unread > 0 ? `${unread} unread` : `Code: ${room.code}`}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="dm-row-right">
                                                    {unread > 0 && (
                                                        <span className="dm-unread-badge">{unread}</span>
                                                    )}
                                                </div>
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
                            <h3 className="panel-header-title">Private chats</h3>
                            {!isGuest && (
                                <div className="panel-search-box">
                                    <div style={{ position: 'relative', width: '100%' }}>
                                        <SmoothInput
                                            type="text"
                                            placeholder="Search your chat..."
                                            value={dmSearch}
                                            onChange={(e) => setDmSearch(e.target.value)}
                                            className="dm-search-input"
                                        />
                                        {dmSearch && (
                                            <button className="dm-search-clear" onClick={() => setDmSearch("")}>×</button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="panel-content-scroll" style={{ padding: '8px 16px' }}>
                            <div className="dm-list-container" style={{ height: '100%', overflowY: 'visible' }}>
                                {showSavedMessages && (() => {
                                    const privateChatId = `${currentUser.toLowerCase()}_${currentUser.toLowerCase()}`;
                                    const isActive = activePrivate === privateChatId;
                                    const unread = unreadCounts && unreadCounts[privateChatId] ? unreadCounts[privateChatId] : 0;
                                    return (
                                        <div 
                                            key="saved_messages_chat_fallback"
                                            className={`dm-row-card ${isActive ? "active" : ""}`}
                                            onClick={() => onSelectPrivate(privateChatId, currentUser)}
                                            style={{ padding: '10px 12px', borderRadius: '10px' }}
                                        >
                                            <div className="dm-row-left">
                                                <div className="dm-avatar-wrapper">
                                                    <img 
                                                        src={savedMessagesLogo} 
                                                        alt="Your Messages" 
                                                        className="dm-row-avatar" 
                                                        style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
                                                    />
                                                </div>
                                                <span className="dm-row-name">
                                                    {savedMessagesTitle}
                                                </span>
                                            </div>
                                            <div className="dm-row-right">
                                                {unread > 0 ? (
                                                    <span className="dm-unread-badge">{unread}</span>
                                                ) : (
                                                    <span className="dm-pill">Drafts</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()}
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
                                    dmConversations.length === 0 && !showSavedMessages ? (
                                        <div className="sidebar-empty-state">No private chats yet. Search for a user to start chatting.</div>
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
