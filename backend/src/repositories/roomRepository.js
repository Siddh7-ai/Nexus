const Room = require("../models/Room");

class RoomRepository {
  async create(roomData) {
    return Room.create(roomData);
  }

  async findById(id) {
    return Room.findById(id).populate("admin", "username displayName avatar");
  }

  async findByCode(code) {
    return Room.findOne({ code }).populate("admin", "username displayName avatar");
  }

  async findUserRooms(userId) {
    return Room.find({ members: userId }).populate("admin", "username displayName avatar").lean();
  }

  async updateRoom(id, updateData) {
    return Room.findByIdAndUpdate(id, updateData, { new: true });
  }

  async deleteRoom(id) {
    return Room.findByIdAndDelete(id);
  }
}

module.exports = new RoomRepository();
