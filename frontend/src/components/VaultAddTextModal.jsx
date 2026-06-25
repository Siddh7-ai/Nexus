import { useState } from "react";
import { FiX, FiCheckCircle } from "react-icons/fi";
import { SmoothInput } from "./SmoothInput";

export default function VaultAddTextModal({ onClose, onSave }) {
    const [label, setLabel] = useState("");
    const [secret, setSecret] = useState("");
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        if (!label.trim() || !secret.trim()) return;

        setSaving(true);
        setErrorMsg("");
        try {
            await onSave({ label: label.trim(), secret: secret.trim() });
            onClose();
        } catch (err) {
            console.error("Failed to save text vault item:", err);
            setErrorMsg(err.message || "Failed to encrypt and upload vault item");
            setSaving(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content vault-pin-modal" onClick={e => e.stopPropagation()}>
                <button className="vault-modal-close-red" onClick={onClose} aria-label="Close modal">
                    <FiX size={20} />
                </button>

                <div className="modal-header-section">
                    <h3 className="vault-modal-title">📝 Add Password or Note</h3>
                    <p className="vault-modal-subtitle">Items are encrypted locally before being uploaded to the server.</p>
                </div>

                <form onSubmit={handleSubmit} className="vault-form" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    <div className="auth-field">
                        <label>Label / Title</label>
                        <SmoothInput
                            type="text"
                            placeholder="e.g. My Amazon Password, Vault Entry"
                            value={label}
                            onChange={e => setLabel(e.target.value)}
                            maxLength={100}
                            required
                            disabled={saving}
                        />
                    </div>

                    <div className="auth-field">
                        <label>Secret Value / Password</label>
                        <SmoothInput
                            type="text"
                            placeholder="Type or paste secret content here"
                            value={secret}
                            onChange={e => setSecret(e.target.value)}
                            required
                            disabled={saving}
                        />
                    </div>

                    {errorMsg && (
                        <div className="vault-error-inline">{errorMsg}</div>
                    )}

                    <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                        <button 
                            type="button" 
                            className="auth-btn cancel-btn" 
                            onClick={onClose} 
                            disabled={saving}
                            style={{ 
                                flex: 1, 
                                background: 'rgba(255, 255, 255, 0.05)', 
                                border: '1px solid rgba(255, 255, 255, 0.1)', 
                                color: 'var(--text)' 
                            }}
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            className="auth-btn vault-setup-btn" 
                            disabled={saving || !label.trim() || !secret.trim()}
                            style={{ flex: 1, margin: 0 }}
                        >
                            {saving ? "Encrypting & Saving..." : "Save Securely"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
