import { useState, useEffect, useRef } from "react";
import { FiX, FiEye, FiEyeOff } from "react-icons/fi";
import { SmoothInput } from "./SmoothInput";
import { getBackendUrl } from "../utils/config";
import { verifyVaultPin, decryptVaultKeyWithPin, getVaultKeyFromSession } from "../utils/crypto/vault";

export default function VaultPinEntryModal({ onClose, pinData, onUnlock, onResetPin, privateChatId, myUsername }) {
    const [enteredPin, setEnteredPin] = useState("");
    
    // Attempt counters and lockouts (stored in memory/React state)
    const [attempts, setAttempts] = useState(0);
    const [lockoutTime, setLockoutTime] = useState(0); // in seconds
    const [shake, setShake] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    // Forgot PIN states
    const [showRecover, setShowRecover] = useState(false);
    const [recoverPassword, setRecoverPassword] = useState("");
    const [recoverError, setRecoverError] = useState("");
    const [verifying, setVerifying] = useState(false);

    const pinType = pinData.pinType || "4digit";
    const limit = pinType === "4digit" ? 4 : 6;
    
    useEffect(() => {
        if (lockoutTime <= 0) return;
        const timer = setInterval(() => {
            setLockoutTime(prev => {
                if (prev <= 1) {
                    setAttempts(0);
                    setErrorMsg("");
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [lockoutTime]);

    // Auto-unlock logic
    useEffect(() => {
        if (lockoutTime > 0) return;

        const autoCheck = async () => {
            if (pinType === "custom") {
                // For custom password, check on every keystroke if it's correct
                if (enteredPin.length < 4) return;
                const isPinCorrect = await verifyVaultPin(enteredPin, pinData);
                if (isPinCorrect) {
                    const rawVaultKey = await decryptVaultKeyWithPin(enteredPin, pinData);
                    if (rawVaultKey) {
                        onUnlock(rawVaultKey);
                    }
                }
            } else {
                // For numeric PINs, when length matches limit, automatically verify
                if (enteredPin.length === limit) {
                    const isPinCorrect = await verifyVaultPin(enteredPin, pinData);
                    if (isPinCorrect) {
                        const rawVaultKey = await decryptVaultKeyWithPin(enteredPin, pinData);
                        if (rawVaultKey) {
                            onUnlock(rawVaultKey);
                            return;
                        }
                    }
                    // Wrong numeric PIN: increment attempts, shake, clear input, set error
                    const nextAttempts = attempts + 1;
                    setAttempts(nextAttempts);
                    triggerShake();
                    setEnteredPin("");

                    if (nextAttempts >= 5) {
                        setLockoutTime(30);
                        setErrorMsg("Too many attempts. Try again in 30s.");
                    } else {
                        setErrorMsg(`Incorrect PIN (${5 - nextAttempts} attempts remaining)`);
                    }
                }
            }
        };

        autoCheck();
    }, [enteredPin, pinType, limit, pinData, lockoutTime, onUnlock, attempts]);

    const handleNumericKeyPress = (val) => {
        if (lockoutTime > 0) return;
        if (enteredPin.length < limit) {
            setEnteredPin(prev => prev + val);
        }
    };

    const handleNumericBackspace = () => {
        if (lockoutTime > 0) return;
        setEnteredPin(prev => prev.slice(0, -1));
    };

    // Keyboard support for numeric entry
    useEffect(() => {
        if (pinType === "custom" || showRecover || lockoutTime > 0) return;

        const handleKeyDown = (e) => {
            if (/^[0-9]$/.test(e.key)) {
                e.preventDefault();
                setEnteredPin(prev => (prev.length < limit ? prev + e.key : prev));
            } else if (e.key === "Backspace") {
                e.preventDefault();
                setEnteredPin(prev => prev.slice(0, -1));
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [pinType, showRecover, lockoutTime, limit]);

    const triggerShake = () => {
        setShake(true);
        setTimeout(() => setShake(false), 500);
    };

    const handleUnlockSubmit = async (e) => {
        if (e) e.preventDefault();
        if (lockoutTime > 0) return;

        // Validation checks
        const isLengthValid = pinType === "4digit" ? enteredPin.length === 4 : (pinType === "6digit" ? enteredPin.length === 6 : enteredPin.length > 0);
        if (!isLengthValid) return;

        const isPinCorrect = await verifyVaultPin(enteredPin, pinData);
        if (isPinCorrect) {
            // Decrypt the vault key using the PIN derived key
            const rawVaultKey = await decryptVaultKeyWithPin(enteredPin, pinData);
            if (rawVaultKey) {
                onUnlock(rawVaultKey);
                return;
            } else {
                setErrorMsg("Decryption failed. Please try again.");
            }
        }

        // Wrong attempt handling for custom password (triggered on form submit/enter)
        const nextAttempts = attempts + 1;
        setAttempts(nextAttempts);
        triggerShake();
        setEnteredPin("");

        if (nextAttempts >= 5) {
            setLockoutTime(30);
            setErrorMsg("Too many attempts. Try again in 30s.");
        } else {
            setErrorMsg(`Incorrect PIN (${5 - nextAttempts} attempts remaining)`);
        }
    };

    // Recover PIN flow
    const handleRecoverSubmit = async (e) => {
        if (e) e.preventDefault();
        if (verifying || !recoverPassword) return;

        setVerifying(true);
        setRecoverError("");

        try {
            // Determine user login credentials - fetch email or username
            let loginIdentifier = myUsername;
            // Retrieve own profile email from localStorage if available, or just username
            const localOwnProfile = localStorage.getItem("ownProfileData");
            if (localOwnProfile) {
                try {
                    const parsed = JSON.parse(localOwnProfile);
                    if (parsed && parsed.email) {
                        loginIdentifier = parsed.email;
                    }
                } catch (e) {}
            }

            // Verify password against backend
            const response = await fetch(`${getBackendUrl()}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: loginIdentifier, password: recoverPassword })
            });
            const data = await response.json();

            if (response.ok) {
                // Fetch the raw E2EE vault key from the IndexedDB session state (encrypted with master key)
                const rawVaultKey = await getVaultKeyFromSession(privateChatId);
                if (rawVaultKey) {
                    // Trigger the reset flow (shows PIN setup modal)
                    onResetPin(rawVaultKey);
                } else {
                    setRecoverError("Failed to decrypt vault key from session record. Is your E2EE key bundle missing?");
                }
            } else {
                setRecoverError(data.message || "Incorrect login password");
            }
        } catch (err) {
            console.error("Recover password verification failed:", err);
            setRecoverError("Cannot connect to authorization server.");
        } finally {
            setRecoverPassword("");
            setVerifying(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content vault-pin-modal" onClick={e => e.stopPropagation()}>
                <button className="vault-modal-close-red" onClick={onClose} aria-label="Close modal">
                    <FiX size={20} />
                </button>

                {!showRecover ? (
                    <>
                        <div className="modal-header-section">
                            <h3 className="vault-modal-title">🔒 Vault Locked</h3>
                            <p className="vault-modal-subtitle">Enter your vault PIN to continue</p>
                        </div>

                        <form onSubmit={handleUnlockSubmit} className="vault-form">
                            {pinType === "custom" ? (
                                <div className={`auth-field ${shake ? "shake-animate" : ""}`}>
                                    <div className="auth-input-wrap" style={{ position: 'relative' }}>
                                        <SmoothInput
                                            type="password"
                                            placeholder="Enter your vault password"
                                            value={enteredPin}
                                            onChange={e => setEnteredPin(e.target.value)}
                                            disabled={lockoutTime > 0}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className={`numeric-entry-container ${shake ? "shake-animate" : ""}`}>
                                    <div className="dot-indicators center">
                                        {Array.from({ length: limit }).map((_, i) => (
                                            <div key={i} className={`dot ${i < enteredPin.length ? "active" : ""}`} />
                                        ))}
                                    </div>
                                    <div className="vault-keypad">
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                                            <button key={num} type="button" className="keypad-btn" onClick={() => handleNumericKeyPress(num.toString())} disabled={lockoutTime > 0}>{num}</button>
                                        ))}
                                        <button type="button" className="keypad-btn danger-clear" onClick={() => setEnteredPin("")} disabled={lockoutTime > 0}>C</button>
                                        <button type="button" className="keypad-btn" onClick={() => handleNumericKeyPress("0")} disabled={lockoutTime > 0}>0</button>
                                        <button type="button" className="keypad-btn backspace" onClick={handleNumericBackspace} disabled={lockoutTime > 0}>⌫</button>
                                    </div>
                                </div>
                            )}

                            {errorMsg && (
                                <div className="vault-error-inline center">{errorMsg}</div>
                            )}
                            
                            {lockoutTime > 0 && (
                                <div className="cooldown-timer center">Cooldown: {lockoutTime}s remaining</div>
                            )}

                            <button type="button" className="forgot-pin-link" onClick={() => setShowRecover(true)}>
                                Forgot PIN?
                            </button>
                        </form>
                    </>
                ) : (
                    <>
                        <div className="modal-header-section">
                            <h3 className="vault-modal-title">Reset Vault PIN</h3>
                            <p className="vault-modal-subtitle">Enter your Nexus login password to reset vault PIN</p>
                        </div>

                        <form onSubmit={handleRecoverSubmit} className="vault-form">
                            <div className="auth-field">
                                <label>Nexus Password</label>
                                <div className="auth-input-wrap" style={{ position: 'relative' }}>
                                    <SmoothInput
                                        type="password"
                                        placeholder="Enter your login password"
                                        value={recoverPassword}
                                        onChange={e => setRecoverPassword(e.target.value)}
                                        disabled={verifying}
                                        required
                                    />
                                </div>
                            </div>

                            {recoverError && (
                                <div className="vault-error-inline">{recoverError}</div>
                            )}

                            <button type="submit" className="auth-btn vault-setup-btn" disabled={verifying || !recoverPassword}>
                                {verifying ? "Verifying..." : "Verify & Reset"}
                            </button>

                            <button type="button" className="forgot-pin-link" onClick={() => { setShowRecover(false); setRecoverError(""); }}>
                                Back to Unlock
                            </button>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}
