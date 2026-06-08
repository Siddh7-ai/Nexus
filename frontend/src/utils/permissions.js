export const ROOM_PERMISSIONS = {
  "General chat": ["user", "guest"],
  "Project chat": ["user"],
  "Study chat": ["user"],
};

export const FEATURE_PERMISSIONS = {
  privateChat: ["user"],
  userProfile: ["user"],
  fileSharing: ["user"],
};

export function canAccessRoom(role, roomName) {
  const allowed = ROOM_PERMISSIONS[roomName];
  if (!allowed) return false;
  return allowed.includes(role);
}

export function canAccessFeature(role, featureName) {
  const allowed = FEATURE_PERMISSIONS[featureName];
  if (!allowed) return false;
  return allowed.includes(role);
}
