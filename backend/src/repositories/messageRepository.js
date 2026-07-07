const Message = require("../models/Message");

class MessageRepository {
  async create(messageData) {
    return Message.create(messageData);
  }

  async findById(id) {
    return Message.findById(id);
  }

  async findRoomMessages(room, limit = 50) {
    return Message.find({ room, isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  async findPrivateMessages(privateChatId, limit = 50) {
    return Message.find({ privateChatId, isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  async updateMessage(id, updateData) {
    return Message.findByIdAndUpdate(id, updateData, { new: true });
  }

  async deleteMessage(id) {
    return Message.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
  }
}

module.exports = new MessageRepository();
