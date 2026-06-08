function avatarColor(username) {
    const colors = ["#e8ddff", "#d9f4ff", "#ffe7cc", "#dcfce7", "#dff8f5"];
    let colorIndex = 0;
    for (let i = 0; i < username.length; i++) {
        colorIndex += username.charCodeAt(i);
    }
    return colors[colorIndex % colors.length];
}

function OnlineUsers({ onlineUsers, onlineUserList = [], currentUser }) {
    const users = onlineUserList.length
        ? onlineUserList
        : currentUser
            ? [{ username: currentUser }]
            : [];
    const visibleUsers = users.slice(0, 4);

    return (
        <div className="online-users">
            {visibleUsers.length > 0 && (
                <div className="online-avatar-stack" aria-hidden="true">
                    {visibleUsers.map(user => (
                        <span
                            key={user.username}
                            style={{ backgroundColor: avatarColor(user.username) }}
                            title={`${user.username}${user.role === "guest" ? " [Guest]" : ""}`}
                        >
                            {user.username.charAt(0).toUpperCase()}
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
