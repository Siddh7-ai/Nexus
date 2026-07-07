const Task = require("../models/Task");
const Room = require("../models/Room");
const Message = require("../models/Message");
const logger = require("../utils/logger");

function startSLABreachChecker(io) {
  // Run SLA check every 2 minutes (120,000 ms)
  const intervalId = setInterval(async () => {
    try {
      logger.info("[SLA Checker] Running background breach verification...");
      const openTasks = await Task.find({
        status: { $in: ["open", "in_progress"] },
        room_id: { $ne: null }
      });

      const now = new Date();

      for (const task of openTasks) {
        const room = await Room.findById(task.room_id).populate("admin");
        if (!room || !room.admin) continue;

        // Determine threshold. Use room threshold if configured, otherwise default 48h
        const thresholdHours = room.slaThreshold || 48;
        const hoursElapsed = (now - new Date(task.createdAt)) / (1000 * 60 * 60);

        if (hoursElapsed > thresholdHours) {
          const adminUsername = room.admin.username;
          
          if (task.assignee_id !== adminUsername) {
            logger.info(`[SLA Escalation] Task "${task.title}" breached SLA. Reassigning from @${task.assignee_id} to room admin @${adminUsername}`);
            
            const oldAssignee = task.assignee_id;
            task.assignee_id = adminUsername;
            task.assignees = [adminUsername];
            await task.save();

            // Notify via Socket
            io.to(`user_${adminUsername.toLowerCase()}`).emit("taskAssigned", task);

            // Post a system message alert to the room chat!
            const systemMsgData = {
              username: "System",
              text: `🚨 **NexTask SLA Breach Alert:** The task **"${task.title}"** (assigned to @${oldAssignee}) has been open for ${Math.round(hoursElapsed)}h, exceeding the ${thresholdHours}h SLA threshold! It has been auto-reassigned to room admin @${adminUsername}.`,
              room: room._id.toString(),
              displayName: "System Bot",
              avatar: "",
              seenBy: [adminUsername]
            };

            const savedSystemMsg = await Message.create(systemMsgData);
            const clientMsg = savedSystemMsg.toObject();
            clientMsg.room = room.name;
            
            io.to(room._id.toString()).emit("reply", clientMsg);
          }
        }
      }
    } catch (err) {
      logger.error("[SLA Checker] Error in SLA background checker loop:", err);
    }
  }, 120000);

  return intervalId;
}

module.exports = {
  startSLABreachChecker
};
