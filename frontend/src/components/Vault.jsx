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

const VaultStickerImage = ({ sticker, ...props }) => {
    const [url, setUrl] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let active = true;
        if (!sticker) return;

        const load = async () => {
            // 1. E2EE Custom Sticker
            if (sticker.isCustom && sticker.fileKey) {
                setLoading(true);
                try {
                    await sodium.ready;
                    const res = await fetch(`${getBackendUrl()}/api/file/${sticker.fileId}`);
                    if (!res.ok) throw new Error("Sticker fetch failed");
                    const arrayBuffer = await res.arrayBuffer();
                    const encryptedBytes = new Uint8Array(arrayBuffer);

                    const fileKey = sodium.from_base64(sticker.fileKey);
                    const fileNonce = sodium.from_base64(sticker.nonce);
                    const decryptedBytes = sodium.crypto_secretbox_open_easy(encryptedBytes, fileNonce, fileKey);

                    if (!decryptedBytes) throw new Error("Sticker decryption failed");

                    const blob = new Blob([decryptedBytes], { type: "image/webp" });
                    const blobUrl = URL.createObjectURL(blob);
                    if (active) {
                        setUrl(blobUrl);
                    }
                } catch (err) {
                    console.error("Error decrypting custom sticker in vault:", err);
                } finally {
                    if (active) setLoading(false);
                }
                return;
            }

            // 2. E2EE System Sticker fallback (or if URL is missing/null)
            if (!sticker.isCustom && !sticker.url) {
                const STICKER_HEX_MAP = {
                    funny: ["1f602", "1f923", "1f606", "1f61c", "1f61d", "1f92a", "1f921", "1f917", "1f92d", "1f92f", "1f60f", "1f60e", "1f92c", "1f922", "1f92e", "1f92b", "1f920", "1f61b", "1f601", "1f60a"],
                    love: ["1f970", "1f60d", "1f618", "1f496", "1f49d", "1f49e", "1f49f", "1f48b", "1f495", "1f493", "1f494", "1f49c", "1f49a", "1f49b", "1f9e1", "1f90e", "1f5a4", "1f90f", "1f48d", "1f498"],
                    celebrate: ["1f389", "1f38a", "1f382", "1f3c6", "1f3c5", "1f388", "1f381", "1f973", "1f525", "1f387", "1f386", "1f514", "1f4d6", "1f4e3", "1f4e2", "1f51e", "1f4bb", "1f4c8", "1f4b0", "1f385"],
                    mood: ["1f620", "1f621", "1f624", "1f62d", "1f622", "1f62a", "1f634", "1f927", "1f97a", "1f631", "1f628", "1f627", "1f625", "1f612", "1f614", "1f61e", "1f62f", "1f62b", "1f629", "1f976"],
                    thanks: ["1f64f", "1f44d", "1f44c", "1f44f", "1f4aa", "1f91d", "1f44e", "1f446", "1f447", "1f918", "1f596", "1f590", "1f595", "1f91f", "1f44b"],
                    greetings: ["1f44b", "1f600", "1f604", "1f609", "1f607", "1f31e", "1f31c", "1f305", "1f307", "1f4ac", "1f441", "1f47d", "1f47e", "1f480", "1f916"],
                    animals: ["1f436", "1f431", "1f98a", "1f43b", "1f438", "1f43c", "1f428", "1f42f", "1f435", "1f414", "1f41f", "1f419", "1f41d", "1f40c", "1f40e", "1f410", "1f411", "1f404", "1f412", "1f407"],
                    aesthetic: ["2728", "2b50", "1f308", "1f319", "1f49f", "1f380", "1f338", "1f33f", "1f340", "1f341", "1f302", "1f30a", "1f324", "1f327", "1f32a"]
                };
                const index = parseInt(sticker.stickerId.split("_").pop(), 10);
                const hexes = STICKER_HEX_MAP[sticker.packId] || [];
                const hex = hexes[index - 1] || "1f600";
                if (active) {
                    setUrl(`https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${hex}.svg`);
                }
                return;
            }

            // 3. Regular System Sticker or Public Custom Sticker
            const targetUrl = sticker.url.startsWith("http")
                ? sticker.url
                : `${getBackendUrl()}${sticker.url}`;
            if (active) {
                setUrl(targetUrl);
            }
        };

        load();

        return () => {
            active = false;
        };
    }, [sticker]);

    if (loading) return <div className="spinner" style={{ width: '20px', height: '20px' }}></div>;
    if (!url) return null;

    return <img src={url} alt="Sticker" {...props} />;
};

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
            throw e; // Re-throw so the setup modal can show error feedback
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

                                        let isSticker = false;
                                        let stickerObj = null;
                                        if (isText && decrypted.secret) {
                                            try {
                                                if (decrypted.secret.trim().startsWith("{")) {
                                                    const parsed = JSON.parse(decrypted.secret);
                                                    if (parsed && parsed.isSticker) {
                                                        isSticker = true;
                                                        stickerObj = parsed.sticker;
                                                    }
                                                }
                                            } catch (e) {}
                                        }

                                        return (
                                            <div key={item._id} className="vault-item-card">
                                                <div className="vault-item-meta">
                                                    <span className="vault-item-type-badge">
                                                        {isSticker ? "Sticker" : (isText ? "Note" : "File")}
                                                    </span>
                                                    <span className="vault-item-time">
                                                        by {item.uploadedBy === myUsername ? "you" : item.uploadedBy}
                                                    </span>
                                                </div>

                                                {isText ? (
                                                    <div className="vault-item-data-wrap">
                                                        <div className="vault-item-label">{decrypted.label || (isSticker ? "Sticker" : "Untitled")}</div>
                                                        <div className="vault-item-secret-container" style={isSticker ? { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px', width: '100%' } : {}}>
                                                            {isSticker ? (
                                                                visibleSecrets[item._id] ? (
                                                                    <div style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', display: 'flex', justifyContent: 'center', width: '100%' }}>
                                                                        <VaultStickerImage sticker={stickerObj} style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
                                                                    </div>
                                                                ) : (
                                                                    <div className="vault-item-secret-val" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '4px', height: '36px', width: '100%', cursor: 'default' }}>
                                                                        <span style={{ fontSize: '18px' }}>🖼️</span>
                                                                        <span style={{ color: 'var(--muted)', fontSize: '13px' }}>Locked Sticker</span>
                                                                    </div>
                                                                )
                                                            ) : (
                                                                <input 
                                                                    type={visibleSecrets[item._id] ? "text" : "password"} 
                                                                    className="vault-item-secret-val"
                                                                    value={formatSecretIfVoiceJson(decrypted.secret || "")} 
                                                                    readOnly
                                                                />
                                                            )}
                                                            <div className="vault-item-actions" style={isSticker ? { position: 'static', alignSelf: 'flex-end', marginTop: '4px' } : {}}>
                                                                <button 
                                                                    className="vault-icon-action" 
                                                                    onClick={() => setVisibleSecrets(prev => ({ ...prev, [item._id]: !prev[item._id] }))}
                                                                    title={visibleSecrets[item._id] ? "Hide" : "Show"}
                                                                >
                                                                    {visibleSecrets[item._id] ? <FiEyeOff size={15} /> : <FiEye size={15} />}
                                                                </button>
                                                                {!isSticker && (
                                                                    <button 
                                                                        className="vault-icon-action" 
                                                                        onClick={() => handleCopy(formatSecretIfVoiceJson(decrypted.secret || "", true), item._id)}
                                                                        title="Copy"
                                                                    >
                                                                        {copiedStates[item._id] ? <FiCheck size={15} style={{ color: 'var(--green, #22c55e)' }} /> : <FiCopy size={15} />}
                                                                    </button>
                                                                )}
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
