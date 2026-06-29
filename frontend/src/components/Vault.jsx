import { useState, useEffect, useCallback, useRef } from "react";
import { FiX, FiPlus, FiLock, FiUnlock, FiKey, FiFile, FiTrash2, FiEye, FiEyeOff, FiCopy, FiDownload, FiCheck } from "react-icons/fi";
import { getVaultPinData } from "../utils/crypto/keydb";
import { getOrCreateVaultKey } from "../utils/crypto/manager";
import { getBackendUrl } from "../utils/config";
import { decryptVaultItem, encryptVaultItem, setupVaultPin, getVaultKeyFromSession } from "../utils/crypto/vault";
import VaultPinSetupModal from "./VaultPinSetupModal";
import VaultPinEntryModal from "./VaultPinEntryModal";
import VaultAddTextModal from "./VaultAddTextModal";
import sodium from "libsodium-wrappers-sumo";
import { formatDuration } from "../utils/voiceMessage";

function formatSecretIfVoiceJson(secretVal, returnRawForCopy = false) {
    try {
        if (secretVal && secretVal.trim().startsWith("{")) {
            const parsed = JSON.parse(secretVal);
            if (parsed && typeof parsed.transcript !== 'undefined' && typeof parsed.duration !== 'undefined') {
                const durationStr = formatDuration(parsed.duration);
                const transcriptText = parsed.transcript || "[No Speech]";
                if (returnRawForCopy) {
                    return transcriptText;
                }
                return `Voice Message (${durationStr}): "${transcriptText}"`;
            }
        }
    } catch (e) {}
    return secretVal;
}

export default function Vault({ isOpen, onClose, privateChatId, myUsername, token, vaultKey, setVaultKey }) {
    const [pinData, setPinData] = useState(null);
    const [loadingPin, setLoadingPin] = useState(true);
    
    // Modal states
    const [showSetupModal, setShowSetupModal] = useState(false);
    const [showEntryModal, setShowEntryModal] = useState(false);
    const [showAddTextModal, setShowAddTextModal] = useState(false);

    // Vault contents
    const [vaultItems, setVaultItems] = useState([]);
    const [decryptedItems, setDecryptedItems] = useState({});
    const [loadingItems, setLoadingItems] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    // UI helpers
    const [visibleSecrets, setVisibleSecrets] = useState({});
    const [copiedStates, setCopiedStates] = useState({});

    // Undo delete states
    const [undoDeleteInfo, setUndoDeleteInfo] = useState(null);
    const deleteTimeoutRef = useRef(null);

    // Clean up timeout on privateChatId change
    useEffect(() => {
        return () => {
            if (deleteTimeoutRef.current) {
                clearTimeout(deleteTimeoutRef.current);
            }
        };
    }, [privateChatId]);

    const pinId = `vault_pin_${myUsername.toLowerCase()}_${privateChatId.toLowerCase()}`;

    // Load PIN configuration
    const checkPinStatus = useCallback(async () => {
        setLoadingPin(true);
        try {
            const data = await getVaultPinData(pinId);
            setPinData(data);
            if (data) {
                // If PIN exists but we don't have vaultKey in memory, open PIN entry
                if (!vaultKey) {
                    setShowEntryModal(true);
                }
            } else {
                // If PIN doesn't exist, we need to set it up
                setShowSetupModal(true);
            }
        } catch (e) {
            console.error("Failed to read vault PIN status:", e);
        } finally {
            setLoadingPin(false);
        }
    }, [pinId, vaultKey]);

    useEffect(() => {
        if (isOpen) {
            checkPinStatus();
        } else {
            // Close all modals when panel closes
            setShowSetupModal(false);
            setShowEntryModal(false);
            setShowAddTextModal(false);
        }
    }, [isOpen, checkPinStatus]);

    // Fetch E2EE Vault items from backend
    const fetchVaultItems = useCallback(async () => {
        if (!vaultKey) return;
        setLoadingItems(true);
        setErrorMsg("");
        try {
            const res = await fetch(`${getBackendUrl()}/api/vault/${privateChatId}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!res.ok) {
                throw new Error("Failed to fetch vault items from server");
            }
            const items = await res.json();
            setVaultItems(items);

            // Decrypt items locally
            const decMap = {};
            for (const item of items) {
                try {
                    const decrypted = await decryptVaultItem(item.encryptedData, vaultKey);
                    decMap[item._id] = decrypted;
                } catch (decErr) {
                    console.error(`Failed to decrypt item ${item._id}:`, decErr);
                    decMap[item._id] = { label: "Decryption Failed", secret: "[Error]" };
                }
            }
            setDecryptedItems(decMap);
        } catch (err) {
            console.error("Vault items load error:", err);
            setErrorMsg("Could not load vault contents.");
        } finally {
            setLoadingItems(false);
        }
    }, [privateChatId, vaultKey, token]);

    // Trigger fetch when vault is unlocked
    useEffect(() => {
        if (isOpen && vaultKey) {
            fetchVaultItems();
        }
    }, [isOpen, vaultKey, fetchVaultItems]);

    // Unlock vault
    const handleUnlock = (key) => {
        setVaultKey(key);
        setShowEntryModal(false);
    };

    // Save PIN (Initial Setup or Recovery Reset)
    const handleSavePin = async (pinStr, pinType) => {
        try {
            const partnerUsername = privateChatId.split("_").find(u => u.toLowerCase() !== myUsername.toLowerCase());
            const activeVaultKey = await getOrCreateVaultKey(privateChatId, partnerUsername, token);

            await setupVaultPin(pinStr, activeVaultKey, pinType, myUsername, privateChatId);
            setVaultKey(activeVaultKey);
            setShowSetupModal(false);
            
            // Reload PIN status
            const data = await getVaultPinData(pinId);
            setPinData(data);
        } catch (e) {
            console.error("Failed to setup vault PIN:", e);
            setErrorMsg("Failed to save PIN details.");
        }
    };

    // Forgot PIN / Reset PIN Callback
    const handleResetPin = (recoveredVaultKey) => {
        // Set the recovered vault key in memory and transition to the Setup screen
        setVaultKey(recoveredVaultKey);
        setShowEntryModal(false);
        setShowSetupModal(true);
    };

    // Add text item
    const handleSaveTextItem = async ({ label, secret }) => {
        const encryptedData = await encryptVaultItem({ label, secret }, vaultKey);
        
        const response = await fetch(`${getBackendUrl()}/api/vault/${privateChatId}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ encryptedData, itemType: "text" })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || "Server failed to save text item.");
        }

        // Reload items
        await fetchVaultItems();
    };

    // Add file item
    const handleSaveFileItem = async ({ metadata, fileRef }) => {
        const encryptedData = await encryptVaultItem(metadata, vaultKey);
        
        const response = await fetch(`${getBackendUrl()}/api/vault/${privateChatId}/file`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                encryptedData,
                fileRef,
                fileName: "Encrypted File",
                fileSize: metadata.fileSize,
                fileType: metadata.fileType
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || "Server failed to save file item.");
        }

        // Reload items
        await fetchVaultItems();
    };

    const commitVaultDelete = async (itemId) => {
        try {
            const response = await fetch(`${getBackendUrl()}/api/vault/${privateChatId}/${itemId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!response.ok) {
                throw new Error("Failed to delete item from vault.");
            }
        } catch (err) {
            console.error("Failed to commit vault item deletion:", err);
        }
    };

    // Delete item with Undo capability
    const handleDeleteItem = async (itemId) => {
        const itemToDelete = vaultItems.find(item => item._id === itemId);
        if (!itemToDelete) return;

        // If there's an active undo timer, commit it immediately before starting the next one
        if (deleteTimeoutRef.current) {
            clearTimeout(deleteTimeoutRef.current);
            if (undoDeleteInfo) {
                await commitVaultDelete(undoDeleteInfo.itemId);
            }
        }

        const decryptedVal = decryptedItems[itemId];

        // Hide locally
        setVaultItems(prev => prev.filter(item => item._id !== itemId));
        setDecryptedItems(prev => {
            const next = { ...prev };
            delete next[itemId];
            return next;
        });

        // Set undo state details
        setUndoDeleteInfo({
            itemId,
            originalItem: itemToDelete,
            originalDecrypted: decryptedVal
        });

        // Start 5-second commit timer
        deleteTimeoutRef.current = setTimeout(async () => {
            await commitVaultDelete(itemId);
            setUndoDeleteInfo(null);
            deleteTimeoutRef.current = null;
        }, 5000);
    };

    const executeUndoVaultDelete = () => {
        if (deleteTimeoutRef.current) {
            clearTimeout(deleteTimeoutRef.current);
            deleteTimeoutRef.current = null;
        }

        if (undoDeleteInfo) {
            // Restore locally
            setVaultItems(prev => {
                if (prev.some(item => item._id === undoDeleteInfo.itemId)) return prev;
                const nextList = [...prev, undoDeleteInfo.originalItem];
                return nextList.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            });
            if (undoDeleteInfo.originalDecrypted) {
                setDecryptedItems(prev => ({
                    ...prev,
                    [undoDeleteInfo.itemId]: undoDeleteInfo.originalDecrypted
                }));
            }
            setUndoDeleteInfo(null);
        }
    };

    // Lock Vault manually
    const handleLockVault = () => {
        setVaultKey(null); // Clear key from state (this will also invoke memzero inside the state setter in Chat.jsx)
        onClose(); // Close vault panel and return to chat directly
    };

    // Close vault panel and lock it
    const handleClosePanel = () => {
        setVaultKey(null); // Clear key from state
        onClose(); // Close panel
    };

    const handleCopy = (text, id) => {
        navigator.clipboard.writeText(text);
        setCopiedStates(prev => ({ ...prev, [id]: true }));
        setTimeout(() => {
            setCopiedStates(prev => ({ ...prev, [id]: false }));
        }, 2000);
    };

    const formatBytes = (bytes) => {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    };

    const triggerDownload = (fileUrl, fileName) => {
        const link = document.createElement("a");
        link.href = `${getBackendUrl()}${fileUrl}`;
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <>
            <div className={`vault-panel ${isOpen ? "active" : ""}`}>
                <div className="vault-panel-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FiLock className="vault-lock-icon" style={{ color: vaultKey ? "var(--accent)" : "var(--muted)" }} />
                        <h3 className="vault-panel-title">Shared Vault</h3>
                    </div>
                    <button className="vault-close-btn" onClick={handleClosePanel} aria-label="Close vault panel">
                        <FiX size={20} />
                    </button>
                </div>

                <div className="vault-panel-body">
                    {/* Vault status banner */}
                    <div className={`vault-status-banner ${vaultKey ? "unlocked" : "locked"}`}>
                        {vaultKey ? (
                            <>
                                <FiUnlock style={{ marginRight: '6px' }} />
                                <span>Unlocked (End-to-End Encrypted)</span>
                                <button className="vault-lock-btn-action" onClick={handleLockVault}>Lock</button>
                            </>
                        ) : (
                            <>
                                <FiLock style={{ marginRight: '6px' }} />
                                <span>Locked</span>
                                {pinData && (
                                    <button className="vault-lock-btn-action" onClick={() => setShowEntryModal(true)}>Unlock</button>
                                )}
                            </>
                        )}
                    </div>

                    {errorMsg && (
                        <div className="vault-error-inline" style={{ margin: '15px' }}>
                            {errorMsg}
                        </div>
                    )}

                    {vaultKey ? (
                        <div className="vault-content-container">
                            <div className="vault-action-row">
                                <button className="vault-action-btn" onClick={() => setShowAddTextModal(true)}>
                                    <FiPlus /> Add Password
                                </button>
                            </div>

                            {loadingItems ? (
                                <div className="vault-loader center">
                                    <div className="spinner"></div>
                                    <span>Decrypting vault items...</span>
                                </div>
                            ) : vaultItems.length === 0 ? (
                                <div className="vault-empty-state center">
                                    <FiKey size={36} style={{ color: 'var(--muted)', marginBottom: '10px' }} />
                                    <p>Your E2EE vault is empty.</p>
                                    <span>Add passwords, secure notes, or files that only you and your contact can decrypt.</span>
                                </div>
                            ) : (
                                <div className="vault-items-list">
                                    {vaultItems.map(item => {
                                        const decrypted = decryptedItems[item._id] || {};
                                        const isText = item.itemType === "text";

                                        return (
                                            <div key={item._id} className="vault-item-card">
                                                <div className="vault-item-meta">
                                                    <span className="vault-item-type-badge">
                                                        {isText ? "Note" : "File"}
                                                    </span>
                                                    <span className="vault-item-time">
                                                        by {item.uploadedBy === myUsername ? "you" : item.uploadedBy}
                                                    </span>
                                                </div>

                                                {isText ? (
                                                    <div className="vault-item-data-wrap">
                                                        <div className="vault-item-label">{decrypted.label || "Untitled"}</div>
                                                        <div className="vault-item-secret-container">
                                                            <input 
                                                                type={visibleSecrets[item._id] ? "text" : "password"} 
                                                                className="vault-item-secret-val"
                                                                value={formatSecretIfVoiceJson(decrypted.secret || "")} 
                                                                readOnly
                                                            />
                                                            <div className="vault-item-actions">
                                                                <button 
                                                                    className="vault-icon-action" 
                                                                    onClick={() => setVisibleSecrets(prev => ({ ...prev, [item._id]: !prev[item._id] }))}
                                                                    title={visibleSecrets[item._id] ? "Hide" : "Show"}
                                                                >
                                                                    {visibleSecrets[item._id] ? <FiEyeOff size={15} /> : <FiEye size={15} />}
                                                                </button>
                                                                <button 
                                                                    className="vault-icon-action" 
                                                                    onClick={() => handleCopy(formatSecretIfVoiceJson(decrypted.secret || "", true), item._id)}
                                                                    title="Copy"
                                                                >
                                                                    {copiedStates[item._id] ? <FiCheck size={15} style={{ color: 'var(--green, #22c55e)' }} /> : <FiCopy size={15} />}
                                                                </button>
                                                                <button 
                                                                    className="vault-icon-action danger" 
                                                                    onClick={() => handleDeleteItem(item._id)}
                                                                    title="Delete"
                                                                >
                                                                    <FiTrash2 size={15} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="vault-item-data-wrap">
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <FiFile size={22} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                                <div className="vault-item-filename" title={decrypted.fileName}>
                                                                    {decrypted.fileName || "file"}
                                                                </div>
                                                                <div className="vault-item-filesize">
                                                                    {formatBytes(decrypted.fileSize || 0)}
                                                                </div>
                                                            </div>
                                                            <div className="vault-item-actions" style={{ position: 'static' }}>
                                                                <button 
                                                                    className="vault-icon-action" 
                                                                    onClick={() => triggerDownload(item.fileRef, decrypted.fileName)}
                                                                    title="Download File"
                                                                >
                                                                    <FiDownload size={15} />
                                                                </button>
                                                                <button 
                                                                    className="vault-icon-action danger" 
                                                                    onClick={() => handleDeleteItem(item._id)}
                                                                    title="Delete"
                                                                >
                                                                    <FiTrash2 size={15} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="vault-locked-state center">
                            <FiLock size={48} style={{ color: 'var(--muted)', marginBottom: '15px' }} />
                            <h3>Vault Access Required</h3>
                            <p>Please unlock the vault with your PIN to view or add secure credentials.</p>
                            {pinData ? (
                                <button className="auth-btn vault-setup-btn" onClick={() => setShowEntryModal(true)} style={{ marginTop: '15px' }}>
                                    Enter PIN
                                </button>
                            ) : (
                                <div style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '15px' }}>
                                    Loading E2EE status...
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Render Vault Delete Undo Toast inside the panel! */}
                {undoDeleteInfo && (
                    <div className="vault-undo-toast">
                        <span className="vault-undo-toast-text">
                            &bull; Item deleted from vault
                        </span>
                        <button 
                            type="button" 
                            className="vault-undo-toast-btn" 
                            onClick={executeUndoVaultDelete}
                        >
                            Undo
                        </button>
                    </div>
                )}
            </div>

            {/* Render PIN Setup Modal */}
            {showSetupModal && (
                <VaultPinSetupModal 
                    onClose={() => {
                        setShowSetupModal(false);
                        // If no PIN exists yet, close the vault panel too
                        if (!pinData) onClose();
                    }} 
                    onSave={handleSavePin} 
                />
            )}

            {/* Render PIN Entry Modal */}
            {showEntryModal && pinData && (
                <VaultPinEntryModal 
                    onClose={() => {
                        setShowEntryModal(false);
                        // If vault is not unlocked, close the vault panel too
                        if (!vaultKey) onClose();
                    }}
                    pinData={pinData}
                    onUnlock={handleUnlock}
                    onResetPin={handleResetPin}
                    privateChatId={privateChatId}
                    myUsername={myUsername}
                />
            )}

            {/* Render Add Text Modal */}
            {showAddTextModal && (
                <VaultAddTextModal 
                    onClose={() => setShowAddTextModal(false)}
                    onSave={handleSaveTextItem}
                />
            )}

        </>
    );
}
