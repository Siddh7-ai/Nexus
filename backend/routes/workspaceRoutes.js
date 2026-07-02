const express = require("express");
const router = express.Router();
const Task = require("../models/Task");
const Room = require("../models/Room");
const User = require("../models/User");
const { authenticateToken } = require("./userRoutes");

// In-Memory Rate Limiting for Workspace Bot
const botRateLimits = new Map(); // username -> { count, resetTime }

const checkBotRateLimit = (username) => {
    const now = Date.now();
    const limitDuration = 60 * 1000; // 1 minute
    const maxRequests = 5; // 5 requests per minute

    let limitInfo = botRateLimits.get(username);
    if (!limitInfo || now > limitInfo.resetTime) {
        limitInfo = { count: 1, resetTime: now + limitDuration };
        botRateLimits.set(username, limitInfo);
        return true;
    }

    if (limitInfo.count >= maxRequests) {
        return false;
    }

    limitInfo.count += 1;
    return true;
};

// Helper: Emits task assignment notification to assignee
const notifyAssignee = (req, task) => {
    if (!task.assignee_id || task.assignee_id === task.created_by) return;
    const io = req.app.get("io");
    if (io) {
        io.to(`user_${task.assignee_id.toLowerCase()}`).emit("taskAssigned", task);
    }
};

// 0. Get all Rooms the user belongs to (as admin or member) populated with member details for assignee listing
router.get("/rooms", authenticateToken, async (req, res) => {
    try {
        const rooms = await Room.find({
            $or: [
                { admin: req.user.userId },
                { members: req.user.userId }
            ]
        })
        .populate("admin", "username displayName avatar")
        .populate("members", "username displayName avatar");
        res.json(rooms);
    } catch (err) {
        console.error("Error fetching rooms for workspace switcher:", err);
        res.status(500).json({ message: "Server error fetching rooms" });
    }
});

// 1. Get all tasks and issues with dynamic room-scoping and permissions
router.get("/tasks", authenticateToken, async (req, res) => {
    try {
        const username = req.user.username;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        const roomId = req.query.room_id;
        const queryFilter = {};

        if (roomId === "personal" || !roomId) {
            queryFilter.room_id = null;
            queryFilter.$or = [
                { assignee_id: username },
                { created_by: username }
            ];
        } else {
            // Validate membership dynamically in Room model
            const room = await Room.findById(roomId);
            if (!room) {
                return res.status(404).json({ message: "Room not found" });
            }
            const isMember = room.admin.toString() === req.user.userId ||
                             room.members.some(mId => mId.toString() === req.user.userId);
            if (!isMember) {
                return res.status(403).json({ message: "Access denied. You are not a member of this room." });
            }
            queryFilter.room_id = room._id;
        }

        const finalFilter = { $and: [queryFilter] };

        if (req.query.status) {
            finalFilter.$and.push({ status: req.query.status });
        }
        if (req.query.priority) {
            finalFilter.$and.push({ priority: req.query.priority });
        }
        if (req.query.type) {
            finalFilter.$and.push({ type: req.query.type });
        }
        if (req.query.assignee_id) {
            finalFilter.$and.push({ assignee_id: req.query.assignee_id });
        }

        const totalTasks = await Task.countDocuments(finalFilter);
        const tasks = await Task.find(finalFilter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            tasks,
            page,
            totalPages: Math.ceil(totalTasks / limit),
            totalTasks
        });
    } catch (err) {
        console.error("Error fetching workspace tasks:", err);
        res.status(500).json({ message: "Server error fetching tasks" });
    }
});

// 2. Get single task by ID (Enforces room-scoped dynamic visibility)
router.get("/tasks/:id", authenticateToken, async (req, res) => {
    try {
        const username = req.user.username;
        const task = await Task.findById(req.params.id);
        if (!task) {
            return res.status(404).json({ message: "Task not found" });
        }

        if (task.room_id) {
            const room = await Room.findById(task.room_id);
            if (!room) {
                return res.status(404).json({ message: "Room not found" });
            }
            const isMember = room.admin.toString() === req.user.userId ||
                             room.members.some(mId => mId.toString() === req.user.userId);
            if (!isMember) {
                return res.status(403).json({ message: "Access denied. You are not a member of this room." });
            }
        } else {
            // Personal task
            const hasAccess = (task.created_by === username || task.assignee_id === username);
            if (!hasAccess) {
                return res.status(404).json({ message: "Task not found" });
            }
        }

        res.json(task);
    } catch (err) {
        console.error("Error fetching single task:", err);
        res.status(500).json({ message: "Server error fetching task" });
    }
});

// 3. Create a new task (Defaults visibility based on Room boundaries)
router.post("/tasks", authenticateToken, async (req, res) => {
    try {
        const username = req.user.username;
        const taskData = { ...req.body, created_by: username };

        if (taskData.room_id) {
            const room = await Room.findById(taskData.room_id).populate("admin");
            if (!room) {
                return res.status(404).json({ message: "Room not found" });
            }

            const isAdmin = room.admin._id.toString() === req.user.userId;
            const isMember = isAdmin || room.members.some(mId => mId.toString() === req.user.userId);

            if (!isMember) {
                return res.status(403).json({ message: "Access denied. You are not a member of this room." });
            }

            if (isAdmin) {
                // Admin user can create "task" or "issue", and assign to any room member/admin
                if (taskData.assignee_id) {
                    const assigneeUser = await User.findOne({ username: taskData.assignee_id });
                    if (!assigneeUser) {
                        return res.status(400).json({ message: "Assignee user not found" });
                    }
                    const isAssigneeMember = room.admin._id.toString() === assigneeUser._id.toString() ||
                                             room.members.some(mId => mId.toString() === assigneeUser._id.toString());
                    if (!isAssigneeMember) {
                        return res.status(400).json({ message: "Assignee is not a member of this room." });
                    }
                } else {
                    taskData.assignee_id = username;
                }
            } else {
                // Non-admin Room member
                // Only allowed to create issues
                if (taskData.type && taskData.type !== "issue") {
                    return res.status(403).json({ message: "Access denied. Room members can only create items of type: issue." });
                }
                taskData.type = "issue";
                // Assignee forced to Room admin username
                taskData.assignee_id = room.admin.username;
                // reported_by is set to the requester's username
                taskData.reported_by = username;
            }
        } else {
            // Personal workspace task
            taskData.room_id = null;
            if (taskData.assignee_id) {
                const assigneeUser = await User.findOne({ username: taskData.assignee_id });
                if (!assigneeUser) {
                    taskData.assignee_id = username;
                }
            } else {
                taskData.assignee_id = username;
            }
        }

        const task = new Task(taskData);
        await task.save();

        // Trigger socket notification to assignee
        notifyAssignee(req, task);

        res.status(201).json(task);
    } catch (err) {
        console.error("Error creating task:", err);
        res.status(500).json({ message: "Server error creating task" });
    }
});

// 4. Update a task (Restricted based on workspace roles)
router.put("/tasks/:id", authenticateToken, async (req, res) => {
    try {
        const username = req.user.username;
        const task = await Task.findById(req.params.id);
        if (!task) {
            return res.status(404).json({ message: "Task not found" });
        }

        const oldAssignee = task.assignee_id;
        let isRoomAdmin = false;

        if (task.room_id) {
            const room = await Room.findById(task.room_id).populate("admin");
            if (!room) {
                return res.status(404).json({ message: "Room not found" });
            }
            isRoomAdmin = room.admin._id.toString() === req.user.userId;
            const isMember = isRoomAdmin || room.members.some(mId => mId.toString() === req.user.userId);
            if (!isMember) {
                return res.status(403).json({ message: "Access denied. You are not a member of this room." });
            }

            if (!isRoomAdmin && task.assignee_id === username) {
                // Room member assignee can update status and checklist
                if (req.body.status !== undefined) task.status = req.body.status;
                if (req.body.checklist !== undefined) task.checklist = req.body.checklist;
            } else if (isRoomAdmin) {
                // Room admin gets full update permissions
                const fields = ["title", "description", "status", "priority", "due_date", "start_date", "assignee_id", "severity", "visibility", "type", "checklist"];
                fields.forEach(field => {
                    if (req.body[field] !== undefined) {
                        task[field] = req.body[field];
                    }
                });
            } else {
                return res.status(403).json({ message: "Access denied. Unauthorized to update this task." });
            }
        } else {
            // Personal workspace task
            const isCreator = task.created_by === username;
            const isAssignee = task.assignee_id === username;

            if (!isCreator && !isAssignee) {
                return res.status(403).json({ message: "Access denied. Unauthorized to update this task." });
            }

            if (isCreator) {
                const fields = ["title", "description", "status", "priority", "due_date", "start_date", "assignee_id", "severity", "visibility", "type", "checklist"];
                fields.forEach(field => {
                    if (req.body[field] !== undefined) {
                        task[field] = req.body[field];
                    }
                });
            } else if (isAssignee) {
                if (req.body.status !== undefined) task.status = req.body.status;
                if (req.body.checklist !== undefined) task.checklist = req.body.checklist;
            }
        }

        await task.save();

        // Emit assignment notification if assignee changed
        if (task.assignee_id !== oldAssignee) {
            notifyAssignee(req, task);
        }

        res.json(task);
    } catch (err) {
        console.error("Error updating task:", err);
        res.status(500).json({ message: "Server error updating task" });
    }
});

// 5. Delete a task (Restricted to Room admin or personal task creator)
router.delete("/tasks/:id", authenticateToken, async (req, res) => {
    try {
        const username = req.user.username;
        const task = await Task.findById(req.params.id);
        if (!task) {
            return res.status(404).json({ message: "Task not found" });
        }

        if (task.room_id) {
            const room = await Room.findById(task.room_id);
            if (!room) {
                return res.status(404).json({ message: "Room not found" });
            }
            const isRoomAdmin = room.admin.toString() === req.user.userId;
            if (!isRoomAdmin) {
                return res.status(403).json({ message: "Access denied. Only the room admin can delete room tasks." });
            }
        } else {
            // Personal task
            if (task.created_by !== username) {
                return res.status(403).json({ message: "Access denied. Only the task creator can delete personal tasks." });
            }
        }

        await Task.deleteOne({ _id: task._id });
        res.json({ message: "Task deleted successfully" });
    } catch (err) {
        console.error("Error deleting task:", err);
        res.status(500).json({ message: "Server error deleting task" });
    }
});

// 6. Conversational AI Bot Endpoint (Rate Limited, Fallback NLP Parser)
router.post("/bot/chat", authenticateToken, async (req, res) => {
    const username = req.user.username;
    const { prompt, room_id } = req.body;

    if (!prompt || !prompt.trim()) {
        return res.status(400).json({ message: "Prompt is required" });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    // Apply Rate Limiting if utilizing a paid external LLM provider
    if (apiKey) {
        const allowed = checkBotRateLimit(username);
        if (!allowed) {
            return res.status(429).json({ message: "Too many requests. Please wait a minute before messaging the AI bot again." });
        }
    }

    // ASR / voice note transcription flag helper
    const isTranscribedText = prompt.includes("[ASR Transcript]");
    const cleanPrompt = prompt.replace(/\[ASR Transcript\]/g, "").trim();
    const lowerPrompt = cleanPrompt.toLowerCase();

    try {
        // Fetch all active workspace tasks for context
        let query = {};
        if (room_id && room_id !== "personal") {
            query.room_id = room_id;
        } else {
            query.room_id = null;
            query.$or = [
                { assignee_id: username },
                { created_by: username }
            ];
        }
        const tasks = await Task.find(query);

        // Greetings and Help intents
        const greetings = ["hello", "hi", "hey", "hola", "yo", "greetings"];
        const isGreeting = greetings.some(g => lowerPrompt === g || lowerPrompt.startsWith(g + " ") || lowerPrompt.endsWith(" " + g));

        const helpRequests = ["who are you", "what can you do", "help", "how do you work", "commands"];
        const isHelpRequest = helpRequests.some(h => lowerPrompt.includes(h));

        // Workspace keywords to check query context
        const workspaceKeywords = [
            "task", "issue", "bug", "ticket", "work", "assignee", "assign", "priority", 
            "sla", "status", "summary", "create", "add", "open", "resolve", "complete", 
            "todo", "progress", "member", "room", "workspace", "severity", "due", "overdue", "list"
        ];
        const isWorkspaceQuery = workspaceKeywords.some(kw => lowerPrompt.includes(kw));

        // A helper to detect creation intent
        const isCreationIntent = /(?:create|add|open|new|make|register)\s+(?:task|issue|bug|ticket)/i.test(lowerPrompt) ||
                                 lowerPrompt.startsWith("create ") || lowerPrompt.startsWith("add ") || lowerPrompt.startsWith("new ");

        // Local Fallback Parser function
        const runFallbackParser = async () => {
            // Check for Escape Guard
            if (!isGreeting && !isHelpRequest && !isWorkspaceQuery && !isCreationIntent) {
                return { reply: "I'm not made for this. I can only do workspace-related work." };
            }

            if (isGreeting) {
                return { reply: "🤖 **Workspace AI Assistant:** Hello! How can I help you manage your tasks or issues in your workspace today?" };
            }

            if (isHelpRequest) {
                let helpText = "🤖 **Workspace AI Assistant:** I am your dedicated workspace assistant. I can help you create, list, and summarize tasks and issues.\n\n";
                helpText += "**Available workspace actions:**\n";
                helpText += "*   **Create items:** 'Create a critical task for Rahul due tomorrow' or 'Open a high severity issue for Siddh'\n";
                helpText += "*   **List items:** 'Show my tasks', 'What is Siddh working on?', or 'List all open issues'\n";
                helpText += "*   **Summarize workspace status:** 'Workspace summary' or 'How many tasks do we have?'\n";
                helpText += "*   **Track breached SLAs:** 'Show breached issues'\n\n";
                helpText += "*Note: I can only answer workspace-related queries. Other topics are outside my scope.*";
                return { reply: helpText };
            }

            // Creation Intent Parser
            if (isCreationIntent) {
                let type = "task";
                let title = "";
                let priority = "medium";
                let assignee = username;
                let severity = "medium";
                let reportedBy = username;
                let status = "open";

                // Detect Issue vs Task
                if (lowerPrompt.includes("issue") || lowerPrompt.includes("bug") || lowerPrompt.includes("problem") || lowerPrompt.includes("ticket") || lowerPrompt.includes("error")) {
                    type = "issue";
                }

                // Extract title
                const titleRegex = /(?:create|add|open|new)\s+(?:task|issue|bug|ticket)?[:\s]+(.*?)(?:\s+(?:for|assign|priority|due|severity|reporter)\b|$)/i;
                const matchTitle = cleanPrompt.match(titleRegex);
                if (matchTitle && matchTitle[1]) {
                    title = matchTitle[1].trim();
                } else {
                    title = cleanPrompt.split(/[.!?]/)[0].substring(0, 80);
                }

                // Extract priority
                if (lowerPrompt.includes("high") || lowerPrompt.includes("critical")) {
                    priority = lowerPrompt.includes("critical") ? "critical" : "high";
                } else if (lowerPrompt.includes("low")) {
                    priority = "low";
                }

                // Extract severity (issues)
                if (lowerPrompt.includes("severe") || lowerPrompt.includes("critical") || lowerPrompt.includes("blocker")) {
                    severity = "critical";
                } else if (lowerPrompt.includes("major") || lowerPrompt.includes("high")) {
                    severity = "high";
                } else if (lowerPrompt.includes("minor") || lowerPrompt.includes("low")) {
                    severity = "low";
                }

                // Extract assignee
                const assigneeRegex = /(?:assignee|assign|for|to)\s+([a-zA-Z0-9_-]+)/i;
                const matchAssignee = lowerPrompt.match(assigneeRegex);
                if (matchAssignee && matchAssignee[1]) {
                    const possibleAssignee = matchAssignee[1].trim();
                    const exists = await User.findOne({ username: new RegExp(`^${possibleAssignee}$`, "i") });
                    if (exists) {
                        assignee = exists.username;
                    }
                }

                // Extract due date
                let dueDate = null;
                if (lowerPrompt.includes("tomorrow")) {
                    dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
                } else if (lowerPrompt.includes("next week") || lowerPrompt.includes("in a week")) {
                    dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                } else {
                    const dateRegex = /\b(\d{4}-\d{2}-\d{2})\b/;
                    const matchDate = lowerPrompt.match(dateRegex);
                    if (matchDate && matchDate[1]) {
                        dueDate = new Date(matchDate[1]);
                    }
                }

                // Scoping & validation for Room Workspaces
                let targetRoomId = room_id || null;
                if (targetRoomId && targetRoomId !== "personal") {
                    const room = await Room.findById(targetRoomId).populate("admin");
                    if (!room) {
                        throw new Error("Room not found");
                    }
                    const isAdmin = room.admin._id.toString() === req.user.userId;
                    const isMember = isAdmin || room.members.some(mId => mId.toString() === req.user.userId);
                    if (!isMember) {
                        throw new Error("Access denied. You are not a member of this room.");
                    }

                    if (isAdmin) {
                        if (assignee) {
                            const assigneeUser = await User.findOne({ username: assignee });
                            if (assigneeUser) {
                                const isAssigneeMember = room.admin._id.toString() === assigneeUser._id.toString() ||
                                                         room.members.some(mId => mId.toString() === assigneeUser._id.toString());
                                if (!isAssigneeMember) {
                                    assignee = room.admin.username;
                                }
                            } else {
                                assignee = room.admin.username;
                            }
                        } else {
                            assignee = username;
                        }
                    } else {
                        type = "issue";
                        assignee = room.admin.username;
                        reportedBy = username;
                    }
                } else {
                    targetRoomId = null;
                    if (assignee) {
                        const assigneeUser = await User.findOne({ username: assignee });
                        if (!assigneeUser) {
                            assignee = username;
                        }
                    } else {
                        assignee = username;
                    }
                }

                const task = new Task({
                    title: title || "New Task from AI Bot",
                    description: `Automatically parsed from user command: "${cleanPrompt}"${isTranscribedText ? " (Transcribed from Voice Note)" : ""}`,
                    type,
                    assignee_id: assignee,
                    priority,
                    severity,
                    status,
                    due_date: dueDate,
                    reported_by: type === "issue" ? reportedBy : null,
                    created_by: username,
                    room_id: targetRoomId
                });

                await task.save();
                notifyAssignee(req, task);

                let reply = `🤖 **Workspace Bot:** I've parsed your request and created a new **${type}**:\n\n`;
                reply += `*   **Title:** ${task.title}\n`;
                reply += `*   **Assignee:** ${task.assignee_id}\n`;
                reply += `*   **Priority:** ${task.priority}\n`;
                if (dueDate) reply += `*   **Due Date:** ${dueDate.toLocaleDateString()}\n`;
                if (type === "issue") reply += `*   **Severity:** ${task.severity}\n`;
                reply += `\n*(Note: ANTHROPIC_API_KEY is not configured on the server, running in smart NLP parsing fallback mode.)*`;

                return { reply, task };
            }

            // Lookup / Query Intents
            // A. Breached SLA support issues
            if (lowerPrompt.includes("breach") || lowerPrompt.includes("sla") || lowerPrompt.includes("overdue") || lowerPrompt.includes("late")) {
                const slaThresholdHours = 48; 
                const breached = tasks.filter(t => {
                    if (t.type !== "issue" || t.status === "resolved") return false;
                    const hoursElapsed = (Date.now() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60);
                    return hoursElapsed > slaThresholdHours;
                });

                if (breached.length === 0) {
                    return { reply: "🤖 **Workspace AI Assistant:** There are no breached support issues in the active workspace. Good job!" };
                }

                let reply = `🤖 **Workspace AI Assistant:** Found **${breached.length}** breached issues in this workspace:\n\n`;
                breached.forEach((t, i) => {
                    const hours = Math.round((Date.now() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60));
                    reply += `${i + 1}. **${t.title}** (Assigned to: @${t.assignee_id}) — Opened ${hours} hours ago (Breached SLA)\n`;
                });
                return { reply };
            }

            // B. Assignee tasks
            const allUsers = await User.find({}, "username");
            let mentionedUser = null;
            for (const u of allUsers) {
                const uName = u.username.toLowerCase();
                const regex = new RegExp(`\\b${uName}\\b`, "i");
                if (regex.test(lowerPrompt)) {
                    mentionedUser = u.username;
                    break;
                }
            }

            if (mentionedUser) {
                const userTasks = tasks.filter(t => t.assignee_id && t.assignee_id.toLowerCase() === mentionedUser.toLowerCase() && t.status !== "completed" && t.status !== "resolved");
                const assigneeLabel = mentionedUser.toLowerCase() === username.toLowerCase() ? "you" : `@${mentionedUser}`;
                
                if (userTasks.length === 0) {
                    return { reply: `🤖 **Workspace AI Assistant:** There are no active tasks assigned to ${assigneeLabel} in this workspace.` };
                }

                let reply = `🤖 **Workspace AI Assistant:** Here are the active items assigned to ${assigneeLabel} in this workspace:\n\n`;
                userTasks.forEach((t, i) => {
                    reply += `*   **${t.title}** (Type: ${t.type}, Priority: ${t.priority}, Status: ${t.status})\n`;
                });
                return { reply };
            }

            // C. Summary / Statistics
            if (lowerPrompt.includes("summary") || lowerPrompt.includes("status of") || lowerPrompt.includes("how many") || lowerPrompt.includes("report") || lowerPrompt.includes("statistics") || lowerPrompt.includes("stats")) {
                const total = tasks.length;
                const open = tasks.filter(t => t.status === "open").length;
                const inProgress = tasks.filter(t => t.status === "in_progress" || t.status === "investigating").length;
                const completed = tasks.filter(t => t.status === "completed" || t.status === "resolved").length;
                const criticalCount = tasks.filter(t => t.priority === "critical" && t.status !== "completed" && t.status !== "resolved").length;
                const issuesCount = tasks.filter(t => t.type === "issue" && t.status !== "resolved").length;

                let reply = `🤖 **Workspace AI Assistant:** Here is the status summary for this workspace:\n\n`;
                reply += `*   **Total Items:** ${total}\n`;
                reply += `*   **Open Tasks (To Do):** ${open}\n`;
                reply += `*   **In Progress / Investigating:** ${inProgress}\n`;
                reply += `*   **Completed / Resolved:** ${completed}\n`;
                reply += `*   **Active Support Issues:** ${issuesCount}\n`;
                reply += `*   **Critical Unresolved Items:** ${criticalCount}\n\n`;
                if (criticalCount > 0) {
                    reply += `⚠️ *Note: There are unresolved critical items that require immediate attention.*`;
                } else {
                    reply += `✅ *All clear: No unresolved critical items.*`;
                }
                return { reply };
            }

            // D. Priority queries
            if (lowerPrompt.includes("critical") || lowerPrompt.includes("high priority")) {
                const critTasks = tasks.filter(t => (t.priority === "critical" || t.priority === "high") && t.status !== "completed" && t.status !== "resolved");
                if (critTasks.length === 0) {
                    return { reply: "🤖 **Workspace AI Assistant:** There are no unresolved critical or high priority items in this workspace." };
                }

                let reply = `🤖 **Workspace AI Assistant:** Found **${critTasks.length}** unresolved high priority / critical items:\n\n`;
                critTasks.forEach((t, i) => {
                    reply += `${i + 1}. **${t.title}** (Priority: ${t.priority}, Assigned to: @${t.assignee_id})\n`;
                });
                return { reply };
            }

            // E. General User List / Pendings
            if (lowerPrompt.includes("my tasks") || lowerPrompt.includes("what are my") || lowerPrompt.includes("show my") || lowerPrompt.includes("assigned to me")) {
                const myActiveTasks = tasks.filter(t => t.assignee_id === username && t.status !== "completed" && t.status !== "resolved");
                if (myActiveTasks.length === 0) {
                    return { reply: "🤖 **Workspace AI Assistant:** You have no pending tasks assigned in this workspace!" };
                }
                let reply = `🤖 **Workspace AI Assistant:** Here are your active tasks:\n\n`;
                myActiveTasks.forEach((t, i) => {
                    reply += `*   **${t.title}** (Priority: ${t.priority}, Type: ${t.type})\n`;
                });
                return { reply };
            }

            // F. Tasks / Issues / List search keywords
            if (lowerPrompt.includes("tasks") || lowerPrompt.includes("issues") || lowerPrompt.includes("items") || lowerPrompt.includes("list")) {
                const active = tasks.filter(t => t.status !== "completed" && t.status !== "resolved");
                if (active.length === 0) {
                    return { reply: "🤖 **Workspace AI Assistant:** There are no active tasks or issues in this workspace." };
                }
                let reply = `🤖 **Workspace AI Assistant:** Here are all active items in this workspace:\n\n`;
                active.forEach((t, i) => {
                    reply += `*   **${t.title}** (Assigned to: @${t.assignee_id}, Type: ${t.type}, Status: ${t.status})\n`;
                });
                return { reply };
            }

            // G. Keyword Search Fallback
            const searchTerms = lowerPrompt.split(/\s+/).filter(word => word.length > 3 && !workspaceKeywords.includes(word));
            if (searchTerms.length > 0) {
                const matches = tasks.filter(t => {
                    return searchTerms.some(term => t.title.toLowerCase().includes(term) || (t.description && t.description.toLowerCase().includes(term)));
                });

                if (matches.length > 0) {
                    let reply = `🤖 **Workspace AI Assistant:** I found **${matches.length}** items matching your query:\n\n`;
                    matches.forEach((t, i) => {
                        reply += `*   **${t.title}** (Assigned to: @${t.assignee_id}, Status: ${t.status})\n`;
                    });
                    return { reply };
                }
            }

            return { reply: "🤖 **Workspace AI Assistant:** I'm not sure how to answer that specific question, but I can help you list tasks, show a summary, or create new items! Try asking: 'Show my tasks' or 'Workspace summary'." };
        };

        // If API Key is present, run Claude messages integration
        if (apiKey) {
            const activeTasksSummary = tasks.map(t => {
                return `- Title: "${t.title}", Type: "${t.type}", Assignee: "${t.assignee_id}", Priority: "${t.priority}", Status: "${t.status}", Due Date: "${t.due_date ? new Date(t.due_date).toLocaleDateString() : 'N/A'}", Severity: "${t.severity || 'N/A'}", Created By: "${t.created_by}"`;
            }).join("\n");

            const systemInstruction = `You are a dedicated Workspace AI Assistant. You can create tasks and issues, answer questions about the current workspace tasks, and list them.

Here are all active tasks and issues in this workspace:
${activeTasksSummary}

Your constraints:
1. ONLY assist with workspace-related work (creating, listing, detailing, and summarizing tasks or issues).
2. If the user asks anything unrelated to the workspace (e.g. general knowledge, writing code, jokes, other topics), you MUST strictly reply with EXACTLY: "I'm not made for this. I can only do workspace-related work."
3. You have a tool called "create_task" which you can invoke to create items when the user asks you to create/open/add a task or issue.`;

            const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
            const response = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                    "x-api-key": apiKey,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                },
                body: JSON.stringify({
                    model: "claude-3-5-sonnet-20241022",
                    max_tokens: 1024,
                    system: systemInstruction,
                    messages: [{ role: "user", content: prompt }],
                    tools: [{
                        name: "create_task",
                        description: "Creates a new task or issue in the workspace.",
                        input_schema: {
                            type: "object",
                            properties: {
                                title: { type: "string", description: "Title of the task/issue" },
                                description: { type: "string", description: "Description or detail of the task" },
                                type: { type: "string", enum: ["task", "issue"], description: "Type of item" },
                                due_date: { type: "string", description: "Due date in YYYY-MM-DD format" },
                                assignee: { type: "string", description: "Username of assignee (defaults to self if not specified)" },
                                priority: { type: "string", enum: ["low", "medium", "high", "critical"], description: "Priority level" },
                                severity: { type: "string", enum: ["low", "medium", "high", "critical"], description: "Severity of issue (required if type is issue)" },
                                reported_by: { type: "string", description: "Reporter username (for issue)" }
                            },
                            required: ["title"]
                        }
                    }]
                })
            });

            if (response.ok) {
                const data = await response.json();
                
                // Check if user is asking non-workspace queries and Claude returns non-workspace answer (guard against Claude escaping instructions)
                const textRes = data.content.find(c => c.type === "text");
                const replyText = textRes ? textRes.text : "";
                
                // Run a validation checklist on Claude text response
                const lowerReply = replyText.toLowerCase();
                const isNonWorkspaceReply = !workspaceKeywords.some(kw => lowerReply.includes(kw)) && 
                                            !lowerPrompt.split(/\s+/).some(w => workspaceKeywords.includes(w.toLowerCase()));
                if (isNonWorkspaceReply && lowerPrompt !== "hello" && lowerPrompt !== "hi") {
                    return res.json({ reply: "I'm not made for this. I can only do workspace-related work." });
                }

                const toolCall = data.content.find(c => c.type === "tool_use");

                if (toolCall && toolCall.name === "create_task") {
                    const args = toolCall.input;
                    let targetAssignee = username;
                    let targetType = args.type || "task";
                    let targetReportedBy = args.type === "issue" ? (args.reported_by || username) : null;
                    let targetRoomId = room_id || null;

                    if (targetRoomId && targetRoomId !== "personal") {
                        const room = await Room.findById(targetRoomId).populate("admin");
                        if (!room) {
                            return res.status(404).json({ message: "Room not found" });
                        }
                        const isAdmin = room.admin._id.toString() === req.user.userId;
                        const isMember = isAdmin || room.members.some(mId => mId.toString() === req.user.userId);
                        if (!isMember) {
                            return res.status(403).json({ message: "Access denied. You are not a member of this room." });
                        }

                        if (isAdmin) {
                            if (args.assignee) {
                                const targetUser = await User.findOne({ username: new RegExp(`^${args.assignee}$`, "i") });
                                if (targetUser) {
                                    const isAssigneeMember = room.admin._id.toString() === targetUser._id.toString() ||
                                                             room.members.some(mId => mId.toString() === targetUser._id.toString());
                                    if (isAssigneeMember) {
                                        targetAssignee = targetUser.username;
                                    } else {
                                        targetAssignee = room.admin.username;
                                    }
                                } else {
                                    targetAssignee = room.admin.username;
                                }
                            }
                        } else {
                            targetType = "issue";
                            targetAssignee = room.admin.username;
                            targetReportedBy = username;
                        }
                    } else {
                        targetRoomId = null;
                        if (args.assignee) {
                            const targetUser = await User.findOne({ username: new RegExp(`^${args.assignee}$`, "i") });
                            if (targetUser) targetAssignee = targetUser.username;
                        }
                    }

                    const task = new Task({
                        title: args.title,
                        description: args.description || "Created via Workspace AI Assistant.",
                        type: targetType,
                        assignee_id: targetAssignee,
                        priority: args.priority || "medium",
                        severity: args.severity || "medium",
                        status: "open",
                        due_date: args.due_date ? new Date(args.due_date) : null,
                        reported_by: targetType === "issue" ? targetReportedBy : null,
                        created_by: username,
                        room_id: targetRoomId
                    });

                    await task.save();
                    notifyAssignee(req, task);

                    let reply = `🤖 **Workspace Bot:** I've invoked my tool to successfully create the following workspace item:\n\n`;
                    reply += `*   **Title:** ${task.title}\n`;
                    reply += `*   **Type:** ${task.type}\n`;
                    reply += `*   **Assignee:** ${task.assignee_id}\n`;
                    reply += `*   **Priority:** ${task.priority}\n`;
                    if (task.due_date) reply += `*   **Due Date:** ${task.due_date.toLocaleDateString()}\n`;
                    
                    return res.json({ reply, task });
                }

                return res.json({ reply: replyText || "How else can I assist you with your tasks today?" });
            } else {
                console.error("Anthropic Claude API returned an error:", await response.text());
                const { reply, task } = await runFallbackParser();
                return res.json({ reply, task });
            }
        } else {
            const { reply, task } = await runFallbackParser();
            return res.json({ reply, task });
        }
    } catch (err) {
        console.error("Bot chat failed:", err);
        return res.status(500).json({ message: "Workspace Bot service error" });
    }
});

module.exports = router;
