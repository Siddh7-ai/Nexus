const Task = require("../models/Task");

class TaskRepository {
  async create(taskData) {
    return Task.create(taskData);
  }

  async findById(id) {
    return Task.findById(id).populate("room_id");
  }

  async findRoomTasks(roomId) {
    return Task.find({ room_id: roomId }).lean();
  }

  async findUserTasks(assigneeId) {
    return Task.find({ assignee_id: assigneeId }).lean();
  }

  async updateTask(id, updateData) {
    return Task.findByIdAndUpdate(id, updateData, { new: true });
  }

  async deleteTask(id) {
    return Task.findByIdAndDelete(id);
  }
}

module.exports = new TaskRepository();
