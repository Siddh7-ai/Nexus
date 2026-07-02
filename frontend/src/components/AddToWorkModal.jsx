import React, { useState, useEffect } from "react";
import { FiX, FiAlertTriangle } from "react-icons/fi";

export default function AddToWorkModal({ isOpen, message, users, myUsername, isPrivateChat, activeChatId, onClose, onSubmit }) {
    const [form, setForm] = useState({
        title: "",
        description: "",
        type: "task",
        priority: "medium",
        assignee_id: myUsername,
        due_date: "",
        visibility: isPrivateChat ? "private" : "workspace",
        severity: "medium"
    });

    useEffect(() => {
        if (message) {
            setForm({
                title: message.text || "Task from Chat Message",
                description: `Created from message in chat room: ${activeChatId}`,
                type: "task",
                priority: "medium",
                assignee_id: myUsername,
                due_date: "",
                visibility: isPrivateChat ? "private" : "workspace",
                severity: "medium"
            });
        }
    }, [message, isPrivateChat, activeChatId, myUsername]);

    if (!isOpen || !message) return null;

    const handleSubmitForm = (e) => {
        e.preventDefault();
        onSubmit({
            title: form.title,
            description: form.description,
            type: form.type,
            priority: form.priority,
            assignee_id: form.assignee_id,
            due_date: form.due_date || null,
            visibility: form.visibility,
            severity: form.type === "issue" ? form.severity : null,
            created_from: {
                chat_id: activeChatId,
                message_id: message._id,
                sender_id: message.username
            }
        });
    };

    return (
        <div className="workspace-detail-overlay">
            <form className="workspace-detail-modal" onSubmit={handleSubmitForm}>
                <div className="modal-header">
                    <h3>Add to Workspace</h3>
                    <button type="button" className="modal-close-btn" onClick={onClose}>
                        <FiX size={18} />
                    </button>
                </div>
                <div className="modal-body">
                    {/* E2EE Warning notice */}
                    {isPrivateChat && (
                        <div className="e2ee-disclosure-box">
                            <FiAlertTriangle className="e2ee-disclosure-icon" size={16} />
                            <span>
                                This text will be saved outside the encrypted chat and visible to @{form.assignee_id || myUsername}.
                            </span>
                        </div>
                    )}

                    <div className="form-group">
                        <label>Task Title</label>
                        <input
                            type="text"
                            className="form-control"
                            value={form.title}
                            onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Description</label>
                        <textarea
                            className="form-control"
                            rows={3}
                            value={form.description}
                            onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                        />
                    </div>

                    <div className="form-group">
                        <label>Item Type</label>
                        <select
                            className="form-control"
                            value={form.type}
                            onChange={(e) => setForm(prev => ({ ...prev, type: e.target.value, visibility: e.target.value === "issue" && isPrivateChat ? "private" : prev.visibility }))}
                        >
                            <option value="task">Task</option>
                            <option value="issue">Issue</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Assignee</label>
                        <select
                            className="form-control"
                            value={form.assignee_id}
                            onChange={(e) => setForm(prev => ({ ...prev, assignee_id: e.target.value }))}
                        >
                            {users.map(u => (
                                <option key={u.username} value={u.username}>@{u.username}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Priority</label>
                        <select
                            className="form-control"
                            value={form.priority}
                            onChange={(e) => setForm(prev => ({ ...prev, priority: e.target.value }))}
                        >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                        </select>
                    </div>

                    {form.type === "issue" && (
                        <div className="form-group">
                            <label>Issue Severity</label>
                            <select
                                className="form-control"
                                value={form.severity}
                                onChange={(e) => setForm(prev => ({ ...prev, severity: e.target.value }))}
                            >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                                <option value="critical">Critical</option>
                            </select>
                        </div>
                    )}

                    <div className="form-group">
                        <label>Due Date</label>
                        <input
                            type="date"
                            className="form-control"
                            value={form.due_date}
                            onChange={(e) => setForm(prev => ({ ...prev, due_date: e.target.value }))}
                        />
                    </div>

                    <div className="form-group">
                        <label>Visibility Access</label>
                        <select
                            className="form-control"
                            value={form.visibility}
                            onChange={(e) => setForm(prev => ({ ...prev, visibility: e.target.value }))}
                        >
                            <option value="workspace">Workspace (Org-Wide)</option>
                            <option value="private">Private (Only Creator & Assignee)</option>
                        </select>
                    </div>
                </div>
                <div className="modal-footer">
                    <button type="button" className="modal-btn cancel" onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="modal-btn submit">
                        Add to work
                    </button>
                </div>
            </form>
        </div>
    );
}
