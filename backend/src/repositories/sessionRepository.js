const Session = require("../models/Session");

class SessionRepository {
  async findByToken(token) {
    return Session.findOne({ token });
  }

  async findByFamilyId(familyId) {
    return Session.find({ familyId });
  }

  async create(sessionData) {
    return Session.create(sessionData);
  }

  async revokeFamily(familyId) {
    return Session.updateMany({ familyId }, { isRevoked: true });
  }

  async revokeSession(token) {
    return Session.updateOne({ token }, { isRevoked: true });
  }

  async deleteExpired() {
    return Session.deleteMany({ expiresAt: { $lt: new Date() } });
  }
}

module.exports = new SessionRepository();
