import React, { useState, useEffect, useRef } from "react";
import { FiBriefcase, FiMessageSquare, FiPlus, FiFilter, FiSearch, FiClock, FiCornerUpRight, FiUnlock, FiLock, FiAlertTriangle, FiSend, FiX, FiCheck, FiPlay, FiTrash2, FiUser, FiUsers, FiChevronDown, FiGrid, FiHelpCircle } from "react-icons/fi";
import { getBackendUrl } from "../utils/config";
import "./NexTask.css";
import logo from "../assets/logo.png";
import { CustomSelect } from "./CustomSelect";
import { getVaultKeyFromSession, decryptVaultItem } from "../utils/crypto/vault";
import EmptyState from "./EmptyState";
import { playPop } from "../utils/audio";
import { triggerConfetti } from "../utils/confetti";

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

const getUserColor = (username) => {
    if (!username) return "#bff7f2";
    const colors = ["#bff7f2", "#c8eeff", "#d8f7cf", "#ffe1b8", "#e7dcff"];
    let colorIndex = 0;
    for (let i = 0; i < username.length; i++) {
        colorIndex += username.charCodeAt(i);
    }
    return colors[colorIndex % colors.length];
};

export default function NexTaskPage({ 
    myUsername, 
    token, 
    theme, 
    onNavigateToMessage, 
    socket,
    activeTab = "board",
    setActiveTab,
    selectedNexTask = "personal",
    setSelectedNexTask,
    onTasksUpdate
}) {
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

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    // Switcher & Modal states (moved up to prevent ReferenceError)
    const [selectedTask, setSelectedTask] = useState(null);
    const [isCreating, setIsCreating] = useState(false);
    const [rooms, setRooms] = useState([]);
    const [isNexTaskDropdownOpen, setIsNexTaskDropdownOpen] = useState(false);
    const nextaskDropdownRef = useRef(null);

    const [dragOverColumn, setDragOverColumn] = useState(null);

    const handleDragEnter = (e, column) => {
        e.preventDefault();
        setDragOverColumn(column);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
    };

    useEffect(() => {
        if (onTasksUpdate) {
            onTasksUpdate(tasks, selectedNexTask, rooms);
        }
    }, [tasks, selectedNexTask, rooms, onTasksUpdate]);

    // Onboarding Tour state
    const [tourStep, setTourStep] = useState(0);

    const tourSteps = [
        {
            title: "Welcome to NexTask! 🚀",
            text: "NexTask helps you organize work visually. It includes a Kanban board, a Gantt Timeline, and an AI chat assistant. Let's learn how to use them in 4 easy clicks!",
            targetSelector: null,
            requiresAction: false
        },
        {
            title: "1. Open Board Switcher 🔀",
            text: "👉 Click on the Board Selector dropdown above to open it. You can switch between your personal tasks and shared room boards here.",
            targetSelector: "#nextask-board-switcher",
            requiresAction: true
        },
        {
            title: "2. Kanban & Columns 📋",
            text: "This is your task board. Drag and drop cards between 'To Do', 'In Progress', and 'Completed' columns as you work. Click any card to see checklist sub-tasks and assignees. Click 'Next' to continue.",
            targetSelector: ".nextask-kanban-board",
            requiresAction: false
        },
        {
            title: "3. Check Gantt Timeline 🗂️",
            text: "👉 Click on the 'Gantt Timeline' tab above. This lets you view task durations and track due dates on a 14-day schedule.",
            targetSelector: "#nextask-tab-timeline",
            requiresAction: true
        },
        {
            title: "4. Meet NexTask AI Bot 🤖",
            text: "👉 Click on the 'NexTask AI Bot' tab above. This is your conversational helper.",
            targetSelector: "#nextask-tab-bot",
            requiresAction: true
        },
        {
            title: "Tour Completed! 🎉",
            text: "You can talk to the Bot in natural language (e.g. 'create high priority task to buy milk due tomorrow') to automate board actions. Click 'Finish' to start managing your tasks!",
            targetSelector: null,
            requiresAction: false
        }
    ];

    useEffect(() => {
        const completed = localStorage.getItem("nextask_tour_completed");
        if (!completed) {
            setActiveTab("board");
            setIsNexTaskDropdownOpen(false);
            setTourStep(1);
        }
    }, []);

    // Automatic Tour Progression based on user actions
    useEffect(() => {
        if (tourStep === 2 && isNexTaskDropdownOpen) {
            setTourStep(3);
        }
    }, [isNexTaskDropdownOpen, tourStep]);

    useEffect(() => {
        if (tourStep === 3 && selectedTask !== null) {
            setTourStep(4);
        }
    }, [selectedTask, tourStep]);

    useEffect(() => {
        if ((tourStep === 3 || tourStep === 4) && activeTab === "timeline") {
            setTourStep(5);
        }
    }, [activeTab, tourStep]);

    useEffect(() => {
        if ((tourStep === 4 || tourStep === 5) && activeTab === "bot") {
            setTourStep(6);
        }
    }, [activeTab, tourStep]);

    // Toggle spotlight class on target elements
    useEffect(() => {
        // Remove class from all elements
        document.querySelectorAll(".nextask-tour-spotlight").forEach(el => {
            el.classList.remove("nextask-tour-spotlight");
        });

        // Add class to current target
        const currentStepObj = tourSteps[tourStep - 1];
        if (currentStepObj && currentStepObj.targetSelector) {
            const el = document.querySelector(currentStepObj.targetSelector);
            if (el) {
                el.classList.add("nextask-tour-spotlight");
            }
        }

        // Cleanup on unmount or tour step change
        return () => {
            document.querySelectorAll(".nextask-tour-spotlight").forEach(el => {
                el.classList.remove("nextask-tour-spotlight");
            });
        };
    }, [tourStep]);

    const startTour = () => {
        setActiveTab("board");
        setIsNexTaskDropdownOpen(false);
        setTourStep(1);
    };

    const handleNextTourStep = () => {
        if (tourStep < tourSteps.length) {
            setTourStep(prev => prev + 1);
        } else {
            handleCompleteTour();
        }
    };

    const handlePrevTourStep = () => {
        if (tourStep > 1) {
            const prevStep = tourStep - 1;
            // Reset relevant UI states when navigating backward to prevent auto-forward progression loops
            if (prevStep === 2) {
                setIsNexTaskDropdownOpen(false);
            } else if (prevStep === 4) {
                setActiveTab("board");
            } else if (prevStep === 5) {
                setActiveTab("timeline");
            }
            setTourStep(prevStep);
        }
    };

    const handleCompleteTour = () => {
        localStorage.setItem("nextask_tour_completed", "true");
        setTourStep(0);
    };

    const decryptSingleTask = async (task) => {
        if (task.encryptedPayload && task.encryptedPayload.ciphertext) {
            try {
                const chatId = task.created_from ? task.created_from.chat_id : null;
                if (chatId) {
                    const vaultKey = await getVaultKeyFromSession(chatId);
                    if (vaultKey) {
                        const decrypted = await decryptVaultItem(task.encryptedPayload, vaultKey);
                        return {
                            ...task,
                            title: decrypted.title,
                            description: decrypted.description,
                            isDecrypted: true
                        };
                    }
                }
            } catch (err) {
                console.error("Failed to decrypt task:", err);
            }
        }
        return task;
    };

    const decryptTasksIfAny = async (taskList) => {
        return Promise.all(taskList.map(decryptSingleTask));
    };



    // Close nextask dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (nextaskDropdownRef.current && !nextaskDropdownRef.current.contains(event.target)) {
                setIsNexTaskDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const activeRoom = rooms.find(r => r._id === selectedNexTask);
    const isRoomNexTask = !!activeRoom;
    const isRoomAdmin = activeRoom ? (activeRoom.admin?.username === myUsername) : false;
    const isNonAdminMember = isRoomNexTask && !isRoomAdmin;

    const getAssigneeOptions = () => {
        if (isRoomNexTask && activeRoom) {
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
        assignees: [myUsername],
        due_date: "",
        visibility: "nextask",
        severity: "medium"
    });

    // NexTask Bot states
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
                text: "Hello! I am your NexTask AI Assistant. You can ask me to create tasks or issues by typing natural language commands like:\n\n*   `Create high priority task to review frontend PR for Siddh due tomorrow`\n*   `Open critical severity issue Login auth bug for Rahul`"
            }
        ];
    });
    const [botInput, setBotInput] = useState("");
    const [botLoading, setBotLoading] = useState(false);
    const messagesEndRef = useRef(null);
    const botChatContainerRef = useRef(null);

    const [undoClearBotInfo, setUndoClearBotInfo] = useState(null);
    const [showClearBotConfirm, setShowClearBotConfirm] = useState(false);
    const clearBotTimeoutRef = useRef(null);

    // Fetch rooms & users list on mount
    useEffect(() => {
        fetchRooms();
        fetchUsers();
    }, []);

    // Fetch tasks whenever selectedNexTask changes
    useEffect(() => {
        fetchTasks();
    }, [selectedNexTask]);

    // Listen to real-time task updates via Socket.IO if window.nexusSocket exists
    useEffect(() => {
        const socket = window.nexusSocket;
        if (!socket) return;

        const handleTaskUpdated = async (updatedTask) => {
            const decrypted = await decryptSingleTask(updatedTask);
            setTasks(prev => {
                const exists = prev.some(t => t._id === decrypted._id);
                if (exists) {
                    return prev.map(t => t._id === decrypted._id ? decrypted : t);
                } else {
                    return [decrypted, ...prev];
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
        setTimeout(() => {
            if (botChatContainerRef.current) {
                botChatContainerRef.current.scrollTo({
                    top: botChatContainerRef.current.scrollHeight,
                    behavior: "smooth"
                });
            }
        }, 100);
    };

    const fetchRooms = async () => {
        try {
            const tokenVal = getAuthToken();
            const res = await fetch(`${getBackendUrl()}/api/nextask/rooms`, {
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
            const url = `${getBackendUrl()}/api/nextask/tasks?room_id=${selectedNexTask}&limit=200`;
            const res = await fetch(url, {
                headers: { "Authorization": `Bearer ${tokenVal}` }
            });
            if (res.ok) {
                const data = await res.json();
                const decrypted = await decryptTasksIfAny(data.tasks || []);
                setTasks(decrypted);
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
        const taskText = `📋 **NexTask Item Shared**:\n\n*   **Title:** ${task.title}\n*   **Type:** ${task.type.toUpperCase()}\n*   **Priority:** ${task.priority.toUpperCase()}\n*   **Assignee:** @${task.assignee_id}\n*   **Status:** ${task.status.replace("_", " ").toUpperCase()}${task.description ? `\n*   **Description:** ${task.description}` : ""}`;
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
            await fetch(`${getBackendUrl()}/api/nextask/tasks/${taskId}`, {
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
        triggerConfetti();
        playPop();
        // Optimistic update
        setTasks(prev => prev.map(t => t._id === taskId ? { ...t, status: nextStatus } : t));

        try {
            const tokenVal = getAuthToken();
            await fetch(`${getBackendUrl()}/api/nextask/tasks/${taskId}`, {
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
        setDragOverColumn(null);
        const taskId = e.dataTransfer.getData("text/plain");
        if (!taskId) return;

        const currentTask = tasks.find(t => t._id === taskId);
        if (!currentTask) return;

        if (tourStep === 3) {
            setTourStep(4);
        }

        let targetType = currentTask.type;
        if (targetStatus === "investigating") {
            targetType = "issue";
        } else if (targetStatus === "open" || targetStatus === "in_progress" || targetStatus === "completed") {
            targetType = "task";
        }

        if (targetStatus === "completed" || targetStatus === "resolved") {
            triggerConfetti();
            playPop();
        }

        // Optimistic update
        setTasks(prev => prev.map(t => t._id === taskId ? { ...t, status: targetStatus, type: targetType } : t));

        try {
            const tokenVal = getAuthToken();
            const res = await fetch(`${getBackendUrl()}/api/nextask/tasks/${taskId}`, {
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
            const matchesAssignee = assigneeFilter === "" || 
                                    t.assignee_id === assigneeFilter || 
                                    (t.assignees && t.assignees.includes(assigneeFilter));
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
                room_id: selectedNexTask === "personal" ? null : selectedNexTask,
                visibility: isRoomNexTask ? "room" : taskForm.visibility
            };
            const res = await fetch(`${getBackendUrl()}/api/nextask/tasks`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tokenVal}`
                },
                body: JSON.stringify(bodyData)
            });
            if (res.ok) {
                const newTask = await res.json();
                const decryptedNewTask = await decryptSingleTask(newTask);
                setTasks(prev => [decryptedNewTask, ...prev]);
                setIsCreating(false);
                if (isNonAdminMember) {
                    setTaskForm({
                        title: "",
                        description: "",
                        type: "issue",
                        priority: "medium",
                        assignee_id: activeRoom?.admin?.username || "",
                        assignees: [activeRoom?.admin?.username || ""],
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
                        assignees: [myUsername],
                        due_date: "",
                        visibility: isRoomNexTask ? "room" : "nextask",
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
            const res = await fetch(`${getBackendUrl()}/api/nextask/tasks/${selectedTask._id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tokenVal}`
                },
                body: JSON.stringify(updatedFields)
            });
            if (res.ok) {
                const updated = await res.json();
                const decryptedUpdated = await decryptSingleTask(updated);
                setTasks(prev => prev.map(t => t._id === decryptedUpdated._id ? decryptedUpdated : t));
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
            const res = await fetch(`${getBackendUrl()}/api/nextask/tasks/${taskId}`, {
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
            const res = await fetch(`${getBackendUrl()}/api/nextask/bot/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tokenVal}`
                },
                body: JSON.stringify({
                    prompt: userMsg,
                    room_id: selectedNexTask === "personal" ? null : selectedNexTask
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
            setBotMessages(prev => [...prev, { sender: "bot", text: "Sorry, I couldn't reach the nextask server." }]);
        } finally {
            setBotLoading(false);
        }
    };

    const handleClearBotHistory = () => {
        setShowClearBotConfirm(true);
    };

    const executeClearBotHistory = () => {
        const welcomeMessage = [
            {
                sender: "bot",
                text: "Hello! I am your NexTask AI Assistant. You can ask me to create tasks or issues by typing natural language commands like:\n\n*   `Create high priority task to review frontend PR for Siddh due tomorrow`\n*   `Open critical severity issue Login auth bug for Rahul`"
            }
        ];

        setUndoClearBotInfo({
            originalMessages: [...botMessages]
        });
        setBotMessages(welcomeMessage);
        setShowClearBotConfirm(false);

        if (clearBotTimeoutRef.current) {
            clearTimeout(clearBotTimeoutRef.current);
        }

        clearBotTimeoutRef.current = setTimeout(() => {
            localStorage.setItem("nexus_bot_messages", JSON.stringify(welcomeMessage));
            setUndoClearBotInfo(null);
            clearBotTimeoutRef.current = null;
        }, 5000);
    };

    const executeUndoClearBot = () => {
        if (clearBotTimeoutRef.current) {
            clearTimeout(clearBotTimeoutRef.current);
            clearBotTimeoutRef.current = null;
        }

        if (undoClearBotInfo) {
            setBotMessages(undoClearBotInfo.originalMessages);
            localStorage.setItem("nexus_bot_messages", JSON.stringify(undoClearBotInfo.originalMessages));
            setUndoClearBotInfo(null);
        }
    };

    const filteredList = getFilteredTasks();
    const workload = getWorkloadData();

    return (
        <div className="nextask-page-container">
            {/* Nav Header */}
            <div className="nextask-nav-header">
                <div className="nextask-brand-logo">NexTask.</div>
                <div id="nextask-board-switcher" className={`custom-select-container ${isNexTaskDropdownOpen ? 'is-open' : ''}`} ref={nextaskDropdownRef} style={{ width: 'auto', minWidth: '220px' }}>
                    <div className="custom-select-trigger" onClick={() => setIsNexTaskDropdownOpen(!isNexTaskDropdownOpen)}>
                        <div className="custom-select-trigger-content">
                            <FiBriefcase className="custom-select-icon" style={{ fontSize: "14px" }} />
                            <span className="custom-select-label">
                                {selectedNexTask === "personal" ? "Personal NexTask" : `${activeRoom?.name || "Room"} NexTask`}
                            </span>
                        </div>
                        <FiChevronDown className="custom-select-arrow" />
                    </div>

                    {isNexTaskDropdownOpen && (
                        <div className="custom-select-dropdown" style={{ left: 0, width: '100%' }}>
                            <div 
                                className={`custom-select-option ${selectedNexTask === "personal" ? 'is-selected' : ''}`}
                                onClick={() => {
                                    setSelectedNexTask("personal");
                                    setIsNexTaskDropdownOpen(false);
                                }}
                            >
                                <FiUser className="custom-select-icon" style={{ fontSize: "14px" }} />
                                <span className="custom-select-option-label">Personal NexTask</span>
                            </div>
                            {rooms.map(room => (
                                <div 
                                    key={room._id} 
                                    className={`custom-select-option ${selectedNexTask === room._id ? 'is-selected' : ''}`}
                                    onClick={() => {
                                        setSelectedNexTask(room._id);
                                        setIsNexTaskDropdownOpen(false);
                                    }}
                                >
                                    <FiUsers className="custom-select-icon" style={{ fontSize: "14px" }} />
                                    <span className="custom-select-option-label">{room.name} NexTask</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div id="nextask-tab-bar" className="nextask-tabs">
                    <button
                        id="nextask-tab-board"
                        className={`nextask-tab-btn ${activeTab === "board" ? "active" : ""}`}
                        onClick={() => setActiveTab("board")}
                    >
                        <FiBriefcase size={15} /> Task Board
                    </button>
                    <button
                        id="nextask-tab-timeline"
                        className={`nextask-tab-btn ${activeTab === "timeline" ? "active" : ""}`}
                        onClick={() => setActiveTab("timeline")}
                    >
                        <FiGrid size={15} /> Gantt Timeline
                    </button>
                    <button
                        id="nextask-tab-bot"
                        className={`nextask-tab-btn ${activeTab === "bot" ? "active" : ""}`}
                        onClick={() => setActiveTab("bot")}
                    >
                        <FiMessageSquare size={15} /> NexTask AI Bot
                    </button>
                </div>
                <button 
                    type="button"
                    onClick={startTour} 
                    className="nextask-tab-btn" 
                    style={{ marginLeft: selectedNexTask === "personal" || !isRoomAdmin ? "auto" : "8px", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "6px" }}
                >
                    <FiHelpCircle size={14} /> How to Use
                </button>
                {selectedNexTask !== "personal" && isRoomAdmin && (
                    <button 
                        type="button"
                        id="nextask-config-btn"
                        onClick={() => setIsSettingsOpen(true)} 
                        className="nextask-tab-btn" 
                        style={{ border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "6px" }}
                    >
                        ⚙️ Configure Board
                    </button>
                )}
            </div>

            {/* TAB 2: TIMELINE VIEW */}
            {activeTab === "timeline" && (
                <GanttTimeline 
                    tasks={getFilteredTasks()} 
                    onTaskClick={setSelectedTask} 
                />
            )}

            {/* TAB 1: KANBAN TASK BOARD */}
            {activeTab === "board" && (
                <div className="nextask-dashboard">
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
                    <div className="nextask-filters-bar" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
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
                            id="nextask-create-btn"
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
                                        visibility: isRoomNexTask ? "room" : "nextask",
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
                        <div className="nextask-kanban-board">
                            {["To Do", "In Progress", "Completed", "Issues"].map((colTitle) => (
                                <div key={colTitle} className="kanban-column skeleton-card" style={{ opacity: 0.7 }}>
                                    <div className="kanban-column-header">
                                        <div style={{ width: '80px', height: '14px', borderRadius: '4px', background: 'var(--border)' }} />
                                    </div>
                                    <div className="kanban-cards-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
                                        {[1, 2].map((i) => (
                                            <div key={i} style={{
                                                height: '110px',
                                                background: 'var(--panel)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '12px',
                                                padding: '16px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '12px'
                                            }}>
                                                <div style={{ width: '70%', height: '14px', background: 'var(--border)', borderRadius: '4px' }} />
                                                <div style={{ width: '100%', height: '10px', background: 'var(--border)', borderRadius: '4px', opacity: 0.6 }} />
                                                <div style={{ width: '40%', height: '10px', background: 'var(--border)', borderRadius: '4px', opacity: 0.6 }} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="nextask-kanban-board">
                            {/* Column: To Do */}
                            <div
                                className={`kanban-column ${dragOverColumn === "open" ? "drag-over" : ""}`}
                                onDragOver={onDragOver}
                                onDragEnter={(e) => handleDragEnter(e, "open")}
                                onDragLeave={handleDragLeave}
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
                                <div className="kanban-cards-list" style={{ paddingBottom: '30px' }}>
                                    {filteredList.filter(t => t.type === "task" && t.status === "open").length === 0 ? (
                                        <EmptyState title="No Tasks To Do" description="Drag tasks here or click 'New Item' to create a new task." iconType="todo" />
                                    ) : (
                                        filteredList.filter(t => t.type === "task" && t.status === "open").map(task => (
                                            <KanbanCard
                                                key={task._id}
                                                task={task}
                                                onDragStart={onDragStart}
                                                onClick={() => setSelectedTask(task)}
                                                onNavigateToMessage={onNavigateToMessage}
                                                myUsername={myUsername}
                                                socket={socket}
                                                isRoomNexTask={isRoomNexTask}
                                                onShareToChat={handleShareToChat}
                                                onQuickAssign={handleQuickAssign}
                                                onQuickComplete={handleQuickComplete}
                                                users={users}
                                            />
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Column: In Progress */}
                            <div
                                className={`kanban-column ${dragOverColumn === "in_progress" ? "drag-over" : ""}`}
                                onDragOver={onDragOver}
                                onDragEnter={(e) => handleDragEnter(e, "in_progress")}
                                onDragLeave={handleDragLeave}
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
                                <div className="kanban-cards-list" style={{ paddingBottom: '30px' }}>
                                    {filteredList.filter(t => t.type === "task" && t.status === "in_progress").length === 0 ? (
                                        <EmptyState title="No Tasks In Progress" description="Drag tasks here from 'To Do' when you start working on them." iconType="progress" />
                                    ) : (
                                        filteredList.filter(t => t.type === "task" && t.status === "in_progress").map(task => (
                                            <KanbanCard
                                                key={task._id}
                                                users={users}
                                                task={task}
                                                onDragStart={onDragStart}
                                                onClick={() => setSelectedTask(task)}
                                                onNavigateToMessage={onNavigateToMessage}
                                                myUsername={myUsername}
                                                socket={socket}
                                                isRoomNexTask={isRoomNexTask}
                                                onShareToChat={handleShareToChat}
                                                onQuickAssign={handleQuickAssign}
                                                onQuickComplete={handleQuickComplete}
                                            />
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Column: Completed */}
                            <div
                                className={`kanban-column ${dragOverColumn === "completed" ? "drag-over" : ""}`}
                                onDragOver={onDragOver}
                                onDragEnter={(e) => handleDragEnter(e, "completed")}
                                onDragLeave={handleDragLeave}
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
                                <div className="kanban-cards-list" style={{ paddingBottom: '30px' }}>
                                    {filteredList.filter(t => t.type === "task" && t.status === "completed").length === 0 ? (
                                        <EmptyState title="No Completed Tasks" description="Move tasks here once they are finished to celebrate completion!" iconType="completed" />
                                    ) : (
                                        filteredList.filter(t => t.type === "task" && t.status === "completed").map(task => (
                                            <KanbanCard
                                                key={task._id}
                                                users={users}
                                                task={task}
                                                onDragStart={onDragStart}
                                                onClick={() => setSelectedTask(task)}
                                                onNavigateToMessage={onNavigateToMessage}
                                                myUsername={myUsername}
                                                socket={socket}
                                                isRoomNexTask={isRoomNexTask}
                                                onShareToChat={handleShareToChat}
                                                onQuickAssign={handleQuickAssign}
                                                onQuickComplete={handleQuickComplete}
                                            />
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Column: Issues */}
                            <div
                                className={`kanban-column ${dragOverColumn === "investigating" ? "drag-over" : ""}`}
                                onDragOver={onDragOver}
                                onDragEnter={(e) => handleDragEnter(e, "investigating")}
                                onDragLeave={handleDragLeave}
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
                                <div className="kanban-cards-list" style={{ paddingBottom: '30px' }}>
                                    {filteredList.filter(t => t.type === "issue").length === 0 ? (
                                        <EmptyState title="No Room Issues" description="No active or resolved bugs. Great job keeping the room healthy!" iconType="issues" />
                                    ) : (
                                        <>
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
                                                    isRoomNexTask={isRoomNexTask}
                                                    onShareToChat={handleShareToChat}
                                                    onQuickAssign={handleQuickAssign}
                                                    onQuickComplete={handleQuickComplete}
                                                    users={users}
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
                                                    isRoomNexTask={isRoomNexTask}
                                                    onShareToChat={handleShareToChat}
                                                    onQuickAssign={handleQuickAssign}
                                                    onQuickComplete={handleQuickComplete}
                                                    users={users}
                                                />
                                            ))}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 2: AI BOT CONVERSATION */}
            {activeTab === "bot" && (
                <div className="bot-chat-container">
                    <div className="bot-chat-messages" ref={botChatContainerRef}>
                        {botMessages.map((msg, index) => {
                            const isBot = msg.sender === "bot";
                            const userObj = users.find(u => u.username === myUsername);
                            const userAvatar = userObj ? userObj.avatar : null;
                            return (
                                <div key={index} className={`bot-msg-row ${msg.sender}`}>
                                    <div 
                                        className={`bot-avatar ${isBot ? "ai" : ""}`}
                                        style={!isBot ? { 
                                            backgroundColor: userAvatar ? "transparent" : getUserColor(myUsername), 
                                            color: "#23303d", 
                                            fontWeight: "800", 
                                            fontSize: "13px" 
                                        } : {}}
                                    >
                                        {isBot ? (
                                            <img src={logo} alt="Nexus Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%' }} />
                                        ) : userAvatar ? (
                                            <img src={userAvatar} alt={myUsername} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                                        ) : (
                                            (myUsername || "U").charAt(0).toUpperCase()
                                        )}
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
                            );
                        })}
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
                        <span className="suggestion-chip" onClick={() => setBotInput("NexTask summary")}>
                            📊 NexTask summary
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
                            style={{ padding: "10px", fontSize: "11px", width: "auto", whiteSpace: "nowrap" }}
                        >
                            Clear History
                        </button>
                        <input
                            type="text"
                            placeholder="Message NexTask Bot to create items (e.g. 'Create task review API for Siddh due tomorrow')"
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
                <div className="nextask-detail-overlay">
                    <form className="nextask-detail-modal" onSubmit={handleCreateTask}>
                        <div className="modal-header">
                            <h3>{isNonAdminMember ? "Report NexTask Issue" : "Create NexTask Item"}</h3>
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
                                <label>Assignees</label>
                                <div className="multi-select-checkboxes" style={{
                                    maxHeight: '120px',
                                    overflowY: 'auto',
                                    border: '1px solid var(--border)',
                                    borderRadius: '8px',
                                    padding: '8px',
                                    background: 'var(--panel)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px'
                                }}>
                                    {(isNonAdminMember && activeRoom && activeRoom.admin ? [activeRoom.admin] : getAssigneeOptions()).map(u => {
                                        const isChecked = taskForm.assignees ? taskForm.assignees.includes(u.username) : taskForm.assignee_id === u.username;
                                        return (
                                            <label key={u.username} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isNonAdminMember ? 'default' : 'pointer', fontSize: '13px' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    disabled={isNonAdminMember}
                                                    onChange={() => {
                                                        if (isNonAdminMember) return;
                                                        setTaskForm(prev => {
                                                            const currentAssignees = prev.assignees || [prev.assignee_id];
                                                            const updated = isChecked
                                                                ? currentAssignees.filter(name => name !== u.username)
                                                                : [...currentAssignees, u.username];
                                                            return {
                                                                ...prev,
                                                                assignees: updated,
                                                                assignee_id: updated[0] || ""
                                                            };
                                                        });
                                                    }}
                                                />
                                                @{u.username}
                                            </label>
                                        );
                                    })}
                                </div>
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
                            {!isRoomNexTask && (
                                <div className="form-group">
                                    <label>Visibility Access</label>
                                    <CustomSelect
                                        value={taskForm.visibility}
                                        onChange={(val) => setTaskForm(prev => ({ ...prev, visibility: val }))}
                                        options={[
                                            { value: "nextask", label: "NexTask (Org-Wide)" },
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

            {/* MODAL: ROOM SETTINGS */}
            {isSettingsOpen && (
                <RoomSettingsModal
                    isOpen={isSettingsOpen}
                    onClose={() => setIsSettingsOpen(false)}
                    roomId={selectedNexTask}
                    myUsername={myUsername}
                    getBackendUrl={getBackendUrl}
                    getAuthToken={getAuthToken}
                />
            )}

            {/* TOUR OVERLAY */}
            {tourStep > 0 && (
                <>
                    <SpotlightMask targetSelector={tourSteps[tourStep - 1].targetSelector} />
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 20000,
                        pointerEvents: 'none'
                    }}>
                        <div style={{ pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()}>
                            <OnboardingTooltip
                                step={tourStep}
                                totalSteps={tourSteps.length}
                                title={tourSteps[tourStep - 1].title}
                                text={tourSteps[tourStep - 1].text}
                                targetSelector={tourSteps[tourStep - 1].targetSelector}
                                requiresAction={tourSteps[tourStep - 1].requiresAction}
                                onNext={handleNextTourStep}
                                onPrev={handlePrevTourStep}
                                onSkip={handleCompleteTour}
                            />
                        </div>
                    </div>
                </>
            )}
            {/* Clear Bot Chat Confirmation Modal */}
            {showClearBotConfirm && (
                <div className="nextask-detail-overlay" onClick={() => setShowClearBotConfirm(false)}>
                    <div className="nextask-detail-modal" style={{ maxWidth: "400px" }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Clear Bot History</h3>
                        </div>
                        <div className="modal-body">
                            <p style={{ margin: 0, fontSize: "14px", opacity: 0.8 }}>
                                Are you sure you want to clear all your conversational AI bot messages?
                            </p>
                        </div>
                        <div className="modal-footer" style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "15px" }}>
                            <button 
                                className="modal-btn cancel" 
                                onClick={() => setShowClearBotConfirm(false)}
                                style={{ minHeight: "36px", width: "auto" }}
                            >
                                Cancel
                            </button>
                            <button 
                                className="modal-btn danger" 
                                onClick={executeClearBotHistory}
                                style={{ minHeight: "36px", width: "auto", background: "#ef4444", color: "#fff", border: "none" }}
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Undo Bot Clear Toast */}
            {undoClearBotInfo && (
                <div className="undo-delete-toast" style={{ position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)', zIndex: 10005 }}>
                    <span className="undo-delete-toast-text">
                        &bull; Bot history cleared
                    </span>
                    <button 
                        type="button" 
                        className="undo-delete-toast-btn" 
                        onClick={executeUndoClearBot}
                    >
                        Undo
                    </button>
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
    isRoomNexTask,
    onShareToChat,
    onQuickAssign,
    onQuickComplete,
    users = []
}) {
    const [isDragging, setIsDragging] = useState(false);
    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== "completed" && task.status !== "resolved";

    const handleDeepLinkClick = (e) => {
        e.stopPropagation(); // Avoid triggering details modal
        if (task.created_from && task.created_from.chat_id && task.created_from.message_id) {
            onNavigateToMessage(task.created_from.chat_id, task.created_from.message_id);
        }
    };

    return (
        <div
            className={`kanban-card priority-${task.priority} type-${task.type} ${isDragging ? "dragging-card" : ""}`}
            draggable
            onDragStart={(e) => {
                setIsDragging(true);
                onDragStart(e, task._id);
            }}
            onDragEnd={() => setIsDragging(false)}
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
                    {isRoomNexTask && socket && onShareToChat && (
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

                <div className="card-assignees-pile" style={{ display: "flex", alignItems: "center" }}>
                    {(task.assignees && task.assignees.length > 0 ? task.assignees : (task.assignee_id ? [task.assignee_id] : [])).slice(0, 3).map((aId, aIdx) => {
                        const userObj = users.find(u => u.username.toLowerCase() === aId.toLowerCase());
                        const avatarSrc = userObj ? userObj.avatar : null;
                        
                        return (
                            <div 
                                key={aId} 
                                className="card-assignee-avatar" 
                                title={`Assigned to: @${aId}`}
                                style={{
                                    marginLeft: aIdx > 0 ? "-8px" : "0",
                                    zIndex: 10 - aIdx,
                                    width: "26px",
                                    height: "26px",
                                    borderRadius: "50%",
                                    overflow: "hidden",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "10px",
                                    fontWeight: "bold",
                                    background: avatarSrc ? "transparent" : "var(--accent-soft)",
                                    color: "var(--accent-deep)",
                                    border: "1.5px solid var(--border)"
                                }}
                            >
                                {avatarSrc ? (
                                    <img 
                                        src={avatarSrc} 
                                        alt={aId} 
                                        style={{ width: "100%", height: "100%", objectFit: "cover" }} 
                                    />
                                ) : (
                                    aId.substring(0, 2).toUpperCase()
                                )}
                            </div>
                        );
                    })}
                    {(task.assignees ? task.assignees.length : (task.assignee_id ? 1 : 0)) > 3 && (
                        <div 
                            className="card-assignee-avatar-more" 
                            title={`${task.assignees.length - 3} more assignees`}
                            style={{
                                marginLeft: "-8px",
                                zIndex: 5,
                                width: "26px",
                                height: "26px",
                                borderRadius: "50%",
                                background: "var(--soft)",
                                border: "1.5px solid var(--border)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "9px",
                                fontWeight: "800",
                                color: "var(--muted)"
                            }}
                        >
                            +{task.assignees.length - 3}
                        </div>
                    )}
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
        assignees: task.assignees && task.assignees.length > 0 ? task.assignees : (task.assignee_id ? [task.assignee_id] : []),
        room_id: task.room_id || "",
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
        <div className="nextask-detail-overlay">
            <form className="nextask-detail-modal" onSubmit={handleSave}>
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
                        <label>Assignees</label>
                        <div className="multi-select-checkboxes" style={{
                            maxHeight: '120px',
                            overflowY: 'auto',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            padding: '8px',
                            background: 'var(--panel)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px'
                        }}>
                            {getAssigneeOptions().map(u => {
                                const isChecked = editForm.assignees.includes(u.username);
                                return (
                                    <label key={u.username} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: canFullUpdate ? 'pointer' : 'default', fontSize: '13px' }}>
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            disabled={!canFullUpdate}
                                            onChange={() => {
                                                if (!canFullUpdate) return;
                                                setEditForm(prev => {
                                                    const updated = isChecked
                                                        ? prev.assignees.filter(name => name !== u.username)
                                                        : [...prev.assignees, u.username];
                                                    return {
                                                        ...prev,
                                                        assignees: updated,
                                                        assignee_id: updated[0] || ""
                                                    };
                                                });
                                            }}
                                        />
                                        @{u.username}
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    {canFullUpdate && (
                        <div className="form-group">
                            <label>Move Board</label>
                            <CustomSelect
                                value={editForm.room_id}
                                onChange={(val) => setEditForm(prev => ({ ...prev, room_id: val === "personal" ? "" : val }))}
                                options={[
                                    { value: "personal", label: "Personal Board" },
                                    ...rooms.map(r => ({ value: r._id, label: `${r.name} NexTask` }))
                                ]}
                            />
                        </div>
                    )}
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
                                { value: "nextask", label: "NexTask (Org-Wide)" },
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

// Room Settings Modal (SLA & Webhooks)
function RoomSettingsModal({ isOpen, onClose, roomId, myUsername, getBackendUrl, getAuthToken }) {
    const [slaInput, setSlaInput] = useState(48);
    const [webhookInput, setWebhookInput] = useState("");
    const [webhooksList, setWebhooksList] = useState([]);
    const [loadingSettings, setLoadingSettings] = useState(false);

    useEffect(() => {
        if (isOpen && roomId && roomId !== "personal") {
            fetchSettings();
        }
    }, [isOpen, roomId]);

    const fetchSettings = async () => {
        setLoadingSettings(true);
        try {
            const tokenVal = getAuthToken();
            
            // fetch room for SLA
            const roomRes = await fetch(`${getBackendUrl()}/api/rooms`, {
                headers: { "Authorization": `Bearer ${tokenVal}` }
            });
            if (roomRes.ok) {
                const roomsData = await roomRes.json();
                const currentRoom = roomsData.find(r => r._id === roomId);
                if (currentRoom) {
                    setSlaInput(currentRoom.slaThreshold !== undefined ? currentRoom.slaThreshold : 48);
                }
            }

            // fetch webhooks
            const webhookRes = await fetch(`${getBackendUrl()}/api/nextask/rooms/${roomId}/webhooks`, {
                headers: { "Authorization": `Bearer ${tokenVal}` }
            });
            if (webhookRes.ok) {
                const webhookData = await webhookRes.json();
                setWebhooksList(webhookData.webhooks || []);
            }
        } catch (err) {
            console.error("Error loading room settings:", err);
        } finally {
            setLoadingSettings(false);
        }
    };

    const handleSaveSLA = async () => {
        try {
            const tokenVal = getAuthToken();
            const res = await fetch(`${getBackendUrl()}/api/nextask/rooms/${roomId}/sla`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tokenVal}`
                },
                body: JSON.stringify({ slaThreshold: Number(slaInput) })
            });
            if (res.ok) {
                alert("SLA threshold updated successfully!");
            } else {
                const err = await res.json();
                alert(`Error: ${err.message}`);
            }
        } catch (e) {
            console.error("Error updating SLA:", e);
        }
    };

    const handleAddWebhook = async () => {
        if (!webhookInput.trim()) return;
        try {
            const tokenVal = getAuthToken();
            const res = await fetch(`${getBackendUrl()}/api/nextask/rooms/${roomId}/webhooks`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tokenVal}`
                },
                body: JSON.stringify({ url: webhookInput.trim() })
            });
            if (res.ok) {
                const data = await res.json();
                setWebhooksList(data.webhooks || []);
                setWebhookInput("");
            } else {
                const err = await res.json();
                alert(`Error: ${err.message}`);
            }
        } catch (e) {
            console.error("Error adding webhook:", e);
        }
    };

    const handleDeleteWebhook = async (url) => {
        try {
            const tokenVal = getAuthToken();
            const res = await fetch(`${getBackendUrl()}/api/nextask/rooms/${roomId}/webhooks`, {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tokenVal}`
                },
                body: JSON.stringify({ url })
            });
            if (res.ok) {
                const data = await res.json();
                setWebhooksList(data.webhooks || []);
            } else {
                const err = await res.json();
                alert(`Error: ${err.message}`);
            }
        } catch (e) {
            console.error("Error deleting webhook:", e);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="nextask-detail-overlay">
            <div className="nextask-detail-modal" style={{ maxWidth: "500px" }}>
                <div className="modal-header">
                    <h3>NexTask Board Settings</h3>
                    <button type="button" className="modal-close-btn" onClick={onClose}>
                        <FiX size={18} />
                    </button>
                </div>
                <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    {loadingSettings ? (
                        <div style={{ textAlign: "center", padding: "20px" }}>Loading settings...</div>
                    ) : (
                        <>
                            <div className="form-group">
                                <label style={{ fontWeight: "700" }}>SLA Warning Threshold (Hours)</label>
                                <div style={{ display: "flex", gap: "10px", marginTop: "5px" }}>
                                    <input
                                        type="number"
                                        className="form-control"
                                        min="1"
                                        value={slaInput}
                                        onChange={(e) => setSlaInput(e.target.value)}
                                        style={{ flex: 1 }}
                                    />
                                    <button 
                                        type="button" 
                                        className="modal-btn submit"
                                        onClick={handleSaveSLA}
                                        style={{ padding: "8px 16px", height: "auto" }}
                                    >
                                        Save
                                    </button>
                                </div>
                                <span style={{ fontSize: "11px", opacity: 0.5 }}>
                                    Display SLA breach warning status on cards open longer than this threshold.
                                </span>
                            </div>

                            <hr style={{ border: "0", borderTop: "1px solid var(--border)", margin: "10px 0" }} />

                            <div className="form-group">
                                <label style={{ fontWeight: "700" }}>Webhook Integrations</label>
                                <div style={{ display: "flex", gap: "10px", marginTop: "5px" }}>
                                    <input
                                        type="url"
                                        className="form-control"
                                        placeholder="https://example.com/webhook-listener"
                                        value={webhookInput}
                                        onChange={(e) => setWebhookInput(e.target.value)}
                                        style={{ flex: 1 }}
                                    />
                                    <button 
                                        type="button" 
                                        className="modal-btn submit"
                                        onClick={handleAddWebhook}
                                        style={{ padding: "8px 16px", height: "auto" }}
                                    >
                                        Add
                                    </button>
                                </div>
                                <span style={{ fontSize: "11px", opacity: 0.5, display: "block", marginBottom: "10px" }}>
                                    Enter a HTTP URL to receive POST payloads whenever tasks are created, updated, or deleted.
                                </span>

                                <div className="webhooks-list-container" style={{
                                    border: "1px solid var(--border)",
                                    borderRadius: "8px",
                                    padding: "8px",
                                    background: "rgba(0,0,0,0.05)",
                                    maxHeight: "150px",
                                    overflowY: "auto"
                                }}>
                                    {webhooksList.length === 0 ? (
                                        <div style={{ fontSize: "12px", opacity: 0.5, textAlign: "center", padding: "10px" }}>No webhooks configured.</div>
                                    ) : (
                                        webhooksList.map((url, idx) => (
                                            <div key={idx} style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                padding: "6px",
                                                borderBottom: idx === webhooksList.length - 1 ? "none" : "1px solid var(--border)",
                                                fontSize: "12px"
                                            }}>
                                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "350px" }}>{url}</span>
                                                <button 
                                                    type="button" 
                                                    onClick={() => handleDeleteWebhook(url)}
                                                    style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer" }}
                                                >
                                                    <FiTrash2 size={12} />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
                <div className="modal-footer">
                    <button type="button" className="modal-btn cancel" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

const GanttTimeline = ({ tasks, onTaskClick }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const dateRange = [];
    for (let i = 0; i < 14; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        dateRange.push(d);
    }
    
    const rangeStart = today.getTime();
    const rangeEnd = today.getTime() + 14 * 24 * 60 * 60 * 1000;
    const rangeDuration = 14 * 24 * 60 * 60 * 1000;

    return (
        <div className="gantt-timeline-container" style={{
            padding: '20px',
            background: 'var(--panel)',
            borderRadius: '16px',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            overflowX: 'auto',
            minHeight: '400px'
        }}>
            <div className="gantt-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>Project Gantt Timeline (14 Days)</h3>
                <span style={{ fontSize: '12px', opacity: 0.6 }}>Click a row to view task details</span>
            </div>

            <div className="gantt-grid" style={{ minWidth: '800px', position: 'relative' }}>
                {/* Timeline Grid Header */}
                <div className="gantt-grid-header" style={{
                    display: 'grid',
                    gridTemplateColumns: '250px repeat(14, 1fr)',
                    borderBottom: '1px solid var(--border)',
                    paddingBottom: '8px',
                    fontWeight: 'bold',
                    fontSize: '11px',
                    textAlign: 'center',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    opacity: 0.8
                }}>
                    <div style={{ textAlign: 'left', paddingLeft: '8px' }}>Task Name</div>
                    {dateRange.map((d, idx) => (
                        <div key={idx} style={{ borderLeft: '1px solid var(--border)', color: idx === 0 ? 'var(--accent)' : 'inherit' }}>
                            {d.toLocaleDateString(undefined, { weekday: 'short' })}
                            <div style={{ fontSize: '9px', opacity: 0.6 }}>{d.getDate()}</div>
                        </div>
                    ))}
                </div>

                {/* Timeline Rows */}
                <div className="gantt-rows" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                    {tasks.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', opacity: 0.5 }}>No tasks to display in timeline.</div>
                    ) : (
                        tasks.map(task => {
                            const taskStart = task.start_date ? new Date(task.start_date).getTime() : new Date(task.createdAt).getTime();
                            const taskEnd = task.due_date ? new Date(task.due_date).getTime() : taskStart + 24 * 60 * 60 * 1000;

                            let leftPercent = 0;
                            let widthPercent = 0;

                            if (taskEnd >= rangeStart && taskStart <= rangeEnd) {
                                const startClamped = Math.max(taskStart, rangeStart);
                                const endClamped = Math.min(taskEnd, rangeEnd);
                                
                                leftPercent = ((startClamped - rangeStart) / rangeDuration) * 100;
                                widthPercent = ((endClamped - startClamped) / rangeDuration) * 100;
                                if (widthPercent < 2) widthPercent = 5;
                            }

                            const priorityColor = 
                                task.priority === 'critical' ? '#f43f5e' :
                                task.priority === 'high' ? '#fbbf24' :
                                task.priority === 'medium' ? '#3b82f6' : '#64748b';

                            const assigneesList = task.assignees && task.assignees.length > 0 ? task.assignees : (task.assignee_id ? [task.assignee_id] : []);

                            return (
                                <div 
                                    key={task._id} 
                                    className="gantt-row-item"
                                    onClick={() => onTaskClick(task)}
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '250px 1fr',
                                        alignItems: 'center',
                                        padding: '10px 0',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        transition: 'background 0.2s',
                                        background: 'var(--panel)',
                                        border: '1px solid var(--border)'
                                    }}
                                >
                                    <div style={{ paddingLeft: '12px', display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                                        <div style={{ fontWeight: 'bold', fontSize: '13px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', color: 'var(--text)' }}>
                                            {task.title}
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                            <span className={`card-type-badge ${task.type}`} style={{ fontSize: '8px', padding: '1px 4px' }}>
                                                {task.type}
                                            </span>
                                            <span style={{ fontSize: '9px', opacity: 0.5 }}>
                                                @{assigneesList.join(', @')}
                                            </span>
                                        </div>
                                    </div>

                                    <div style={{ height: '100%', position: 'relative', minHeight: '30px', margin: '0 8px' }}>
                                        <div style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            right: 0,
                                            bottom: 0,
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(14, 1fr)',
                                            pointerEvents: 'none'
                                        }}>
                                            {Array(14).fill(0).map((_, i) => (
                                                <div key={i} style={{ borderLeft: '1px solid var(--border)', opacity: 0.1, height: '100%' }} />
                                            ))}
                                        </div>

                                        {widthPercent > 0 && (
                                            <div 
                                                style={{
                                                    position: 'absolute',
                                                    left: `${leftPercent}%`,
                                                    width: `${widthPercent}%`,
                                                    height: '14px',
                                                    top: '50%',
                                                    transform: 'translateY(-50%)',
                                                    borderRadius: '10px',
                                                    background: `linear-gradient(90deg, ${priorityColor} 0%, var(--accent) 100%)`,
                                                    boxShadow: `0 2px 8px ${priorityColor}20`,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    transition: 'all 0.2s ease'
                                                }}
                                                title={`Priority: ${task.priority} | Start: ${new Date(taskStart).toLocaleDateString()} | Due: ${task.due_date ? new Date(task.due_date).toLocaleDateString() : 'N/A'}`}
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};

const OnboardingTooltip = ({ step, totalSteps, title, text, targetSelector, requiresAction, onNext, onPrev, onSkip }) => {
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    useEffect(() => {
        if (!targetSelector) {
            // Center of the screen
            setCoords({
                top: window.innerHeight / 2 - 100,
                left: window.innerWidth / 2 - 160
            });
            return;
        }

        const updatePosition = () => {
            const el = document.querySelector(targetSelector);
            if (el) {
                const rect = el.getBoundingClientRect();
                const tooltipHeight = 180; // approximate height of the tooltip
                const tooltipWidth = 320;
                
                // Position tooltip below the element by default
                let top = rect.bottom + 12;
                let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
                
                // If it goes off the bottom of the screen, place it above
                if (top + tooltipHeight > window.innerHeight) {
                    top = rect.top - tooltipHeight - 12;
                }
                
                // If it goes off the top or the element is very large (taking up > 60% of viewport)
                if (top < 10 || rect.height > window.innerHeight * 0.6) {
                    // Float it at the bottom-center of the viewport
                    top = window.innerHeight - tooltipHeight - 30;
                    left = window.innerWidth / 2 - tooltipWidth / 2;
                }
                
                // Clamp within viewport margins
                left = Math.max(10, Math.min(left, window.innerWidth - tooltipWidth - 10));
                top = Math.max(10, Math.min(top, window.innerHeight - tooltipHeight - 10));
                
                setCoords({ top, left });
            } else {
                // Fallback to center
                setCoords({
                    top: window.innerHeight / 2 - 100,
                    left: window.innerWidth / 2 - 160
                });
            }
        };

        // Give elements a brief moment to render before positioning
        const timer = setTimeout(updatePosition, 100);

        window.addEventListener('resize', updatePosition);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', updatePosition);
        };
    }, [targetSelector, step]);

    const handleMouseDown = (e) => {
        if (e.button !== 0) return;
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
            return;
        }
        setIsDragging(true);
        setDragStart({
            x: e.clientX - coords.left,
            y: e.clientY - coords.top
        });
    };

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e) => {
            setCoords({
                left: e.clientX - dragStart.x,
                top: e.clientY - dragStart.y
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragStart]);

    return (
        <div 
            onMouseDown={handleMouseDown}
            style={{
                position: 'fixed',
                top: `${coords.top}px`,
                left: `${coords.left}px`,
                width: '320px',
                background: 'var(--panel, #1e293b)',
                border: 'none',
                borderRadius: '12px',
                boxShadow: isDragging ? '0 12px 40px rgba(0,0,0,0.5)' : '0 8px 30px rgba(0,0,0,0.3)',
                padding: '16px',
                zIndex: 20002,
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                transition: isDragging ? 'none' : 'transform 0.15s ease-out, opacity 0.15s ease-out',
                cursor: isDragging ? 'grabbing' : 'grab',
                color: 'var(--text, #f8fafc)',
                animation: 'fadeInUp 0.3s ease-out',
                userSelect: 'none'
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--accent, #12c7bd)', textTransform: 'uppercase' }}>
                    Step {step} of {totalSteps}
                </span>
                <button 
                    onClick={onSkip} 
                    style={{ background: 'transparent', border: 'none', color: 'var(--muted, #94a3b8)', cursor: 'pointer', fontSize: '11px' }}
                >
                    Skip
                </button>
            </div>
            
            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '800' }}>{title}</h4>
            <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.4', opacity: 0.8 }}>{text}</p>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', alignItems: 'center', width: '100%' }}>
                {step > 1 ? (
                    <button 
                        onClick={onPrev}
                        style={{
                            padding: '6px 14px',
                            fontSize: '12px',
                            fontWeight: '600',
                            borderRadius: '6px',
                            border: '1px solid var(--border, rgba(255,255,255,0.15))',
                            background: 'transparent',
                            color: 'var(--text, #f8fafc)',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            width: 'auto',
                            minHeight: 'auto',
                            height: '30px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        Back
                    </button>
                ) : <div />}
                
                {requiresAction ? (
                    <span style={{ fontSize: '11px', color: 'var(--accent, #12c7bd)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        ⚡ Perform action to advance...
                    </span>
                ) : (
                    <button 
                        onClick={onNext}
                        style={{
                            padding: '6px 14px',
                            fontSize: '12px',
                            fontWeight: '700',
                            borderRadius: '6px',
                            border: 'none',
                            background: 'var(--accent, #12c7bd)',
                            color: '#030407',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            width: 'auto',
                            minHeight: 'auto',
                            height: '30px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 2px 8px rgba(18, 199, 189, 0.25)'
                        }}
                    >
                        {step === totalSteps ? "Finish" : "Next"}
                    </button>
                )}
            </div>
        </div>
    );
};

const SpotlightMask = ({ targetSelector }) => {
    return null;
};
