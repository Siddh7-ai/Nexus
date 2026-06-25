import { useState, useRef } from "react";
import { FiX, FiUploadCloud, FiFile } from "react-icons/fi";
import { getBackendUrl } from "../utils/config";
import { encryptVaultItem } from "../utils/crypto/vault";

export default function VaultAddFileModal({ onClose, onSave, token }) {
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [errorMsg, setErrorMsg] = useState("");
    const fileInputRef = useRef(null);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setErrorMsg("");
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setFile(e.dataTransfer.files[0]);
            setErrorMsg("");
        }
    };

    const formatBytes = (bytes) => {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        if (!file) return;

        setUploading(true);
        setErrorMsg("");
        setUploadProgress(10);

        try {
            // 1. Upload file to GridFS via /api/upload
            const formData = new FormData();
            formData.append("file", file);

            setUploadProgress(30);
            const response = await fetch(`${getBackendUrl()}/api/upload`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || "Failed to upload file to backend storage.");
            }

            setUploadProgress(70);
            const data = await response.json();
            
            // 2. Prepare encrypted metadata payload
            const metadata = {
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type
            };

            // Invoke onSave to encrypt and submit the record to /api/vault/:privateChatId/file
            await onSave({
                metadata,
                fileRef: data.fileUrl // data.fileUrl contains '/api/file/:id'
            });

            setUploadProgress(100);
            onClose();
        } catch (err) {
            console.error("Vault file upload/save failed:", err);
            setErrorMsg(err.message || "An error occurred during upload.");
            setUploading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content vault-pin-modal" onClick={e => e.stopPropagation()}>
                <button className="vault-modal-close-red" onClick={onClose} aria-label="Close modal">
                    <FiX size={20} />
                </button>

                <div className="modal-header-section">
                    <h3 className="vault-modal-title">📁 Upload Secure File</h3>
                    <p className="vault-modal-subtitle">Files are stored in GridFS and their metadata is end-to-end encrypted.</p>
                </div>

                <form onSubmit={handleSubmit} className="vault-form">
                    <div 
                        className={`dropzone ${file ? "has-file" : ""}`}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onClick={() => !uploading && fileInputRef.current?.click()}
                        style={{
                            border: '2px dashed rgba(255, 255, 255, 0.15)',
                            borderRadius: '12px',
                            padding: '30px 20px',
                            textAlign: 'center',
                            cursor: uploading ? 'default' : 'pointer',
                            background: 'rgba(255, 255, 255, 0.02)',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '12px'
                        }}
                    >
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            style={{ display: "none" }} 
                            onChange={handleFileChange}
                            disabled={uploading}
                        />

                        {file ? (
                            <>
                                <FiFile size={40} style={{ color: 'var(--accent)' }} />
                                <div style={{ fontSize: '14px', fontWeight: '600', wordBreak: 'break-all', color: 'var(--text)' }}>
                                    {file.name}
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                                    {formatBytes(file.size)}
                                </div>
                            </>
                        ) : (
                            <>
                                <FiUploadCloud size={40} style={{ color: 'var(--muted)' }} />
                                <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text)' }}>
                                    Drag & drop file here or click to browse
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                    Any file type up to 50MB
                                </div>
                            </>
                        )}
                    </div>

                    {uploading && (
                        <div style={{ width: '100%', marginTop: '15px' }}>
                            <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s ease' }}></div>
                            </div>
                            <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--muted)', marginTop: '6px' }}>
                                {uploadProgress < 100 ? "Uploading & Encrypting..." : "Saved!"}
                            </div>
                        </div>
                    )}

                    {errorMsg && (
                        <div className="vault-error-inline" style={{ marginTop: '15px' }}>{errorMsg}</div>
                    )}

                    <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                        <button 
                            type="button" 
                            className="auth-btn cancel-btn" 
                            onClick={onClose} 
                            disabled={uploading}
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
                            disabled={uploading || !file}
                            style={{ flex: 1, margin: 0 }}
                        >
                            {uploading ? "Uploading..." : "Upload & Save"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
