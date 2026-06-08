const ROOM_PERMISSIONS = {
    "General chat": ["user", "guest"],
    "Project chat": ["user"],
    "Study chat": ["user"]
};

function canAccessRoom(role, roomName) {
    const allowed = ROOM_PERMISSIONS[roomName];
    if (!allowed) return false;
    return allowed.includes(role);
}

module.exports = {
    canAccessRoom
};
