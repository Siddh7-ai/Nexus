const User = require("../models/User");

class UserRepository {
  async findByUsername(username) {
    return User.findOne({ username: { $regex: new RegExp(`^${username}$`, "i") } });
  }

  async findByEmail(email) {
    return User.findOne({ email: email.toLowerCase() });
  }

  async findById(id) {
    return User.findById(id);
  }

  async create(userData) {
    return User.create(userData);
  }

  async update(id, updateData) {
    return User.findByIdAndUpdate(id, updateData, { new: true });
  }

  async findUsers(filter = {}, select = "") {
    return User.find(filter).select(select).lean();
  }
}

module.exports = new UserRepository();
