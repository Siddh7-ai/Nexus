import React, { useState, useMemo } from "react";
import logo from "../assets/logo.png";
import savedMessagesLogo from "../assets/saved_msg.png";
import { SmoothInput } from "./SmoothInput";
import { FiLock, FiPlus, FiHome, FiSend, FiSettings, FiMessageSquare, FiUsers, FiActivity, FiLogOut, FiUser, FiKey, FiBell, FiCommand, FiHelpCircle, FiChevronLeft, FiSearch, FiEdit2, FiCheck, FiX, FiShield, FiSun, FiMoon, FiGlobe, FiBriefcase } from "react-icons/fi";
import { getBackendUrl } from "../utils/config";
import { toggleTheme } from "../utils/theme";
import ThemeToggleButton from "./ThemeToggleButton";
import { CustomSelect } from "./CustomSelect";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { useTheme, accentColors } from "../context/ThemeContext";

const customSchema = {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames || []), "u"]
};

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
    nextaskTasks = [],
    nextaskBoard = "personal",
    nextaskRooms = [],
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
    onLogout,
    settingsProps = {}
}) {
    const [dmSearch, setDmSearch] = useState("");
    const [settingsSubpage, setSettingsSubpage] = useState("main");
    const [settingsSearch, setSettingsSearch] = useState("");
    const [showPhotoOptions, setShowPhotoOptions] = useState(false);
    const fileInputRef = React.useRef(null);

    const { accentColor, setAccentColor, soundEnabled, setSoundEnabled } = useTheme();

    React.useEffect(() => {
        if (activeSidebarTab !== "settings") {
            setSettingsSubpage("main");
            setSettingsSearch("");
        }
    }, [activeSidebarTab]);

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
                        <button 
                            className={`narrow-nav-btn ${activeSidebarTab === "nextask" ? "active" : ""}`}
                            onClick={() => setActiveSidebarTab("nextask")}
                            title="NexTask"
                        >
                            <FiBriefcase />
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
                        className={`narrow-avatar-wrapper ${activeSidebarTab === "settings" ? "active" : ""}`}
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
                                                            style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover' }}
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
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span className="dm-row-name" style={{ fontSize: '13px' }}>
                {user.displayName || user.username}
            </span>
            {user.lastMessage && (
                <span className="dm-message-preview" style={{ fontSize: '11px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.lastMessage}
                </span>
            )}
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
                                                                    size={38} 
                                                                    className="dm-row-avatar" 
                                                                />
                                                                <span className={`dm-status-dot ${
                                                                    user.role === "guest" ? "guest-dot" :
                                                                    user.status === "Online" ? "" :
                                                                    user.status === "Away" ? "away" :
                                                                    user.status === "Busy" ? "busy" : "offline"
                                                                }`} />
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                                                <span className="dm-row-name" style={{ fontSize: '13px' }}>
                                                                    {user.displayName || user.username}
                                                                </span>
                                                                {user.lastMessage && (
                                                                    <span className="dm-message-preview">
                                                                        <ReactMarkdown
                                                                            remarkPlugins={[remarkGfm]}
                                                                            rehypePlugins={[rehypeRaw, [rehypeSanitize, customSchema]]}
                                                                            components={{
                                                                                p: ({ node, ...props }) => <span {...props} style={{ margin: 0, padding: 0 }} />,
                                                                                a: ({ node, ...props }) => <span {...props} style={{ color: 'inherit', textDecoration: 'underline' }} />
                                                                            }}
                                                                        >
                                                                            {user.lastMessage}
                                                                        </ReactMarkdown>
                                                                    </span>
                                                                )}
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
                ) : activeSidebarTab === "settings" ? (
                    isGuest ? (
                        /* Guest Settings Layout */
                        <div className="settings-panel-container">
                            <div className="settings-header-box">
                                <button 
                                    className="settings-back-btn" 
                                    onClick={() => setActiveSidebarTab("messages")}
                                    title="Go back"
                                >
                                    <FiChevronLeft size={20} />
                                </button>
                                <h3>Settings (Guest)</h3>
                            </div>
                            <div className="settings-scroll-content" style={{ padding: '16px' }}>
                                <div className="settings-profile-card guest-mode">
                                    <Avatar 
                                        username={currentUser || "U"} 
                                        size={56} 
                                    />
                                    <div className="settings-profile-info">
                                        <h4>@{currentUser}</h4>
                                        <p className="settings-profile-status-quote">Guest Account</p>
                                    </div>
                                </div>

                                <form onSubmit={settingsProps.handleGuestNameChange} className="settings-form" style={{ marginTop: '20px' }}>
                                    <div className="settings-form-group">
                                        <label>Guest Username</label>
                                        <input 
                                            type="text" 
                                            placeholder="Enter new username"
                                            value={settingsProps.newGuestName || ""}
                                            onChange={(e) => {
                                                settingsProps.setNewGuestName(e.target.value);
                                                if (settingsProps.setProfileError) settingsProps.setProfileError("");
                                            }}
                                            maxLength={20}
                                            className="settings-input"
                                            disabled={settingsProps.profileLoading}
                                        />
                                        <small className="settings-input-hint">
                                            3–20 characters. Letters, numbers, and underscores only.
                                        </small>
                                    </div>

                                    {settingsProps.profileError && (
                                        <div className="settings-error-alert">{settingsProps.profileError}</div>
                                    )}

                                    <button 
                                        type="submit" 
                                        className="settings-save-btn"
                                        disabled={!settingsProps.newGuestName || settingsProps.newGuestName.trim() === currentUser || settingsProps.newGuestName.trim().length < 3 || settingsProps.profileLoading}
                                    >
                                        {settingsProps.profileLoading ? "Updating..." : "Save Changes"}
                                    </button>
                                </form>

                                <div className="settings-options-list" style={{ marginTop: '24px' }}>
                                    <div className="settings-option-item" onClick={() => setSettingsSubpage("shortcuts")}>
                                        <div className="settings-option-icon-wrapper">
                                            <FiCommand />
                                        </div>
                                        <div className="settings-option-details">
                                            <span>Keyboard shortcuts</span>
                                            <p>Quick actions reference</p>
                                        </div>
                                    </div>

                                    <div className="settings-option-item" onClick={() => setSettingsSubpage("help")}>
                                        <div className="settings-option-icon-wrapper">
                                            <FiHelpCircle />
                                        </div>
                                        <div className="settings-option-details">
                                            <span>Help and feedback</span>
                                            <p>Help center, privacy policy</p>
                                        </div>
                                    </div>

                                    <div className="settings-option-item logout-option" onClick={onLogout}>
                                        <div className="settings-option-icon-wrapper logout-icon">
                                            <FiLogOut />
                                        </div>
                                        <div className="settings-option-details">
                                            <span style={{ color: '#ef4444' }}>Log out</span>
                                            <p>Exit guest session</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Registered User Settings Layout with Subpages */
                        settingsSubpage === "main" ? (
                            <div className="settings-panel-container">
                                <div className="settings-header-box">
                                    <button 
                                        className="settings-back-btn" 
                                        onClick={() => setActiveSidebarTab("messages")}
                                        title="Go back"
                                    >
                                        <FiChevronLeft size={20} />
                                    </button>
                                    <h3>Settings</h3>
                                </div>

                                <div className="settings-search-bar">
                                    <div className="settings-search-input-wrapper">
                                        <FiSearch className="settings-search-icon" size={16} />
                                        <input 
                                            type="text" 
                                            placeholder="Search settings..." 
                                            value={settingsSearch}
                                            onChange={(e) => setSettingsSearch(e.target.value)}
                                            className="settings-search-input"
                                        />
                                        {settingsSearch && (
                                            <button className="settings-search-clear" onClick={() => setSettingsSearch("")}>×</button>
                                        )}
                                    </div>
                                </div>

                                <div className="settings-scroll-content">
                                    {settingsSearch === "" && (
                                        <div className="settings-profile-card" onClick={() => setSettingsSubpage("profile")}>
                                            {/* Speech bubble bio */}
                                            {(settingsProps.bioVal || currentUserProfile?.bio) && (
                                                <div className="settings-profile-bubble">
                                                    &ldquo;{settingsProps.bioVal || currentUserProfile?.bio}&rdquo;
                                                </div>
                                            )}

                                            {/* Large centered avatar */}
                                            <div className="settings-profile-avatar-hero">
                                                <Avatar 
                                                    username={currentUser || "U"} 
                                                    avatarSrc={settingsProps.avatarVal || currentUserProfile?.avatar} 
                                                    size={120} 
                                                />
                                            </div>
                                            {/* Name only below avatar */}
                                            <div className="settings-profile-hero-info">
                                                <h4>{settingsProps.displayNameVal || currentUserProfile?.displayName || currentUser}</h4>
                                            </div>
                                        </div>
                                    )}

                                    <div className="settings-options-list">
                                        {[
                                            { id: "profile", label: "Profile", subtext: "Name, profile picture, bio", icon: <FiUser /> },
                                            { id: "account", label: "Account", subtext: "Security, email, change password", icon: <FiKey /> },
                                            { id: "privacy", label: "Privacy", subtext: "Blocked contacts, visibilities", icon: <FiLock /> },
                                            { id: "chats", label: "Chats", subtext: "Theme, wallpaper, transition settings", icon: <FiMessageSquare /> },
                                            { id: "notifications", label: "Notifications", subtext: "Alerts, push permissions", icon: <FiBell /> },
                                            { id: "shortcuts", label: "Keyboard shortcuts", subtext: "Quick actions reference", icon: <FiCommand /> },
                                            { id: "help", label: "Help and feedback", subtext: "Help center, privacy policy", icon: <FiHelpCircle /> }
                                        ]
                                        .filter(opt => 
                                            opt.label.toLowerCase().includes(settingsSearch.toLowerCase()) || 
                                            opt.subtext.toLowerCase().includes(settingsSearch.toLowerCase())
                                        )
                                        .map(opt => (
                                            <div 
                                                key={opt.id} 
                                                className="settings-option-item" 
                                                onClick={() => setSettingsSubpage(opt.id)}
                                            >
                                                <div className="settings-option-icon-wrapper">
                                                    {opt.icon}
                                                </div>
                                                <div className="settings-option-details">
                                                    <span>{opt.label}</span>
                                                    <p>{opt.subtext}</p>
                                                </div>
                                            </div>
                                        ))}

                                        {(!settingsSearch || "log out".includes(settingsSearch.toLowerCase())) && (
                                            <div className="settings-option-item logout-option" onClick={onLogout}>
                                                <div className="settings-option-icon-wrapper logout-icon">
                                                    <FiLogOut />
                                                </div>
                                                <div className="settings-option-details">
                                                    <span style={{ color: '#ef4444' }}>Log out</span>
                                                    <p>Sign out of this session</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : settingsSubpage === "profile" ? (
                            <div className="settings-subpage-container">
                                <div className="settings-subpage-header">
                                    <button className="settings-subpage-back-btn" onClick={() => setSettingsSubpage("main")}>
                                        <FiChevronLeft size={18} />
                                    </button>
                                    <span className="settings-subpage-title">Edit profile</span>
                                </div>
                                <div className="settings-subpage-body">
                                    <div className="settings-profile-avatar-section">
                                        <div className="settings-avatar-edit-wrapper">
                                            <Avatar 
                                                username={currentUser || "U"} 
                                                avatarSrc={settingsProps.avatarVal} 
                                                size={120} 
                                            />
                                            <div 
                                                className="settings-change-photo-overlay"
                                                onClick={() => setShowPhotoOptions(true)}
                                            >
                                                <span>CHANGE PHOTO</span>
                                            </div>
                                            <input 
                                                type="file" 
                                                ref={fileInputRef} 
                                                accept="image/*" 
                                                onChange={settingsProps.handleCropFileChange} 
                                                style={{ display: 'none' }} 
                                            />
                                        </div>
                                    </div>

                                    {showPhotoOptions && (
                                        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => setShowPhotoOptions(false)}>
                                            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 'min(90%, 280px)', padding: '20px', borderRadius: '16px' }}>
                                                <div className="modal-header-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '850', color: 'var(--text)' }}>Profile Photo</h3>
                                                    <button type="button" className="close-picker-btn" onClick={() => setShowPhotoOptions(false)} style={{ border: 'none', background: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--muted)' }}>×</button>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    <button 
                                                        type="button" 
                                                        className="modal-btn outline" 
                                                        onClick={() => {
                                                            setShowPhotoOptions(false);
                                                            if (settingsProps.avatarVal) {
                                                                settingsProps.setFullAvatarUrl(settingsProps.avatarVal);
                                                            } else {
                                                                alert("No profile photo set.");
                                                            }
                                                        }}
                                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: '10px 14px', gap: '10px', fontSize: '13px' }}
                                                    >
                                                        <FiUser size={15} />
                                                        <span>View photo</span>
                                                    </button>
                                                    <button 
                                                        type="button" 
                                                        className="modal-btn outline" 
                                                        onClick={() => {
                                                            setShowPhotoOptions(false);
                                                            if (settingsProps.avatarVal) {
                                                                settingsProps.setCropTarget("ownProfile");
                                                                settingsProps.setCropImageSrc(settingsProps.avatarVal);
                                                            } else {
                                                                alert("No profile photo to edit. Please upload one first.");
                                                            }
                                                        }}
                                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: '10px 14px', gap: '10px', fontSize: '13px' }}
                                                    >
                                                        <FiEdit2 size={15} />
                                                        <span>Edit photo</span>
                                                    </button>
                                                    <button 
                                                        type="button" 
                                                        className="modal-btn primary" 
                                                        onClick={() => {
                                                            setShowPhotoOptions(false);
                                                            fileInputRef.current?.click();
                                                        }}
                                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: '10px 14px', gap: '10px', fontSize: '13px' }}
                                                    >
                                                        <FiPlus size={15} />
                                                        <span>Change photo</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <form onSubmit={settingsProps.handleOwnProfileUpdate} className="settings-form">
                                        <div className="settings-form-group">
                                            <label>Display Name</label>
                                            <input 
                                                type="text" 
                                                value={settingsProps.displayNameVal || ""}
                                                onChange={(e) => settingsProps.setDisplayNameVal(e.target.value)}
                                                placeholder="Set display name"
                                                className="settings-input"
                                                disabled={settingsProps.profileLoading}
                                            />
                                        </div>

                                        <div className="settings-form-group">
                                            <label>Username</label>
                                            <input 
                                                type="text" 
                                                value={currentUser || ""} 
                                                className="settings-input settings-input-readonly"
                                                readOnly
                                            />
                                            <small className="settings-input-hint">Username is unique and cannot be changed.</small>
                                        </div>

                                        <div className="settings-form-group">
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <label>Bio / About Me</label>
                                                <small style={{ opacity: 0.6 }}>{(settingsProps.bioVal || "").length}/50</small>
                                            </div>
                                            <textarea 
                                                value={settingsProps.bioVal || ""}
                                                onChange={(e) => settingsProps.setBioVal(e.target.value.slice(0, 50))}
                                                placeholder="Tell us about yourself..."
                                                className="settings-textarea"
                                                disabled={settingsProps.profileLoading}
                                                rows={2}
                                            />
                                        </div>

                                        <div className="settings-form-group">
                                            <label>My Status</label>
                                            <CustomSelect 
                                                value={settingsProps.statusVal || "Online"}
                                                onChange={(val) => settingsProps.setStatusVal(val)}
                                                options={["Online", "Away", "Busy", "Offline"]}
                                                disabled={settingsProps.profileLoading}
                                                colorMap={{
                                                    Online: "#17d67e",
                                                    Away: "#f59e0b",
                                                    Busy: "#ef4444",
                                                    Offline: "#6b7280"
                                                }}
                                            />
                                        </div>

                                        {settingsProps.profileError && !settingsProps.profileError.toLowerCase().includes("password") && !settingsProps.profileError.toLowerCase().includes("email") && (
                                            <div className="settings-error-alert">{settingsProps.profileError}</div>
                                        )}

                                        <button 
                                            type="submit" 
                                            className="settings-save-btn" 
                                            disabled={settingsProps.profileLoading}
                                        >
                                            {settingsProps.profileLoading ? "Saving..." : "Save Profile"}
                                        </button>
                                    </form>
                                </div>
                            </div>
                        ) : settingsSubpage === "account" ? (
                            <div className="settings-subpage-container">
                                <div className="settings-subpage-header">
                                    <button className="settings-subpage-back-btn" onClick={() => setSettingsSubpage("main")}>
                                        <FiChevronLeft size={18} />
                                    </button>
                                    <span className="settings-subpage-title">Account</span>
                                </div>
                                <div className="settings-subpage-body">
                                    <form onSubmit={settingsProps.handleOwnProfileUpdate} className="settings-form">
                                        <div className="settings-form-group">
                                            <label>Email Address</label>
                                            <input 
                                                type="email" 
                                                value={settingsProps.emailVal || ""}
                                                onChange={(e) => settingsProps.setEmailVal(e.target.value)}
                                                placeholder="Enter email address"
                                                className="settings-input"
                                                disabled={settingsProps.profileLoading}
                                            />
                                        </div>

                                        <div className="settings-divider-label">Security & Password</div>

                                        <div className="settings-form-group">
                                            <label>Current Password</label>
                                            <input 
                                                type="password" 
                                                value={settingsProps.currentPasswordVal || ""}
                                                onChange={(e) => settingsProps.setCurrentPasswordVal(e.target.value)}
                                                placeholder="Required to update email/password"
                                                className="settings-input"
                                                disabled={settingsProps.profileLoading}
                                            />
                                        </div>

                                        <div className="settings-form-group">
                                            <label>New Password</label>
                                            <input 
                                                type="password" 
                                                value={settingsProps.newPasswordVal || ""}
                                                onChange={(e) => settingsProps.setNewPasswordVal(e.target.value)}
                                                placeholder="Enter new password"
                                                className="settings-input"
                                                disabled={settingsProps.profileLoading}
                                            />
                                        </div>

                                        <div className="settings-form-group">
                                            <label>Confirm New Password</label>
                                            <input 
                                                type="password" 
                                                value={settingsProps.newPasswordConfirmVal || ""}
                                                onChange={(e) => settingsProps.setNewPasswordConfirmVal(e.target.value)}
                                                placeholder="Confirm new password"
                                                className="settings-input"
                                                disabled={settingsProps.profileLoading}
                                            />
                                        </div>

                                        {settingsProps.profileError && (settingsProps.profileError.toLowerCase().includes("password") || settingsProps.profileError.toLowerCase().includes("email")) && (
                                            <div className="settings-error-alert">{settingsProps.profileError}</div>
                                        )}

                                        <button 
                                            type="submit" 
                                            className="settings-save-btn" 
                                            disabled={settingsProps.profileLoading}
                                        >
                                            {settingsProps.profileLoading ? "Updating..." : "Update Credentials"}
                                        </button>
                                    </form>
                                </div>
                            </div>
                        ) : settingsSubpage === "privacy" ? (
                            <div className="settings-subpage-container">
                                <div className="settings-subpage-header">
                                    <button className="settings-subpage-back-btn" onClick={() => setSettingsSubpage("main")}>
                                        <FiChevronLeft size={18} />
                                    </button>
                                    <span className="settings-subpage-title">Privacy</span>
                                </div>
                                <div className="settings-subpage-body">
                                    <form onSubmit={settingsProps.handleOwnProfileUpdate} className="settings-form">
                                        <div className="settings-form-group">
                                            <label>Last Seen Visibility</label>
                                            <CustomSelect 
                                                value={settingsProps.privacyLastSeenVal || "Everyone"}
                                                onChange={(val) => settingsProps.setPrivacyLastSeenVal(val)}
                                                options={["Everyone", "Friends", "Nobody"]}
                                            />
                                        </div>

                                        <div className="settings-form-group">
                                            <label>Profile Picture Visibility</label>
                                            <CustomSelect 
                                                value={settingsProps.privacyAvatarVal || "Everyone"}
                                                onChange={(val) => settingsProps.setPrivacyAvatarVal(val)}
                                                options={["Everyone", "Friends", "Nobody"]}
                                            />
                                        </div>

                                        <div className="settings-form-group">
                                            <label>Private Message Permissions</label>
                                            <CustomSelect 
                                                value={settingsProps.privacyPMVal || "Everyone"}
                                                onChange={(val) => settingsProps.setPrivacyPMVal(val)}
                                                options={["Everyone", "Friends", "Nobody"]}
                                            />
                                        </div>

                                        <button type="submit" className="settings-save-btn" style={{ marginBottom: '20px' }}>
                                            Save Privacy Rules
                                        </button>
                                    </form>

                                    {/* Blocked Contacts List */}
                                    <div className="settings-divider-label">Blocked Contacts</div>
                                    <div className="settings-list-card">
                                        {settingsProps.ownProfileData?.blockedUsers && settingsProps.ownProfileData.blockedUsers.length > 0 ? (
                                            settingsProps.ownProfileData.blockedUsers.map(uname => (
                                                <div key={uname} className="settings-blocked-item">
                                                    <span>@{uname}</span>
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                const response = await fetch(`${getBackendUrl()}/api/user/unblock`, {
                                                                    method: "POST",
                                                                    headers: { 
                                                                        "Content-Type": "application/json", 
                                                                        "Authorization": `Bearer ${sessionStorage.getItem("token") || localStorage.getItem("token")}` 
                                                                    },
                                                                    body: JSON.stringify({ targetUsername: uname })
                                                                });
                                                                if (response.ok) {
                                                                    settingsProps.setOwnProfileData(prev => ({
                                                                        ...prev,
                                                                        blockedUsers: prev.blockedUsers.filter(x => x !== uname)
                                                                    }));
                                                                }
                                                            } catch(e) {}
                                                        }}
                                                        className="settings-unblock-btn"
                                                    >
                                                        Unblock
                                                    </button>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="settings-empty-text">No blocked contacts.</div>
                                        )}
                                    </div>

                                    {/* Pending Friend Requests List */}
                                    <div className="settings-divider-label">Friend Requests</div>
                                    <div className="settings-list-card">
                                        {settingsProps.pendingRequests && settingsProps.pendingRequests.length > 0 ? (
                                            settingsProps.pendingRequests.map(reqItem => (
                                                <div key={reqItem._id} className="settings-request-item">
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <Avatar username={reqItem.sender} avatarSrc={reqItem.avatar} size={24} />
                                                        <span style={{ fontWeight: '600' }}>@{reqItem.sender}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '6px' }}>
                                                        <button
                                                            onClick={() => settingsProps.handleAcceptRequest(reqItem.sender)}
                                                            className="settings-action-pill accept"
                                                        >
                                                            Accept
                                                        </button>
                                                        <button
                                                            onClick={() => settingsProps.handleDeclineRequest(reqItem.sender)}
                                                            className="settings-action-pill decline"
                                                        >
                                                            Decline
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="settings-empty-text">No pending friend requests.</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : settingsSubpage === "chats" ? (
                            <div className="settings-subpage-container">
                                <div className="settings-subpage-header">
                                    <button className="settings-subpage-back-btn" onClick={() => setSettingsSubpage("main")}>
                                        <FiChevronLeft size={18} />
                                    </button>
                                    <span className="settings-subpage-title">Chats</span>
                                </div>
                                <div className="settings-subpage-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div className="settings-field-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderRadius: '12px', background: 'var(--soft)', border: '1px solid var(--border)' }}>
                                        <div>
                                            <span style={{ fontWeight: 'bold', display: 'block' }}>Theme Mode</span>
                                            <span style={{ fontSize: '12px', opacity: 0.6 }}>Toggle light and dark aesthetics</span>
                                        </div>
                                        <ThemeToggleButton 
                                            theme={settingsProps.theme} 
                                            onToggle={(e) => {
                                                toggleTheme(e, settingsProps.setTheme);
                                            }}
                                            className="empty-chat-theme-toggle"
                                            style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--border)' }}
                                        />
                                    </div>

                                    <div className="settings-field-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderRadius: '12px', background: 'var(--soft)', border: '1px solid var(--border)' }}>
                                        <div>
                                            <span style={{ fontWeight: 'bold', display: 'block' }}>Transition Style</span>
                                            <span style={{ fontSize: '12px', opacity: 0.6 }}>Theme changing animation details</span>
                                        </div>
                                        <button 
                                            onClick={() => settingsProps.setShowTransitionSettings(true)}
                                            className="settings-action-pill accept"
                                            style={{ minWidth: 'unset', padding: '8px 12px' }}
                                        >
                                            Configure
                                        </button>
                                    </div>

                                    {/* Mute/Unmute Sound Effects Toggle */}
                                    <div className="settings-field-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderRadius: '12px', background: 'var(--soft)', border: '1px solid var(--border)', marginTop: '12px' }}>
                                        <div>
                                            <span style={{ fontWeight: 'bold', display: 'block' }}>Sound Effects</span>
                                            <span style={{ fontSize: '12px', opacity: 0.6 }}>Play pop sound on actions</span>
                                        </div>
                                        <button 
                                            onClick={() => setSoundEnabled(!soundEnabled)}
                                            className={`settings-action-pill ${soundEnabled ? "accept" : "cancel"}`}
                                            style={{ minWidth: '80px', padding: '8px 12px' }}
                                        >
                                            {soundEnabled ? "Enabled" : "Muted"}
                                        </button>
                                    </div>

                                    {/* Accent Color Grid Selector */}
                                    <div className="settings-field-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 16px', borderRadius: '12px', background: 'var(--soft)', border: '1px solid var(--border)', marginTop: '12px' }}>
                                        <div>
                                            <span style={{ fontWeight: 'bold', display: 'block' }}>Accent Color Palette</span>
                                            <span style={{ fontSize: '12px', opacity: 0.6 }}>Customize primary highlights</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '10px', marginTop: '6px', flexWrap: 'wrap' }}>
                                            {Object.keys(accentColors).map(key => {
                                                const colorObj = accentColors[key];
                                                const isSelected = accentColor === key;
                                                return (
                                                    <button 
                                                        key={key}
                                                        onClick={() => setAccentColor(key)}
                                                        title={colorObj.name}
                                                        style={{
                                                            width: '32px',
                                                            height: '32px',
                                                            borderRadius: '50%',
                                                            background: colorObj.accent,
                                                            border: isSelected ? '3px solid var(--text)' : '2px solid transparent',
                                                            cursor: 'pointer',
                                                            boxShadow: isSelected ? '0 0 10px rgba(0,0,0,0.2)' : 'none',
                                                            transition: 'all 0.2s',
                                                            padding: 0
                                                        }}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : settingsSubpage === "notifications" ? (
                            <div className="settings-subpage-container">
                                <div className="settings-subpage-header">
                                    <button className="settings-subpage-back-btn" onClick={() => setSettingsSubpage("main")}>
                                        <FiChevronLeft size={18} />
                                    </button>
                                    <span className="settings-subpage-title">Notifications</span>
                                </div>
                                <div className="settings-subpage-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div className="settings-field-card" style={{ padding: '12px 16px', borderRadius: '12px', background: 'var(--soft)', border: '1px solid var(--border)' }}>
                                        <span style={{ fontWeight: 'bold', display: 'block' }}>Desktop Push Notifications</span>
                                        <span style={{ fontSize: '12px', opacity: 0.6, display: 'block', marginBottom: '10px' }}>Receive notifications when new messages arrive</span>
                                        <button 
                                            onClick={async () => {
                                                if (Notification.permission === 'default') {
                                                    await Notification.requestPermission();
                                                }
                                                alert(`Notification status: ${Notification.permission}`);
                                            }}
                                            className="settings-action-pill accept"
                                            style={{ minWidth: 'unset', padding: '8px 12px' }}
                                        >
                                            {Notification.permission === 'granted' ? 'Enabled' : 'Request Permission'}
                                        </button>
                                    </div>
                                    <div className="settings-field-card" style={{ padding: '12px 16px', borderRadius: '12px', background: 'var(--soft)', border: '1px solid var(--border)' }}>
                                        <span style={{ fontWeight: 'bold', display: 'block' }}>Alert Sounds</span>
                                        <span style={{ fontSize: '12px', opacity: 0.6, display: 'block' }}>Chime sound played on incoming message (Enabled by default)</span>
                                    </div>
                                </div>
                            </div>
                        ) : settingsSubpage === "shortcuts" ? (
                            <div className="settings-subpage-container">
                                <div className="settings-subpage-header">
                                    <button className="settings-subpage-back-btn" onClick={() => setSettingsSubpage("main")}>
                                        <FiChevronLeft size={18} />
                                    </button>
                                    <span className="settings-subpage-title">Keyboard shortcuts</span>
                                </div>
                                <div className="settings-subpage-body" style={{ padding: '16px 0' }}>
                                    <div className="settings-shortcuts-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 16px' }}>
                                        {[
                                            { keys: ["Enter"], desc: "Send active message" },
                                            { keys: ["Shift", "Enter"], desc: "Insert new line inside input" },
                                            { keys: ["Esc"], desc: "Close active modal, visualizer, or vault panel" },
                                            { keys: ["Ctrl", "Shift", "E"], desc: "Toggle emoji picker panel" },
                                            { keys: ["Ctrl", "Shift", "F"], desc: "Filter/search direct messages list" }
                                        ].map((item, idx) => (
                                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                                                <span style={{ fontSize: '13px', opacity: 0.85 }}>{item.desc}</span>
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    {item.keys.map((k, kidx) => (
                                                        <kbd key={kidx} style={{ padding: '2px 6px', background: 'var(--border)', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                                                            {k}
                                                        </kbd>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : settingsSubpage === "help" ? (
                            <div className="settings-subpage-container">
                                <div className="settings-subpage-header">
                                    <button className="settings-subpage-back-btn" onClick={() => setSettingsSubpage("main")}>
                                        <FiChevronLeft size={18} />
                                    </button>
                                    <span className="settings-subpage-title">Help and feedback</span>
                                </div>
                                <div className="settings-subpage-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div className="settings-field-card" style={{ padding: '16px', borderRadius: '12px', background: 'var(--soft)', border: '1px solid var(--border)' }}>
                                        <span style={{ fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Nexus Messenger v2.4.0</span>
                                        <span style={{ fontSize: '12px', opacity: 0.6, display: 'block', lineHeight: '1.4' }}>
                                            State-of-the-art secure messenger with End-to-End Encryption, secure storage vaults, and data-flow visualizers.
                                        </span>
                                    </div>
                                    <div className="settings-options-list">
                                        <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="settings-option-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                                            <div className="settings-option-icon-wrapper"><FiHelpCircle /></div>
                                            <div className="settings-option-details">
                                                <span>Help Center</span>
                                                <p>Guides and troubleshooting</p>
                                            </div>
                                        </a>
                                        <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="settings-option-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                                            <div className="settings-option-icon-wrapper"><FiShield /></div>
                                            <div className="settings-option-details">
                                                <span>Privacy Policy</span>
                                                <p>Data handling and E2EE information</p>
                                            </div>
                                        </a>
                                    </div>
                                </div>
                            </div>
                        ) : null
                    )
                ) : activeSidebarTab === "nextask" ? (
                    <NexTaskDashboard 
                        tasks={nextaskTasks}
                        board={nextaskBoard}
                        rooms={nextaskRooms}
                    />
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
                                                        style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover' }}
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

function NexTaskDashboard({ tasks = [], board = "personal", rooms = [] }) {
    const boardTitle = board === "personal" 
        ? "Personal Board" 
        : (rooms.find(r => r._id === board)?.name || "Room Board");

    const totalTasks = tasks.length;
    const todoTasks = tasks.filter(t => t.type === "task" && t.status === "open").length;
    const progressTasks = tasks.filter(t => t.type === "task" && t.status === "in_progress").length;
    const completedTasks = tasks.filter(t => t.type === "task" && t.status === "completed").length;
    
    const activeIssues = tasks.filter(t => t.type === "issue" && t.status !== "resolved").length;
    const resolvedIssues = tasks.filter(t => t.type === "issue" && t.status === "resolved").length;
    
    const criticalCount = tasks.filter(t => t.priority === "critical").length;
    const highCount = tasks.filter(t => t.priority === "high").length;
    const mediumCount = tasks.filter(t => t.priority === "medium").length;
    const lowCount = tasks.filter(t => t.priority === "low").length;

    const completedTotal = completedTasks + resolvedIssues;
    const completionRate = totalTasks > 0 
        ? Math.round((completedTotal / totalTasks) * 100) 
        : 0;

    return (
        <div className="nextask-dashboard" style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            color: 'var(--text)',
            animation: 'fadeInUp 0.3s ease-out'
        }}>
            <div className="panel-header-section" style={{ borderBottom: '1px solid var(--border)' }}>
                <h3 className="panel-header-title" style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    fontSize: '20px',
                    fontWeight: 900,
                    letterSpacing: '-0.5px',
                    fontFamily: "'Outfit', 'Inter', system-ui, sans-serif"
                }}>
                    <span className="nextask-brand-logo-inline" style={{ fontSize: '20px' }}>NexTask</span> Summary
                </h3>
                <span style={{ 
                    fontSize: '11px', 
                    color: 'var(--accent)', 
                    fontWeight: '800',
                    display: 'block',
                    marginTop: '2px',
                    opacity: 0.9
                }}>
                    {boardTitle}
                </span>
            </div>

            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
            }}>
                {/* KPI Metrics */}
                <div style={{
                    background: 'linear-gradient(135deg, var(--accent-deep) 0%, var(--accent) 100%)',
                    borderRadius: '16px',
                    padding: '16px',
                    color: '#ffffff',
                    boxShadow: '0 4px 12px rgba(var(--accent-rgb), 0.15)',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <span style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', opacity: 0.8 }}>Total Items</span>
                    <h2 style={{ margin: '4px 0 0 0', fontSize: '28px', fontWeight: '800' }}>{totalTasks}</h2>
                    <span style={{ fontSize: '10px', opacity: 0.9, display: 'block', marginTop: '6px' }}>
                        {completedTotal} of {totalTasks} items resolved
                    </span>
                    <div style={{
                        position: 'absolute',
                        right: '-20px',
                        bottom: '-20px',
                        width: '80px',
                        height: '80px',
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.1)',
                        pointerEvents: 'none'
                    }} />
                </div>

                {/* Progress bar card */}
                <div style={{
                    background: 'var(--soft)',
                    border: '1px solid var(--border)',
                    borderRadius: '16px',
                    padding: '14px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 'bold', marginBottom: '8px' }}>
                        <span>Completion Rate</span>
                        <span style={{ color: 'var(--accent)' }}>{completionRate}%</span>
                    </div>
                    <div style={{
                        width: '100%',
                        height: '8px',
                        background: 'rgba(0,0,0,0.06)',
                        borderRadius: '10px',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            width: `${completionRate}%`,
                            height: '100%',
                            background: 'var(--accent)',
                            borderRadius: '10px',
                            transition: 'width 0.4s ease-out'
                        }} />
                    </div>
                </div>

                {/* Columns breakdown */}
                <div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--muted)' }}>Columns Summary</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {[
                            { name: "To Do", count: todoTasks, color: '#3b82f6' },
                            { name: "In Progress", count: progressTasks, color: '#fbbf24' },
                            { name: "Completed", count: completedTasks, color: '#10b981' },
                            { name: "Issues", count: activeIssues, color: '#ef4444' }
                        ].map(col => {
                            const pct = totalTasks > 0 ? (col.count / totalTasks) * 100 : 0;
                            return (
                                <div key={col.name} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '8px 12px',
                                    borderRadius: '12px',
                                    background: 'var(--panel)',
                                    border: '1px solid var(--border)',
                                    justifyContent: 'space-between',
                                    fontSize: '11px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: col.color }} />
                                        <span style={{ fontWeight: '600' }}>{col.name}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '10px', opacity: 0.6 }}>{col.count}</span>
                                        <span style={{ 
                                            background: col.color + '15', 
                                            color: col.color, 
                                            padding: '1px 5px', 
                                            borderRadius: '4px',
                                            fontWeight: 'bold',
                                            fontSize: '9px'
                                        }}>
                                            {Math.round(pct)}%
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Priority distribution */}
                <div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--muted)' }}>Priority Level</h4>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '8px'
                    }}>
                        {[
                            { name: "Critical", count: criticalCount, color: '#f43f5e' },
                            { name: "High", count: highCount, color: '#fbbf24' },
                            { name: "Medium", count: mediumCount, color: '#3b82f6' },
                            { name: "Low", count: lowCount, color: '#64748b' }
                        ].map(pri => (
                            <div key={pri.name} style={{
                                padding: '8px 10px',
                                borderRadius: '12px',
                                background: 'var(--panel)',
                                border: '1px solid var(--border)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px'
                            }}>
                                <span style={{ fontSize: '8px', fontWeight: 'bold', color: 'var(--muted)', textTransform: 'uppercase' }}>{pri.name}</span>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: '800', fontSize: '14px' }}>{pri.count}</span>
                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: pri.color, boxShadow: `0 0 6px ${pri.color}` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default RoomList;
