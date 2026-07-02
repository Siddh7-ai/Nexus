import React, { useState, useEffect, useRef } from "react";
import { FiBriefcase, FiMessageSquare, FiPlus, FiFilter, FiSearch, FiClock, FiCornerUpRight, FiUnlock, FiLock, FiAlertTriangle, FiSend, FiX, FiCheck, FiPlay, FiTrash2, FiUser, FiUsers, FiChevronDown } from "react-icons/fi";
import { getBackendUrl } from "../utils/config";
import "./Workspace.css";
import { CustomSelect } from "./CustomSelect";

const getAuthToken = () => {
    return sessionStorage.getItem("token") || localStorage.getItem("token");
};

const renderFormattedText = (text) => {
    if (!text) return "";
    const parts = text.split("**");
    return parts.map((part, index) => {
        if (index % 2 === 1) {
            return <strong key={index}>{part}</strong>;
        }
        return part;
    });
};

export default function WorkspacePage({ myUsername, token, theme, onNavigateToMessage, socket }) {
    const [activeTab, setActiveTab] = useState("board"); // "board" or "bot"
    const [tasks, setTasks] = useState([]);
    const [users, setUsers] = useState([]);
    const [loadingTasks, setLoadingTasks] = useState(true);

    // Filter states
    const [searchFilter, setSearchFilter] = useState("");
    const [assigneeFilter, setAssigneeFilter] = useState("");
    const [priorityFilter, setPriorityFilter] = useState("");
    const [typeFilter, setTypeFilter] = useState("");

    // SLA Config (Hours)
    const [slaThreshold, setSlaThreshold] = useState(() => {
        const cached = localStorage.getItem("nexus_sla_threshold");
        return cached ? parseInt(cached) : 48;
    });

    // Detail modal states
    const [selectedTask, setSelectedTask] = useState(null);
    const [isCreating, setIsCreating] = useState(false);

    // Workspace switcher states
    const [rooms, setRooms] = useState([]);
    const [selectedWorkspace, setSelectedWorkspace] = useState("personal");
    const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false);
    const workspaceDropdownRef = useRef(null);

    // Close workspace dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (workspaceDropdownRef.current && !workspaceDropdownRef.current.contains(event.target)) {
                setIsWorkspaceDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const activeRoom = rooms.find(r => r._id === selectedWorkspace);
    const isRoomWorkspace = !!activeRoom;
    const isRoomAdmin = activeRoom ? (activeRoom.admin?.username === myUsername) : false;
    const isNonAdminMember = isRoomWorkspace && !isRoomAdmin;

    const getAssigneeOptions = () => {
        if (isRoomWorkspace && activeRoom) {
            const list = [];
            if (activeRoom.admin) {
                list.push(activeRoom.admin);
            }
            if (activeRoom.members) {
                activeRoom.members.forEach(m => {
                    if (activeRoom.admin && m._id === activeRoom.admin._id) return;
                    list.push(m);
                });
            }
            return list;
        }
        return users;
    };

    // New task form state
    const [taskForm, setTaskForm] = useState({
        title: "",
        description: "",
        type: "task",
        priority: "medium",
        assignee_id: myUsername,
        due_date: "",
        visibility: "workspace",
        severity: "medium"
    });

    // Workspace Bot states
    const [botMessages, setBotMessages] = useState(() => {
        const cached = localStorage.getItem("nexus_bot_messages");
        if (cached) {
            try {
                return JSON.parse(cached);
            } catch (e) {}
        }
        return [
            {
                sender: "bot",
                text: "Hello! I am your Workspace AI Assistant. You can ask me to create tasks or issues by typing natural language commands like:\n\n*   `Create high priority task to review frontend PR for Siddh due tomorrow`\n*   `Open critical severity issue Login auth bug for Rahul`"
            }
        ];
    });
    const [botInput, setBotInput] = useState("");
    const [botLoading, setBotLoading] = useState(false);
    const messagesEndRef = useRef(null);

    // Fetch rooms & users list on mount
    useEffect(() => {
        fetchRooms();
        fetchUsers();
    }, []);

    // Fetch tasks whenever selectedWorkspace changes
    useEffect(() => {
        fetchTasks();
    }, [selectedWorkspace]);

    // Listen to real-time task updates via Socket.IO if window.nexusSocket exists
    useEffect(() => {
        const socket = window.nexusSocket;
        if (!socket) return;

        const handleTaskUpdated = (updatedTask) => {
            setTasks(prev => {
                const exists = prev.some(t => t._id === updatedTask._id);
                if (exists) {
                    return prev.map(t => t._id === updatedTask._id ? updatedTask : t);
                } else {
                    return [updatedTask, ...prev];
                }
            });
        };

        socket.on("taskUpdated", handleTaskUpdated);
        // Refresh when a task assignment notification arrives
        socket.on("taskAssigned", (task) => {
            fetchTasks();
        });

        return () => {
            socket.off("taskUpdated", handleTaskUpdated);
        };
    }, []);

    // Persist bot messages to localStorage
    useEffect(() => {
        localStorage.setItem("nexus_bot_messages", JSON.stringify(botMessages));
        scrollToBottom();
    }, [botMessages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const fetchRooms = async () => {
        try {
            const tokenVal = getAuthToken();
            const res = await fetch(`${getBackendUrl()}/api/workspace/rooms`, {
                headers: { "Authorization": `Bearer ${tokenVal}` }
            });
            if (res.ok) {
                const data = await res.json();
                setRooms(data || []);
            }
        } catch (err) {
            console.error("Error loading rooms list:", err);
        }
    };

    const fetchTasks = async () => {
        setLoadingTasks(true);
        try {
            const tokenVal = getAuthToken();
            const url = `${getBackendUrl()}/api/workspace/tasks?room_id=${selectedWorkspace}&limit=200`;
            const res = await fetch(url, {
                headers: { "Authorization": `Bearer ${tokenVal}` }
            });
            if (res.ok) {
                const data = await res.json();
                setTasks(data.tasks || []);
            }
        } catch (err) {
            console.error("Error loading tasks:", err);
        } finally {
            setLoadingTasks(false);
        }
    };

    const fetchUsers = async () => {
        try {
            const tokenVal = getAuthToken();
            const res = await fetch(`${getBackendUrl()}/api/user/list`, {
                headers: { "Authorization": `Bearer ${tokenVal}` }
            });
            if (res.ok) {
                const data = await res.json();
                setUsers(data.users || []);
            }
        } catch (err) {
            console.error("Error loading users list:", err);
        }
    };

    const handleShareToChat = (task) => {
        if (!socket || !activeRoom) return;
        const taskText = `📋 **Workspace Item Shared**:\n\n*   **Title:** ${task.title}\n*   **Type:** ${task.type.toUpperCase()}\n*   **Priority:** ${task.priority.toUpperCase()}\n*   **Assignee:** @${task.assignee_id}\n*   **Status:** ${task.status.replace("_", " ").toUpperCase()}${task.description ? `\n*   **Description:** ${task.description}` : ""}`;
        socket.emit("message", {
            text: taskText,
            room: activeRoom._id,
            tempId: "share_" + Date.now()
        });
        alert(`Shared task "${task.title}" to chat room!`);
    };

    const handleQuickAssign = async (taskId) => {
        // Optimistic update
        setTasks(prev => prev.map(t => t._id === taskId ? { ...t, assignee_id: myUsername } : t));

        try {
            const tokenVal = getAuthToken();
            await fetch(`${getBackendUrl()}/api/workspace/tasks/${taskId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tokenVal}`
                },
                body: JSON.stringify({ assignee_id: myUsername })
            });
        } catch (err) {
            console.error("Error in quick assign:", err);
            fetchTasks();
        }
    };

    const handleQuickComplete = async (taskId, taskType) => {
        const nextStatus = taskType === "issue" ? "resolved" : "completed";
        // Optimistic update
        setTasks(prev => prev.map(t => t._id === taskId ? { ...t, status: nextStatus } : t));

        try {
            const tokenVal = getAuthToken();
            await fetch(`${getBackendUrl()}/api/workspace/tasks/${taskId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tokenVal}`
                },
                body: JSON.stringify({ status: nextStatus })
            });
        } catch (err) {
            console.error("Error in quick complete:", err);
            fetchTasks();
        }
    };

    // Drag and Drop handlers
    const onDragStart = (e, taskId) => {
        e.dataTransfer.setData("text/plain", taskId);
    };

    const onDragOver = (e) => {
        e.preventDefault();
    };

    const onDrop = async (e, targetStatus) => {
        e.preventDefault();
        const taskId = e.dataTransfer.getData("text/plain");
        if (!taskId) return;

        const currentTask = tasks.find(t => t._id === taskId);
        if (!currentTask) return;

        let targetType = currentTask.type;
        if (targetStatus === "investigating") {
            targetType = "issue";
        } else if (targetStatus === "open" || targetStatus === "in_progress" || targetStatus === "completed") {
            targetType = "task";
        }

        // Optimistic update
        setTasks(prev => prev.map(t => t._id === taskId ? { ...t, status: targetStatus, type: targetType } : t));

        try {
            const tokenVal = getAuthToken();
            const res = await fetch(`${getBackendUrl()}/api/workspace/tasks/${taskId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tokenVal}`
                },
                body: JSON.stringify({ status: targetStatus, type: targetType })
            });
            if (!res.ok) {
                // Rollback on failure
                fetchTasks();
            }
        } catch (err) {
            console.error("Error dropping task:", err);
            fetchTasks();
        }
    };

    // Filter helper
    const getFilteredTasks = () => {
        return tasks.filter(t => {
            const matchesSearch = t.title.toLowerCase().includes(searchFilter.toLowerCase()) || 
                                  t.description.toLowerCase().includes(searchFilter.toLowerCase());
            const matchesAssignee = assigneeFilter === "" || t.assignee_id === assigneeFilter;
            const matchesPriority = priorityFilter === "" || t.priority === priorityFilter;
            const matchesType = typeFilter === "" || t.type === typeFilter;
            return matchesSearch && matchesAssignee && matchesPriority && matchesType;
        });
    };

    // SLA checker helper
    const isSlaBreached = (task) => {
        if (task.type !== "issue" || task.status === "resolved") return false;
        const createdDate = new Date(task.createdAt);
        const hoursElapsed = (Date.now() - createdDate.getTime()) / (1000 * 60 * 60);
        return hoursElapsed > slaThreshold;
    };

    const getSlaHoursElapsed = (task) => {
        const createdDate = new Date(task.createdAt);
        return Math.round((Date.now() - createdDate.getTime()) / (1000 * 60 * 60));
    };

    // Workload computation
    const getWorkloadData = () => {
        const counts = {};
        const activeUsers = getAssigneeOptions();
        activeUsers.forEach(u => counts[u.username] = 0);
        counts[myUsername] = 0; // fallback

        tasks.forEach(t => {
            if (t.status !== "completed" && t.status !== "resolved") {
                counts[t.assignee_id] = (counts[t.assignee_id] || 0) + 1;
            }
        });

        // Convert to sorted array
        return Object.keys(counts).map(username => ({
            username,
            count: counts[username]
        })).sort((a, b) => b.count - a.count);
    };

    // Form submission
    const handleCreateTask = async (e) => {
        e.preventDefault();
        try {
            const tokenVal = getAuthToken();
            const bodyData = {
                ...taskForm,
                room_id: selectedWorkspace === "personal" ? null : selectedWorkspace,
                visibility: isRoomWorkspace ? "room" : taskForm.visibility
            };
            const res = await fetch(`${getBackendUrl()}/api/workspace/tasks`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tokenVal}`
                },
                body: JSON.stringify(bodyData)
            });
            if (res.ok) {
                const newTask = await res.json();
                setTasks(prev => [newTask, ...prev]);
                setIsCreating(false);
                if (isNonAdminMember) {
                    setTaskForm({
                        title: "",
                        description: "",
                        type: "issue",
                        priority: "medium",
                        assignee_id: activeRoom?.admin?.username || "",
                        due_date: "",
                        visibility: "room",
                        severity: "medium"
                    });
                } else {
                    setTaskForm({
                        title: "",
                        description: "",
                        type: "task",
                        priority: "medium",
                        assignee_id: myUsername,
                        due_date: "",
                        visibility: isRoomWorkspace ? "room" : "workspace",
                        severity: "medium"
                    });
                }
            } else {
                alert("Failed to create task.");
            }
        } catch (err) {
            console.error("Error creating task:", err);
        }
    };

    const handleUpdateTask = async (updatedFields) => {
        if (!selectedTask) return;
        try {
            const tokenVal = getAuthToken();
            const res = await fetch(`${getBackendUrl()}/api/workspace/tasks/${selectedTask._id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tokenVal}`
                },
                body: JSON.stringify(updatedFields)
            });
            if (res.ok) {
                const updated = await res.json();
                setTasks(prev => prev.map(t => t._id === updated._id ? updated : t));
                setSelectedTask(null);
            } else {
                const errData = await res.json();
                alert(errData.message || "Failed to update task.");
            }
        } catch (err) {
            console.error("Error updating task:", err);
        }
    };

    const handleDeleteTask = async (taskId) => {
        if (!window.confirm("Are you sure you want to delete this task?")) return;
        try {
            const tokenVal = getAuthToken();
            const res = await fetch(`${getBackendUrl()}/api/workspace/tasks/${taskId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${tokenVal}` }
            });
            if (res.ok) {
                setTasks(prev => prev.filter(t => t._id !== taskId));
                setSelectedTask(null);
            } else {
                const errData = await res.json();
                alert(errData.message || "Failed to delete task.");
            }
        } catch (err) {
            console.error("Error deleting task:", err);
        }
    };

    // Bot messages submit
    const handleSendBotMessage = async (e) => {
        e.preventDefault();
        if (!botInput.trim()) return;

        const userMsg = botInput.trim();
        setBotMessages(prev => [...prev, { sender: "user", text: userMsg }]);
        setBotInput("");
        setBotLoading(true);

        try {
            const tokenVal = getAuthToken();
            const res = await fetch(`${getBackendUrl()}/api/workspace/bot/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tokenVal}`
                },
                body: JSON.stringify({
                    prompt: userMsg,
                    room_id: selectedWorkspace === "personal" ? null : selectedWorkspace
                })
            });

            if (res.ok) {
                const data = await res.json();
                setBotMessages(prev => [...prev, { sender: "bot", text: data.reply }]);
                if (data.task) {
                    // Prepend new task instantly
                    setTasks(prev => [data.task, ...prev]);
                }
            } else if (res.status === 429) {
                setBotMessages(prev => [...prev, { sender: "bot", text: "⚠️ **Rate Limit Exceeded:** Please wait a minute before messaging the AI bot again." }]);
            } else {
                setBotMessages(prev => [...prev, { sender: "bot", text: "Sorry, I had trouble processing that command." }]);
            }
        } catch (err) {
            console.error("Error in bot chat:", err);
            setBotMessages(prev => [...prev, { sender: "bot", text: "Sorry, I couldn't reach the workspace server." }]);
        } finally {
            setBotLoading(false);
        }
    };

    const handleClearBotHistory = () => {
        if (window.confirm("Clear all AI bot messages?")) {
            setBotMessages([
                {
                    sender: "bot",
                    text: "Hello! I am your Workspace AI Assistant. You can ask me to create tasks or issues by typing natural language commands like:\n\n*   `Create high priority task to review frontend PR for Siddh due tomorrow`\n*   `Open critical severity issue Login auth bug for Rahul`"
                }
            ]);
        }
    };

    const filteredList = getFilteredTasks();
    const workload = getWorkloadData();

    return (
        <div className="workspace-page-container">
            {/* Nav Header */}
            <div className="workspace-nav-header">
                <div className={`custom-select-container ${isWorkspaceDropdownOpen ? 'is-open' : ''}`} ref={workspaceDropdownRef} style={{ width: 'auto', minWidth: '220px' }}>
                    <div className="custom-select-trigger" onClick={() => setIsWorkspaceDropdownOpen(!isWorkspaceDropdownOpen)}>
                        <div className="custom-select-trigger-content">
                            <FiBriefcase className="custom-select-icon" style={{ fontSize: "14px" }} />
                            <span className="custom-select-label">
                                {selectedWorkspace === "personal" ? "Personal Workspace" : `${activeRoom?.name || "Room"} Workspace`}
                            </span>
                        </div>
                        <FiChevronDown className="custom-select-arrow" />
                    </div>

                    {isWorkspaceDropdownOpen && (
                        <div className="custom-select-dropdown" style={{ left: 0, width: '100%' }}>
                            <div 
                                className={`custom-select-option ${selectedWorkspace === "personal" ? 'is-selected' : ''}`}
                                onClick={() => {
                                    setSelectedWorkspace("personal");
                                    setIsWorkspaceDropdownOpen(false);
                                }}
                            >
                                <FiUser className="custom-select-icon" style={{ fontSize: "14px" }} />
                                <span className="custom-select-option-label">Personal Workspace</span>
                            </div>
                            {rooms.map(room => (
                                <div 
                                    key={room._id} 
                                    className={`custom-select-option ${selectedWorkspace === room._id ? 'is-selected' : ''}`}
                                    onClick={() => {
                                        setSelectedWorkspace(room._id);
                                        setIsWorkspaceDropdownOpen(false);
                                    }}
                                >
                                    <FiUsers className="custom-select-icon" style={{ fontSize: "14px" }} />
                                    <span className="custom-select-option-label">{room.name} Workspace</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="workspace-tabs">
                    <button
                        className={`workspace-tab-btn ${activeTab === "board" ? "active" : ""}`}
                        onClick={() => setActiveTab("board")}
                    >
                        <FiBriefcase size={15} /> Task Board
                    </button>
                    <button
                        className={`workspace-tab-btn ${activeTab === "bot" ? "active" : ""}`}
                        onClick={() => setActiveTab("bot")}
                    >
                        <FiMessageSquare size={15} /> Workspace AI Bot
                    </button>
                </div>
            </div>

            {/* TAB 1: KANBAN TASK BOARD */}
            {activeTab === "board" && (
                <div className="workspace-dashboard">
                    {/* Upper Widgets Grid */}
                    <div className="dashboard-widgets">
                        {/* 1. Workload bar chart */}
                        <div className="workload-widget">
                            <h4 className="widget-title">Team Workload (Open Tasks)</h4>
                            <div className="workload-list">
                                {workload.slice(0, 5).map(item => {
                                    const maxCount = Math.max(...workload.map(w => w.count), 1);
                                    const percentage = (item.count / maxCount) * 100;
                                    return (
                                        <div key={item.username} className="workload-item">
                                            <div className="workload-user-info">@{item.username}</div>
                                            <div className="workload-bar-wrap">
                                                <div
                                                    className="workload-bar-fill"
                                                    style={{ width: `${percentage}%` }}
                                                ></div>
                                            </div>
                                            <div className="workload-count">{item.count} open</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 2. SLA configurations */}
                        <div className="sla-widget">
                            <h4 className="widget-title">SLA Configuration</h4>
                            <div className="sla-control">
                                <span className="sla-label">Issue Breach Threshold:</span>
                                <div className="sla-input-row">
                                    <input
                                        type="number"
                                        className="sla-input"
                                        value={slaThreshold}
                                        onChange={(e) => {
                                            const v = parseInt(e.target.value) || 0;
                                            setSlaThreshold(v);
                                            localStorage.setItem("nexus_sla_threshold", v);
                                        }}
                                    />
                                    <span style={{ fontSize: '13px', fontWeight: 'bold' }}>hours</span>
                                </div>
                                <p className="sla-desc">
                                    Open support issues older than this threshold will display high-visibility warnings.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Filter controls */}
                    <div className="workspace-filters-bar" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <div style={{ display: "flex", gap: "12px", width: "100%", alignItems: "center", flexWrap: "wrap" }}>
                            <input
                                type="text"
                                placeholder="Filter by title/description..."
                                className="filter-search-input"
                                value={searchFilter}
                                onChange={(e) => setSearchFilter(e.target.value)}
                            />
                            <div className="filter-group" style={{ gap: "10px" }}>
                                <FiFilter size={14} style={{ color: "var(--muted)" }} />
                                <div style={{ width: "160px" }}>
                                    <CustomSelect
                                        value={assigneeFilter}
                                        onChange={(val) => setAssigneeFilter(val)}
                                        options={[
                                            { value: "", label: "All Assignees" },
                                            ...getAssigneeOptions().map(u => ({ value: u.username, label: `@${u.username}` }))
                                        ]}
                                    />
                                </div>
                                <div style={{ width: "140px" }}>
                                    <CustomSelect
                                        value={priorityFilter}
                                        onChange={(val) => setPriorityFilter(val)}
                                        options={[
                                            { value: "", label: "All Priorities" },
                                            { value: "low", label: "Low" },
                                            { value: "medium", label: "Medium" },
                                            { value: "high", label: "High" },
                                            { value: "critical", label: "Critical" }
                                        ]}
                                    />
                                </div>
                                <div style={{ width: "120px" }}>
                                    <CustomSelect
                                        value={typeFilter}
                                        onChange={(val) => setTypeFilter(val)}
                                        options={[
                                            { value: "", label: "All Types" },
                                            { value: "task", label: "Tasks" },
                                            { value: "issue", label: "Issues" }
                                        ]}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="quick-filter-chips-row" style={{ display: "flex", gap: "8px", flexWrap: "wrap", width: "100%" }}>
                            <span 
                                className={`quick-filter-chip ${assigneeFilter === myUsername ? "active" : ""}`}
                                onClick={() => setAssigneeFilter(assigneeFilter === myUsername ? "" : myUsername)}
                            >
                                👤 Assigned to Me
                            </span>
                            <span 
                                className={`quick-filter-chip ${priorityFilter === "critical" ? "active" : ""}`}
                                onClick={() => setPriorityFilter(priorityFilter === "critical" ? "" : "critical")}
                            >
                                🔥 Critical Priority
                            </span>
                            <span 
                                className={`quick-filter-chip ${typeFilter === "issue" ? "active" : ""}`}
                                onClick={() => setTypeFilter(typeFilter === "issue" ? "" : "issue")}
                            >
                                ⚠️ Only Issues
                            </span>
                            <span 
                                className={`quick-filter-chip ${typeFilter === "task" ? "active" : ""}`}
                                onClick={() => setTypeFilter(typeFilter === "task" ? "" : "task")}
                            >
                                📋 Only Tasks
                            </span>
                            {(assigneeFilter !== "" || priorityFilter !== "" || typeFilter !== "" || searchFilter !== "") && (
                                <span 
                                    className="quick-filter-chip clear"
                                    onClick={() => {
                                        setAssigneeFilter("");
                                        setPriorityFilter("");
                                        setTypeFilter("");
                                        setSearchFilter("");
                                    }}
                                    style={{ background: "rgba(239, 68, 68, 0.15)", color: "#f87171" }}
                                >
                                    ✕ Clear Filters
                                </span>
                            )}
                        </div>
                    </div>

                        <button
                            type="button"
                            className="create-task-main-btn"
                            onClick={() => {
                                if (isNonAdminMember) {
                                    setTaskForm({
                                        title: "",
                                        description: "",
                                        type: "issue",
                                        priority: "medium",
                                        assignee_id: activeRoom?.admin?.username || "",
                                        due_date: "",
                                        visibility: "room",
                                        severity: "medium"
                                    });
                                } else {
                                    setTaskForm({
                                        title: "",
                                        description: "",
                                        type: "task",
                                        priority: "medium",
                                        assignee_id: myUsername,
                                        due_date: "",
                                        visibility: isRoomWorkspace ? "room" : "workspace",
                                        severity: "medium"
                                    });
                                }
                                setIsCreating(true);
                            }}
                        >
                            <FiPlus /> {isNonAdminMember ? "Report Issue" : "New Item"}
                        </button>

                    {/* Kanban grid */}
                    {loadingTasks ? (
                        <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>
                            Loading workspace board...
                        </div>
                    ) : (
                        <div className="workspace-kanban-board">
                            {/* Column: To Do */}
                            <div
                                className="kanban-column"
                                onDragOver={onDragOver}
                                onDrop={(e) => onDrop(e, "open")}
                            >
                                <div className="kanban-column-header">
                                    <div className="kanban-column-title-group">
                                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6" }}></div>
                                        <h3 className="kanban-column-title">To Do</h3>
                                    </div>
                                    <span className="kanban-column-count">
                                        {filteredList.filter(t => t.type === "task" && t.status === "open").length}
                                    </span>
                                </div>
                                <div className="kanban-cards-list">
                                    {filteredList.filter(t => t.type === "task" && t.status === "open").map(task => (
                                        <KanbanCard
                                            key={task._id}
                                            task={task}
                                            onDragStart={onDragStart}
                                            onClick={() => setSelectedTask(task)}
                                            onNavigateToMessage={onNavigateToMessage}
                                            myUsername={myUsername}
                                            socket={socket}
                                            isRoomWorkspace={isRoomWorkspace}
                                            onShareToChat={handleShareToChat}
                                            onQuickAssign={handleQuickAssign}
                                            onQuickComplete={handleQuickComplete}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Column: In Progress */}
                            <div
                                className="kanban-column"
                                onDragOver={onDragOver}
                                onDrop={(e) => onDrop(e, "in_progress")}
                            >
                                <div className="kanban-column-header">
                                    <div className="kanban-column-title-group">
                                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fbbf24" }}></div>
                                        <h3 className="kanban-column-title">In Progress</h3>
                                    </div>
                                    <span className="kanban-column-count">
                                        {filteredList.filter(t => t.type === "task" && t.status === "in_progress").length}
                                    </span>
                                </div>
                                <div className="kanban-cards-list">
                                    {filteredList.filter(t => t.type === "task" && t.status === "in_progress").map(task => (
                                        <KanbanCard
                                            key={task._id}
                                            task={task}
                                            onDragStart={onDragStart}
                                            onClick={() => setSelectedTask(task)}
                                            onNavigateToMessage={onNavigateToMessage}
                                            myUsername={myUsername}
                                            socket={socket}
                                            isRoomWorkspace={isRoomWorkspace}
                                            onShareToChat={handleShareToChat}
                                            onQuickAssign={handleQuickAssign}
                                            onQuickComplete={handleQuickComplete}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Column: Completed */}
                            <div
                                className="kanban-column"
                                onDragOver={onDragOver}
                                onDrop={(e) => onDrop(e, "completed")}
                            >
                                <div className="kanban-column-header">
                                    <div className="kanban-column-title-group">
                                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }}></div>
                                        <h3 className="kanban-column-title">Completed</h3>
                                    </div>
                                    <span className="kanban-column-count">
                                        {filteredList.filter(t => t.type === "task" && t.status === "completed").length}
                                    </span>
                                </div>
                                <div className="kanban-cards-list">
                                    {filteredList.filter(t => t.type === "task" && t.status === "completed").map(task => (
                                        <KanbanCard
                                            key={task._id}
                                            task={task}
                                            onDragStart={onDragStart}
                                            onClick={() => setSelectedTask(task)}
                                            onNavigateToMessage={onNavigateToMessage}
                                            myUsername={myUsername}
                                            socket={socket}
                                            isRoomWorkspace={isRoomWorkspace}
                                            onShareToChat={handleShareToChat}
                                            onQuickAssign={handleQuickAssign}
                                            onQuickComplete={handleQuickComplete}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Column: Issues */}
                            <div
                                className="kanban-column"
                                onDragOver={onDragOver}
                                onDrop={(e) => onDrop(e, "investigating")}
                            >
                                <div className="kanban-column-header">
                                    <div className="kanban-column-title-group">
                                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }}></div>
                                        <h3 className="kanban-column-title">Issues</h3>
                                    </div>
                                    <span className="kanban-column-count">
                                        {filteredList.filter(t => t.type === "issue" && t.status !== "resolved").length}
                                    </span>
                                </div>
                                <div className="kanban-cards-list">
                                    {filteredList.filter(t => t.type === "issue" && t.status !== "resolved").map(task => (
                                        <KanbanCard
                                            key={task._id}
                                            task={task}
                                            onDragStart={onDragStart}
                                            onClick={() => setSelectedTask(task)}
                                            isBreached={isSlaBreached(task)}
                                            breachedHours={getSlaHoursElapsed(task)}
                                            onNavigateToMessage={onNavigateToMessage}
                                            myUsername={myUsername}
                                            socket={socket}
                                            isRoomWorkspace={isRoomWorkspace}
                                            onShareToChat={handleShareToChat}
                                            onQuickAssign={handleQuickAssign}
                                            onQuickComplete={handleQuickComplete}
                                        />
                                    ))}
                                    {/* Sub-divider for resolved issues */}
                                    {filteredList.some(t => t.type === "issue" && t.status === "resolved") && (
                                        <div style={{ 
                                            borderTop: "1px dashed rgba(255,255,255,0.08)", 
                                            margin: "12px 0 6px 0", 
                                            paddingTop: "12px", 
                                            fontSize: "11px", 
                                            fontWeight: "bold",
                                            color: "var(--muted)" 
                                        }}>
                                            Resolved Issues
                                        </div>
                                    )}
                                    {filteredList.filter(t => t.type === "issue" && t.status === "resolved").map(task => (
                                        <KanbanCard
                                            key={task._id}
                                            task={task}
                                            onDragStart={onDragStart}
                                            onClick={() => setSelectedTask(task)}
                                            onNavigateToMessage={onNavigateToMessage}
                                            myUsername={myUsername}
                                            socket={socket}
                                            isRoomWorkspace={isRoomWorkspace}
                                            onShareToChat={handleShareToChat}
                                            onQuickAssign={handleQuickAssign}
                                            onQuickComplete={handleQuickComplete}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 2: AI BOT CONVERSATION */}
            {activeTab === "bot" && (
                <div className="bot-chat-container">
                    <div className="bot-chat-messages">
                        {botMessages.map((msg, index) => (
                            <div key={index} className={`bot-msg-row ${msg.sender}`}>
                                <div className={`bot-avatar ${msg.sender === "bot" ? "ai" : ""}`}>
                                    {msg.sender === "bot" ? "🤖" : <FiUser />}
                                </div>
                                <div className="bot-msg-bubble">
                                    {msg.text.split("\n").map((line, lIdx) => {
                                        if (line.trim().startsWith("*")) {
                                            const cleanLine = line.replace(/^\*\s*/, "").replace(/`/g, "");
                                            return (
                                                <li key={lIdx} style={{ marginLeft: "16px", marginBottom: "4px" }}>
                                                    {renderFormattedText(cleanLine)}
                                                </li>
                                            );
                                        }
                                        return (
                                            <p key={lIdx} style={{ margin: "0 0 6px 0" }}>
                                                {renderFormattedText(line)}
                                            </p>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                        {botLoading && (
                            <div className="bot-typing-indicator">
                                <div className="spinner" style={{ width: "12px", height: "12px" }}></div>
                                AI Bot is creating tasks...
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="bot-suggestion-chips" style={{ display: "flex", gap: "8px", flexWrap: "wrap", padding: "10px 16px 0 16px" }}>
                        <span className="suggestion-chip" onClick={() => setBotInput("Show my tasks")}>
                            📋 Show my tasks
                        </span>
                        <span className="suggestion-chip" onClick={() => setBotInput("Workspace summary")}>
                            📊 Workspace summary
                        </span>
                        <span className="suggestion-chip" onClick={() => setBotInput("Show breached issues")}>
                            ⚠️ SLA breaches
                        </span>
                        {activeRoom && activeRoom.admin && (
                            <span className="suggestion-chip" onClick={() => setBotInput(`What is ${activeRoom.admin.username} working on?`)}>
                                👤 What is @{activeRoom.admin.username} doing?
                            </span>
                        )}
                    </div>

                    <form onSubmit={handleSendBotMessage} className="bot-chat-input-area">
                        <button
                            type="button"
                            className="modal-btn cancel"
                            onClick={handleClearBotHistory}
                            style={{ padding: "10px", fontSize: "11px" }}
                        >
                            Clear History
                        </button>
                        <input
                            type="text"
                            placeholder="Message Workspace Bot to create items (e.g. 'Create task review API for Siddh due tomorrow')"
                            className="bot-input-box"
                            value={botInput}
                            onChange={(e) => setBotInput(e.target.value)}
                            disabled={botLoading}
                        />
                        <button type="submit" className="bot-send-btn" disabled={botLoading}>
                            <FiSend size={16} />
                        </button>
                    </form>
                </div>
            )}

            {/* MODAL: VIEW / EDIT TASK DETAILS */}
            {selectedTask && (
                <TaskDetailsModal
                    task={selectedTask}
                    users={users}
                    myUsername={myUsername}
                    onClose={() => setSelectedTask(null)}
                    onUpdate={handleUpdateTask}
                    onDelete={handleDeleteTask}
                    rooms={rooms}
                />
            )}

            {/* MODAL: CREATE NEW TASK */}
            {isCreating && (
                <div className="workspace-detail-overlay">
                    <form className="workspace-detail-modal" onSubmit={handleCreateTask}>
                        <div className="modal-header">
                            <h3>{isNonAdminMember ? "Report Workspace Issue" : "Create Workspace Item"}</h3>
                            <button
                                type="button"
                                className="modal-close-btn"
                                onClick={() => setIsCreating(false)}
                            >
                                <FiX size={18} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>Title</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    required
                                    value={taskForm.title}
                                    onChange={(e) => setTaskForm(prev => ({ ...prev, title: e.target.value }))}
                                />
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <textarea
                                    className="form-control"
                                    rows={3}
                                    value={taskForm.description}
                                    onChange={(e) => setTaskForm(prev => ({ ...prev, description: e.target.value }))}
                                />
                            </div>
                            {!isNonAdminMember ? (
                                <div className="form-group">
                                    <label>Item Type</label>
                                    <CustomSelect
                                        value={taskForm.type}
                                        onChange={(val) => setTaskForm(prev => ({ ...prev, type: val }))}
                                        options={[
                                            { value: "task", label: "Task" },
                                            { value: "issue", label: "Issue" }
                                        ]}
                                    />
                                </div>
                            ) : null}
                            <div className="form-group">
                                <label>Assignee</label>
                                <CustomSelect
                                    value={taskForm.assignee_id}
                                    onChange={(val) => setTaskForm(prev => ({ ...prev, assignee_id: val }))}
                                    disabled={isNonAdminMember}
                                    options={isNonAdminMember && activeRoom && activeRoom.admin ? [
                                        { value: activeRoom.admin.username, label: `@${activeRoom.admin.username} (Room Admin)` }
                                    ] : getAssigneeOptions().map(u => ({ value: u.username, label: `@${u.username}` }))}
                                />
                            </div>
                            <div className="form-group">
                                <label>Priority</label>
                                <CustomSelect
                                    value={taskForm.priority}
                                    onChange={(val) => setTaskForm(prev => ({ ...prev, priority: val }))}
                                    options={[
                                        { value: "low", label: "Low" },
                                        { value: "medium", label: "Medium" },
                                        { value: "high", label: "High" },
                                        { value: "critical", label: "Critical" }
                                    ]}
                                />
                            </div>
                            {taskForm.type === "issue" && (
                                <div className="form-group">
                                    <label>Issue Severity</label>
                                    <CustomSelect
                                        value={taskForm.severity}
                                        onChange={(val) => setTaskForm(prev => ({ ...prev, severity: val }))}
                                        options={[
                                            { value: "low", label: "Low" },
                                            { value: "medium", label: "Medium" },
                                            { value: "high", label: "High" },
                                            { value: "critical", label: "Critical" }
                                        ]}
                                    />
                                </div>
                            )}
                            {!isNonAdminMember && (
                                <div className="form-group">
                                    <label>Due Date</label>
                                    <input
                                        type="date"
                                        className="form-control"
                                        value={taskForm.due_date}
                                        onChange={(e) => setTaskForm(prev => ({ ...prev, due_date: e.target.value }))}
                                    />
                                </div>
                            )}
                            {!isRoomWorkspace && (
                                <div className="form-group">
                                    <label>Visibility Access</label>
                                    <CustomSelect
                                        value={taskForm.visibility}
                                        onChange={(val) => setTaskForm(prev => ({ ...prev, visibility: val }))}
                                        options={[
                                            { value: "workspace", label: "Workspace (Org-Wide)" },
                                            { value: "private", label: "Private (Only Creator & Assignee)" }
                                        ]}
                                    />
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button
                                type="button"
                                className="modal-btn cancel"
                                onClick={() => setIsCreating(false)}
                            >
                                Cancel
                            </button>
                            <button type="submit" className="modal-btn submit">
                                Create
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}

// Kanban Card helper component
function KanbanCard({ 
    task, 
    onDragStart, 
    onClick, 
    isBreached, 
    breachedHours, 
    onNavigateToMessage,
    myUsername,
    socket,
    isRoomWorkspace,
    onShareToChat,
    onQuickAssign,
    onQuickComplete
}) {
    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== "completed" && task.status !== "resolved";

    const handleDeepLinkClick = (e) => {
        e.stopPropagation(); // Avoid triggering details modal
        if (task.created_from && task.created_from.chat_id && task.created_from.message_id) {
            onNavigateToMessage(task.created_from.chat_id, task.created_from.message_id);
        }
    };

    return (
        <div
            className={`kanban-card priority-${task.priority} type-${task.type}`}
            draggable
            onDragStart={(e) => onDragStart(e, task._id)}
            onClick={onClick}
        >
            <div className="card-badges-row">
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <span className={`card-type-badge ${task.type}`}>
                        {task.type}
                    </span>
                    <span className={`card-priority-badge ${task.priority}`}>
                        {task.priority}
                    </span>
                </div>

                {/* Quick actions container */}
                <div className="card-quick-actions" onClick={(e) => e.stopPropagation()}>
                    {isRoomWorkspace && socket && onShareToChat && (
                        <button 
                            className="quick-action-btn share" 
                            title="Share to room chat"
                            onClick={() => onShareToChat(task)}
                        >
                            <FiSend size={10} />
                        </button>
                    )}
                    {task.assignee_id !== myUsername && onQuickAssign && (
                        <button 
                            className="quick-action-btn assign" 
                            title="Assign to me"
                            onClick={() => onQuickAssign(task._id)}
                        >
                            <FiUser size={10} />
                        </button>
                    )}
                    {task.status !== "completed" && task.status !== "resolved" && onQuickComplete && (
                        <button 
                            className="quick-action-btn complete" 
                            title="Mark as completed"
                            onClick={() => onQuickComplete(task._id, task.type)}
                        >
                            <FiCheck size={10} />
                        </button>
                    )}
                </div>
            </div>

            <h4 className="card-title">{task.title}</h4>
            {task.description && <p className="card-desc">{task.description}</p>}

            {/* Checklist progress bar */}
            {task.checklist && task.checklist.length > 0 && (
                <div className="card-checklist-summary">
                    <span className="checklist-text">
                        📋 {task.checklist.filter(c => c.completed).length}/{task.checklist.length} sub-tasks
                    </span>
                    <div className="checklist-progress-bar-bg">
                        <div 
                            className="checklist-progress-bar-fill"
                            style={{ width: `${(task.checklist.filter(c => c.completed).length / task.checklist.length) * 100}%` }}
                        />
                    </div>
                </div>
            )}

            {isBreached && (
                <div className="sla-warning-badge">
                    <FiAlertTriangle size={12} />
                    <span>SLA Breach: Open {breachedHours}h</span>
                </div>
            )}

            <div className="card-footer">
                <div className="card-dates-box">
                    {task.due_date && (
                        <span className={`card-due-tag ${isOverdue ? "overdue" : ""}`}>
                            Due: {new Date(task.due_date).toLocaleDateString()}
                        </span>
                    )}
                    {task.created_from && task.created_from.message_id && (
                        <span className="card-deep-link-chip" onClick={handleDeepLinkClick}>
                            <FiCornerUpRight size={10} /> from chat
                        </span>
                    )}
                </div>

                <div className="card-assignee-avatar" title={`Assigned to: @${task.assignee_id}`}>
                    {task.assignee_id.substring(0, 2)}
                </div>
            </div>
        </div>
    );
}

// Detailed View/Edit Modal
function TaskDetailsModal({ task, users, myUsername, onClose, onUpdate, onDelete, rooms }) {
    const taskRoom = rooms.find(r => r._id === task.room_id);
    const isRoomTask = !!taskRoom;
    const isRoomAdmin = taskRoom ? (taskRoom.admin?.username === myUsername) : false;

    // Can delete?
    const canDelete = isRoomTask ? isRoomAdmin : (task.created_by === myUsername);

    // Can do full update?
    const canFullUpdate = isRoomTask ? isRoomAdmin : (task.created_by === myUsername);
    const isAssignee = task.assignee_id === myUsername;
    const canStatusOnlyUpdate = !canFullUpdate && isAssignee;
    const canAnyUpdate = canFullUpdate || canStatusOnlyUpdate;

    const [editForm, setEditForm] = useState({
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        severity: task.severity || "medium",
        assignee_id: task.assignee_id,
        due_date: task.due_date ? task.due_date.split("T")[0] : "",
        visibility: task.visibility,
        checklist: task.checklist || []
    });

    const [newChecklistItem, setNewChecklistItem] = useState("");

    const handleAddChecklistItem = () => {
        if (!newChecklistItem.trim()) return;
        const newItem = { text: newChecklistItem.trim(), completed: false };
        const updatedList = [...(editForm.checklist || []), newItem];
        setEditForm(prev => ({ ...prev, checklist: updatedList }));
        setNewChecklistItem("");
    };

    const handleToggleChecklistItem = (index) => {
        const updatedList = (editForm.checklist || []).map((item, idx) => 
            idx === index ? { ...item, completed: !item.completed } : item
        );
        setEditForm(prev => ({ ...prev, checklist: updatedList }));
    };

    const handleRemoveChecklistItem = (index) => {
        const updatedList = (editForm.checklist || []).filter((_, idx) => idx !== index);
        setEditForm(prev => ({ ...prev, checklist: updatedList }));
    };

    const getAssigneeOptions = () => {
        if (isRoomTask && taskRoom) {
            const list = [];
            if (taskRoom.admin) {
                list.push(taskRoom.admin);
            }
            if (taskRoom.members) {
                taskRoom.members.forEach(m => {
                    if (taskRoom.admin && m._id === taskRoom.admin._id) return;
                    list.push(m);
                });
            }
            return list;
        }
        return users;
    };

    const handleSave = (e) => {
        e.preventDefault();
        onUpdate(editForm);
    };

    return (
        <div className="workspace-detail-overlay">
            <form className="workspace-detail-modal" onSubmit={handleSave}>
                <div className="modal-header">
                    <h3>Item Details</h3>
                    <button type="button" className="modal-close-btn" onClick={onClose}>
                        <FiX size={18} />
                    </button>
                </div>
                <div className="modal-body">
                    <div className="form-group">
                        <label>Title</label>
                        <input
                            type="text"
                            className="form-control"
                            value={editForm.title}
                            onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                            disabled={!canFullUpdate}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Description</label>
                        <textarea
                            className="form-control"
                            rows={3}
                            value={editForm.description}
                            onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                            disabled={!canFullUpdate}
                        />
                    </div>
                    <div className="form-group">
                        <label>Status</label>
                        <CustomSelect
                            value={editForm.status}
                            onChange={(val) => setEditForm(prev => ({ ...prev, status: val }))}
                            disabled={!canAnyUpdate}
                            options={task.type === "issue" ? [
                                { value: "open", label: "Open" },
                                { value: "investigating", label: "Investigating" },
                                { value: "resolved", label: "Resolved" }
                            ] : [
                                { value: "open", label: "To Do" },
                                { value: "in_progress", label: "In Progress" },
                                { value: "completed", label: "Completed" }
                            ]}
                        />
                    </div>
                    <div className="form-group">
                        <label>Assignee</label>
                        <CustomSelect
                            value={editForm.assignee_id}
                            onChange={(val) => setEditForm(prev => ({ ...prev, assignee_id: val }))}
                            disabled={!canFullUpdate}
                            options={getAssigneeOptions().map(u => ({ value: u.username, label: `@${u.username}` }))}
                        />
                    </div>
                    <div className="form-group">
                        <label>Priority</label>
                        <CustomSelect
                            value={editForm.priority}
                            onChange={(val) => setEditForm(prev => ({ ...prev, priority: val }))}
                            disabled={!canFullUpdate}
                            options={[
                                { value: "low", label: "Low" },
                                { value: "medium", label: "Medium" },
                                { value: "high", label: "High" },
                                { value: "critical", label: "Critical" }
                            ]}
                        />
                    </div>
                    {task.type === "issue" && (
                        <div className="form-group">
                            <label>Severity</label>
                            <CustomSelect
                                value={editForm.severity}
                                onChange={(val) => setEditForm(prev => ({ ...prev, severity: val }))}
                                disabled={!canFullUpdate}
                                options={[
                                    { value: "low", label: "Low" },
                                    { value: "medium", label: "Medium" },
                                    { value: "high", label: "High" },
                                    { value: "critical", label: "Critical" }
                                ]}
                            />
                        </div>
                    )}
                    <div className="form-group">
                        <label>Due Date</label>
                        <input
                            type="date"
                            className="form-control"
                            value={editForm.due_date}
                            onChange={(e) => setEditForm(prev => ({ ...prev, due_date: e.target.value }))}
                            disabled={!canFullUpdate}
                        />
                    </div>
                    <div className="form-group">
                        <label>Visibility Access</label>
                        <CustomSelect
                            value={editForm.visibility}
                            onChange={(val) => setEditForm(prev => ({ ...prev, visibility: val }))}
                            disabled={!canFullUpdate}
                            options={[
                                { value: "workspace", label: "Workspace (Org-Wide)" },
                                { value: "private", label: "Private (Only Creator & Assignee)" },
                                ...(task.visibility === "room" ? [{ value: "room", label: "Room Members Only" }] : [])
                            ]}
                        />
                    </div>
                    {/* Sub-tasks Checklist */}
                    <div className="form-group checklist-section" style={{ marginTop: "16px" }}>
                        <label style={{ fontWeight: 650, display: "flex", alignItems: "center", gap: "6px" }}>
                            📋 Sub-tasks Checklist
                        </label>
                        <div className="checklist-items-list" style={{ display: "flex", flexDirection: "column", gap: "6px", margin: "8px 0" }}>
                            {(editForm.checklist || []).map((item, idx) => (
                                <div key={idx} className="checklist-item-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.03)", padding: "6px 10px", borderRadius: "8px" }}>
                                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: canAnyUpdate ? "pointer" : "default", fontSize: "13px", color: item.completed ? "var(--muted)" : "var(--text)" }}>
                                        <input
                                            type="checkbox"
                                            checked={item.completed}
                                            onChange={() => handleToggleChecklistItem(idx)}
                                            disabled={!canAnyUpdate}
                                            style={{ cursor: canAnyUpdate ? "pointer" : "default" }}
                                        />
                                        <span style={{ textDecoration: item.completed ? "line-through" : "none" }}>
                                            {item.text}
                                        </span>
                                    </label>
                                    {canAnyUpdate && (
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveChecklistItem(idx)}
                                            style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", display: "flex", alignItems: "center" }}
                                        >
                                            <FiTrash2 size={13} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        {canAnyUpdate && (
                            <div className="add-checklist-input-group" style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="Add a sub-task..."
                                    value={newChecklistItem}
                                    onChange={(e) => setNewChecklistItem(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            handleAddChecklistItem();
                                        }
                                    }}
                                />
                                <button
                                    type="button"
                                    className="create-task-main-btn"
                                    onClick={handleAddChecklistItem}
                                    style={{ padding: "8px 12px" }}
                                >
                                    Add
                                </button>
                            </div>
                        )}
                    </div>

                    <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>
                        Created by @{task.created_by} on {new Date(task.createdAt).toLocaleString()}
                    </div>
                </div>
                <div className="modal-footer">
                    {canDelete && (
                        <button
                            type="button"
                            className="modal-btn delete"
                            onClick={() => onDelete(task._id)}
                        >
                            Delete
                        </button>
                    )}
                    <button type="button" className="modal-btn cancel" onClick={onClose}>
                        Close
                    </button>
                    {canAnyUpdate && (
                        <button type="submit" className="modal-btn submit">
                            Save Changes
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
}
