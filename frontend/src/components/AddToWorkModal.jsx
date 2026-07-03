import React, { useState, useEffect } from "react";
import { FiX, FiAlertTriangle } from "react-icons/fi";
import { encryptVaultItem, getVaultKeyFromSession } from "../utils/crypto/vault";

export default function AddToWorkModal({ isOpen, message, users, myUsername, isPrivateChat, activeChatId, onClose, onSubmit }) {
    const [form, setForm] = useState({
        title: "",
        description: "",
        type: "task",
        priority: "medium",
        assignee_id: myUsername,
        assignees: [myUsername],
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
                assignees: [myUsername],
                due_date: "",
                visibility: isPrivateChat ? "private" : "workspace",
                severity: "medium"
            });
        }
    }, [message, isPrivateChat, activeChatId, myUsername]);

    if (!isOpen || !message) return null;

    const handleSubmitForm = async (e) => {
        e.preventDefault();
        
        let encryptedPayload = null;
        let finalTitle = form.title;
        let finalDescription = form.description;

        if (isPrivateChat) {
            try {
                const vaultKey = await getVaultKeyFromSession(activeChatId);
                if (vaultKey) {
                    const encrypted = await encryptVaultItem({
                        title: form.title,
                        description: form.description
                    }, vaultKey);
                    encryptedPayload = encrypted;
                    finalTitle = "🔒 Encrypted Task";
                    finalDescription = "🔒 Encrypted Description";
                } else {
                    console.warn("Vault key not found for private chat, falling back to plaintext");
                }
            } catch (err) {
                console.error("Failed to encrypt task payload:", err);
            }
        }

        onSubmit({
            title: finalTitle,
            description: finalDescription,
            type: form.type,
            priority: form.priority,
            assignee_id: form.assignee_id,
            assignees: form.assignees,
            encryptedPayload,
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
                                This task will be client-side encrypted and securely stored in the database.
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
                            {users.map(u => {
                                const isChecked = form.assignees.includes(u.username);
                                return (
                                    <label key={u.username} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => {
                                                setForm(prev => {
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
