function avatarColor(username) {
    const colors = ["#e8ddff", "#d9f4ff", "#ffe7cc", "#dcfce7", "#dff8f5"];
    let colorIndex = 0;
    for (let i = 0; i < username.length; i++) {
        colorIndex += username.charCodeAt(i);
    }
    return colors[colorIndex % colors.length];
}

function OnlineUsers({ onlineUsers, onlineUserList = [], currentUser, onUserProfileClick, onShowOnlineListClick }) {
    const users = onlineUserList.length
        ? onlineUserList
        : currentUser
            ? [{ username: currentUser }]
            : [];
    const visibleUsers = users.slice(0, 4);

    return (
        <div className="online-users" onClick={onShowOnlineListClick} style={{ cursor: 'pointer' }} title="View online members">
            {visibleUsers.length > 0 && (
                <div className="online-avatar-stack" aria-hidden="true">
                    {visibleUsers.map(user => (
                        <span
                            key={user.username}
                            style={{ 
                                backgroundColor: user.avatar ? "transparent" : avatarColor(user.username),
                                padding: 0,
                                overflow: 'hidden',
                                cursor: onUserProfileClick ? 'pointer' : 'default'
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                onUserProfileClick && onUserProfileClick(user.username);
                            }}
                            title={`${user.displayName || user.username}${user.role === "guest" ? " [Guest]" : ""}`}
                        >
                            {user.avatar ? (
                                <img 
                                    src={user.avatar} 
                                    alt={user.username} 
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} 
                                />
                            ) : (
                                user.username.charAt(0).toUpperCase()
                            )}
                        </span>
                    ))}
                </div>
            )}
            <span className="online-dot"></span>
            <span>{onlineUsers} {onlineUsers === 1 ? "user" : "users"} online</span>
        </div>
    );
}

export default OnlineUsers;
