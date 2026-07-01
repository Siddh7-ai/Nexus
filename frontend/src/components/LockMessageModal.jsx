import { useState, useEffect } from "react";
import { FiX, FiCheck } from "react-icons/fi";
import { SmoothInput } from "./SmoothInput";
import { getVaultPinData } from "../utils/crypto/keydb";
import { verifyVaultPin, decryptVaultKeyWithPin, encryptVaultItem, setupVaultPin } from "../utils/crypto/vault";
import { getOrCreateVaultKey } from "../utils/crypto/manager";
import { getBackendUrl } from "../utils/config";
import sodium from "libsodium-wrappers-sumo";

export default function LockMessageModal({ msg, onClose, privateChatId, myUsername, token, onLockSuccess }) {
    const [step, setStep] = useState("pin"); // "pin" | "label"
    const [pinData, setPinData] = useState(null);
    const [loadingPin, setLoadingPin] = useState(true);
    const [enteredPin, setEnteredPin] = useState("");
    const [vaultKey, setVaultKey] = useState(null);
    
    // UI Feedback states
    const [errorMsg, setErrorMsg] = useState("");
    const [shake, setShake] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    
    // Label input state
    const [label, setLabel] = useState(
        msg.sticker
            ? `Sticker (${msg.sticker.packId || "custom"})`
            : `Locked Message (${new Date().toLocaleDateString()})`
    );

    const pinId = `vault_pin_${myUsername.toLowerCase()}_${privateChatId.toLowerCase()}`;

    useEffect(() => {
        const loadPinData = async () => {
            try {
                const data = await getVaultPinData(pinId);
                setPinData(data);
            } catch (e) {
                console.error("Failed to load vault PIN data:", e);
                setErrorMsg("Failed to read vault PIN configuration.");
            } finally {
                setLoadingPin(false);
            }
        };
        loadPinData();
    }, [pinId]);

    const pinType = pinData?.pinType || "4digit";
    const limit = pinType === "4digit" ? 4 : 6;

    // Auto-verify for numeric PINs when limit is reached
    useEffect(() => {
        if (step !== "pin" || !pinData || pinType === "custom") return;

        if (enteredPin.length === limit) {
            verifyAndTransition();
        }
    }, [enteredPin, step, pinData, pinType, limit]);

    const triggerShake = () => {
        setShake(true);
        setTimeout(() => setShake(false), 500);
    };
    const verifyAndTransition = async (e) => {
        if (e) e.preventDefault();
        setErrorMsg("");

        if (!enteredPin) return;

        const isPinCorrect = await verifyVaultPin(enteredPin, pinData);
        if (isPinCorrect) {
            const rawVaultKey = await decryptVaultKeyWithPin(enteredPin, pinData);
            if (rawVaultKey) {
                // Auto-healing check
                try {
                    const partnerUsername = privateChatId.split("_").find(u => u.toLowerCase() !== myUsername.toLowerCase());
                    const staticVaultKey = await getOrCreateVaultKey(privateChatId, partnerUsername, token);
                    
                    if (!sodium.memcmp(rawVaultKey, staticVaultKey)) {
                        console.log("Vault key mismatch in LockMessageModal! Auto-healing vault PIN with the correct static vault key...");
                        await setupVaultPin(enteredPin, staticVaultKey, pinData.pinType || "4digit", myUsername, privateChatId);
                        setVaultKey(staticVaultKey);
                        setStep("label");
                        setErrorMsg("");
                        return;
                    }
                } catch (healErr) {
                    console.error("Auto-healing vault key in LockMessageModal failed, continuing with current key:", healErr);
                }

                setVaultKey(rawVaultKey);
                setStep("label");
                setErrorMsg("");
                return;
            }
        }
        
        // Handle incorrect attempt
        triggerShake();
        setEnteredPin("");
        setErrorMsg("Incorrect Password / PIN");
    };
    const handleLockConfirm = async (e) => {
        if (e) e.preventDefault();
        if (!label.trim()) {
            setErrorMsg("Please enter a label for this item.");
            return;
        }

        setSubmitting(true);
        setErrorMsg("");

        try {
            // 1. Encrypt message text (or sticker data) with vault key
            let plaintextMsg = msg.text || "";
            if (msg.sticker) {
                plaintextMsg = JSON.stringify({
                    isSticker: true,
                    sticker: msg.sticker
                });
            }
            const encryptedData = await encryptVaultItem({ label, secret: plaintextMsg }, vaultKey);

            // 2. POST to shared vault
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
                throw new Error(errData.error || "Failed to save vault item.");
            }

            const savedItem = await response.json();

            // 3. Callback to trigger lockMessage socket event
            onLockSuccess(msg._id, savedItem._id);
        } catch (err) {
            console.error("Lock message confirm failed:", err);
            setErrorMsg(err.message || "Failed to lock message.");
            setSubmitting(false);
        }
    };

    if (loadingPin) {
        return (
            <div className="modal-overlay" onClick={onClose}>
                <div className="modal-content vault-pin-modal center" style={{ padding: '30px' }} onClick={e => e.stopPropagation()}>
                    <div className="spinner" style={{ marginBottom: '10px' }}></div>
                    <span>Checking E2EE Lock details...</span>
                </div>
            </div>
        );
    }

    if (!pinData) {
        return (
            <div className="modal-overlay" onClick={onClose}>
                <div className="modal-content vault-pin-modal" style={{ padding: '30px' }} onClick={e => e.stopPropagation()}>
                    <button className="vault-modal-close-red" onClick={onClose} aria-label="Close modal">
                        <FiX size={20} />
                    </button>
                    <div className="modal-header-section" style={{ textAlign: 'center' }}>
                        <h3 className="vault-modal-title">🔒 Shared Vault Required</h3>
                        <p className="vault-modal-subtitle" style={{ marginTop: '10px', color: 'var(--muted)', fontSize: '13px' }}>
                            You must configure a Shared Vault PIN for this private chat room before locking messages.
                        </p>
                        <p style={{ marginTop: '10px', fontSize: '12px', color: 'var(--muted)' }}>
                            Click the Shared Vault (briefcase/lock) icon in the header bar to setup a PIN.
                        </p>
                    </div>
                    <button className="auth-btn vault-setup-btn" onClick={onClose} style={{ marginTop: '20px', width: '100%' }}>
                        OK
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content vault-pin-modal" onClick={e => e.stopPropagation()}>
                <button className="vault-modal-close-red" onClick={onClose} aria-label="Close modal">
                    <FiX size={20} />
                </button>

                {step === "pin" ? (
                    <>
                        <div className="modal-header-section">
                            <h3 className="vault-modal-title">🔒 Lock Message</h3>
                            <p className="vault-modal-subtitle">Enter your Shared Vault PIN to verify ownership</p>
                        </div>

                        <form onSubmit={verifyAndTransition} className="vault-form">
                            <div className={`auth-field ${shake ? "shake-animate" : ""}`} style={{ marginBottom: '15px' }}>
                                <div className="auth-input-wrap" style={{ position: 'relative' }}>
                                    <SmoothInput
                                        type="password"
                                        placeholder="Enter PIN / Password"
                                        value={enteredPin}
                                        onChange={e => {
                                            let val = e.target.value;
                                            if (pinType !== "custom") {
                                                val = val.replace(/\D/g, "");
                                                if (val.length > limit) {
                                                    val = val.slice(0, limit);
                                                }
                                            }
                                            setEnteredPin(val);
                                        }}
                                        autoFocus={true}
                                        allowEmoji={true}
                                    />
                                </div>
                                <button type="submit" className="auth-btn vault-setup-btn" style={{ marginTop: '15px', width: '100%' }}>
                                    Next
                                </button>
                            </div>
                            {errorMsg && (
                                <div className="vault-error-inline center" style={{ marginTop: '10px' }}>{errorMsg}</div>
                            )}
                        </form>
                    </>
                ) : (
                    <>
                        <div className="modal-header-section" style={{ textAlign: 'center' }}>
                             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', borderRadius: '50%', background: 'var(--accent-soft)', margin: '0 auto 12px', color: 'var(--accent)', fontSize: '20px' }}>
                                 <FiCheck />
                             </div>
                            <h3 className="vault-modal-title">E2EE Verified</h3>
                            <p className="vault-modal-subtitle">Give this locked secret a label for your Shared Vault</p>
                        </div>

                        <form onSubmit={handleLockConfirm} className="vault-form">
                            <div className="auth-field">
                                <label>Vault Item Label</label>
                                <div className="auth-input-wrap">
                                    <SmoothInput
                                        type="text"
                                        placeholder="E.g. Bank details, private message"
                                        value={label}
                                        onChange={e => setLabel(e.target.value)}
                                        disabled={submitting}
                                        required
                                    />
                                </div>
                            </div>

                            {errorMsg && (
                                <div className="vault-error-inline">{errorMsg}</div>
                            )}

                            <button type="submit" className="auth-btn vault-setup-btn" style={{ marginTop: '15px', width: '100%' }} disabled={submitting}>
                                {submitting ? "Securing & Locking..." : "Confirm & Lock"}
                            </button>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}
