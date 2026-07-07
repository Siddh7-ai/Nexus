const ROOM_PERMISSIONS = {
    "Nexus Official": ["user", "guest"]
};

function canAccessRoom(role, roomName) {
    const allowed = ROOM_PERMISSIONS[roomName];
    if (!allowed) return false;
    return allowed.includes(role);
}

module.exports = {
    canAccessRoom
};
