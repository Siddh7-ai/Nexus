import { useState, useEffect, useRef } from "react";
import { FiX } from "react-icons/fi";
import { SmoothInput } from "./SmoothInput";

export default function VaultPinSetupModal({ onClose, onSave }) {
    const [pinType, setPinType] = useState("4digit"); // "4digit" | "6digit" | "custom"
    const [pin, setPin] = useState("");
    const [confirmPin, setConfirmPin] = useState("");
    const [statusMsg, setStatusMsg] = useState(null); // { type: 'success' | 'error', text: '...' }

    const limit = pinType === "4digit" ? 4 : 6;

    // Refs to hold current lengths — lets the keydown handler read the
    // latest values synchronously without capturing stale closure values.
    const pinRef = useRef(pin);
    const confirmPinRef = useRef(confirmPin);
    const limitRef = useRef(limit);
    const submitRef = useRef(null);

    useEffect(() => { pinRef.current = pin; }, [pin]);
    useEffect(() => { confirmPinRef.current = confirmPin; }, [confirmPin]);
    useEffect(() => { limitRef.current = limit; }, [limit]);

    const handleNumericKeyPress = (val) => {
        if (pin.length < limit) {
            setPin(prev => prev + val);
        }
    };

    const handleConfirmNumericKeyPress = (val) => {
        if (confirmPin.length < limit) {
            setConfirmPin(prev => prev + val);
        }
    };

    const handleNumericBackspace = () => {
        setPin(prev => prev.slice(0, -1));
    };

    const handleConfirmNumericBackspace = () => {
        setConfirmPin(prev => prev.slice(0, -1));
    };

    // Keyboard support — uses refs so we never nest one setState inside another.
    // Nesting setState updaters causes React Strict Mode to double-invoke them,
    // which was the root cause of the double-digit bug on Confirm PIN.
    useEffect(() => {
        if (pinType === "custom") return;

        const handleKeyDown = (e) => {
            if (/^[0-9]$/.test(e.key)) {
                e.preventDefault();
                const curPin = pinRef.current;
                const curConfirm = confirmPinRef.current;
                const lim = limitRef.current;

                if (curPin.length < lim) {
                    // Still filling Enter PIN
                    setPin(prev => prev.length < lim ? prev + e.key : prev);
                } else if (curConfirm.length < lim) {
                    // Enter PIN is full — fill Confirm PIN
                    setConfirmPin(prev => prev.length < lim ? prev + e.key : prev);
                }
                // Both full — ignore
            } else if (e.key === "Backspace") {
                e.preventDefault();
                const curConfirm = confirmPinRef.current;
                if (curConfirm.length > 0) {
                    setConfirmPin(prev => prev.slice(0, -1));
                } else {
                    setPin(prev => prev.slice(0, -1));
                }
            } else if (e.key === "Enter") {
                e.preventDefault();
                // Trigger the submit button click programmatically
                if (submitRef.current) {
                    submitRef.current.click();
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [pinType]);

    const getPinStrength = (val) => {
        if (!val) return "";
        if (val.length < 6 || /^\d+$/.test(val)) return "Weak";
        
        const hasSymbols = /[^a-zA-Z0-9]/.test(val);
        const hasEmoji = /\p{Emoji}/u.test(val);
        
        if (val.length >= 8 && (hasSymbols || hasEmoji)) return "Strong";
        return "Medium";
    };

    const handleTypeChange = (type) => {
        setPinType(type);
        setPin("");
        setConfirmPin("");
    };

    const strength = getPinStrength(pin);
    const isMatching = pin === confirmPin && pin.length > 0;
    const isLengthValid = pinType === "4digit" ? pin.length === 4 : (pinType === "6digit" ? pin.length === 6 : pin.length >= 4);
    const canSubmit = isMatching && isLengthValid;

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        if (!canSubmit) return;
        try {
            await onSave(pin, pinType);
            setStatusMsg({ type: 'success', text: '✅ Vault PIN saved successfully!' });
            setTimeout(() => setStatusMsg(null), 3000);
        } catch (err) {
            setStatusMsg({ type: 'error', text: '❌ Failed to save Vault PIN. Please try again.' });
            setTimeout(() => setStatusMsg(null), 4000);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content vault-pin-modal" onClick={e => e.stopPropagation()}>
                <button className="vault-modal-close-red" onClick={onClose} aria-label="Close modal">
                    <FiX size={20} />
                </button>
                <div className="modal-header-section">
                    <h3 className="vault-modal-title">🔑 Set Up Vault PIN</h3>
                    <p className="vault-modal-subtitle">This PIN protects your shared vault. Choose something memorable.</p>
                </div>

                <div className="vault-type-selectors">
                    <button className={`vault-type-btn ${pinType === "4digit" ? "active" : ""}`} onClick={() => handleTypeChange("4digit")}>4 Digits</button>
                    <button className={`vault-type-btn ${pinType === "6digit" ? "active" : ""}`} onClick={() => handleTypeChange("6digit")}>6 Digits</button>
                    <button className={`vault-type-btn ${pinType === "custom" ? "active" : ""}`} onClick={() => handleTypeChange("custom")}>Custom Password</button>
                </div>

                <form onSubmit={handleSubmit} className="vault-form">
                    {pinType === "custom" ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div className="auth-field">
                                <label>Enter PIN/Password</label>
                                <div className="auth-input-wrap" style={{ position: 'relative' }}>
                                    <SmoothInput
                                        type="password"
                                        placeholder="Letters, numbers, emoji — anything"
                                        value={pin}
                                        onChange={e => setPin(e.target.value)}
                                        maxLength={100}
                                        allowEmoji={true}
                                    />
                                </div>
                                <span className="vault-char-count">{pin.length} characters</span>
                                {pin.length > 0 && (
                                    <div className={`strength-indicator ${strength.toLowerCase()}`}>
                                        Strength: <strong>{strength}</strong>
                                    </div>
                                )}
                            </div>

                            <div className="auth-field">
                                <label>Confirm PIN/Password</label>
                                <div className="auth-input-wrap" style={{ position: 'relative' }}>
                                    <SmoothInput
                                        type="password"
                                        placeholder="Repeat your password"
                                        value={confirmPin}
                                        onChange={e => setConfirmPin(e.target.value)}
                                        maxLength={100}
                                        allowEmoji={true}
                                    />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="numeric-setup-container">
                            <div className="numeric-displays-row">
                                <div className="numeric-field-col">
                                    <span className="num-label">Enter PIN ({pin.length}/{limit})</span>
                                    <div className="dot-indicators">
                                        {Array.from({ length: limit }).map((_, i) => (
                                            <div key={i} className={`dot ${i < pin.length ? "active" : ""}`} />
                                        ))}
                                    </div>
                                </div>
                                <div className="numeric-field-col">
                                    <span className="num-label">Confirm PIN ({confirmPin.length}/{limit})</span>
                                    <div className="dot-indicators">
                                        {Array.from({ length: limit }).map((_, i) => (
                                            <div key={i} className={`dot ${i < confirmPin.length ? "active" : ""}`} />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="keypad-selection-tabs">
                                <span className="keypad-instruction">Tap keys to enter & confirm:</span>
                            </div>

                            <div className="numeric-setup-keypads">
                                <div className="setup-keypad-panel">
                                    <span className="keypad-panel-label">Enter PIN Keypad</span>
                                    <div className="vault-keypad">
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                                            <button key={num} type="button" className="keypad-btn" onKeyDown={(e) => e.preventDefault()} onClick={() => handleNumericKeyPress(num.toString())}>{num}</button>
                                        ))}
                                        <button type="button" className="keypad-btn danger-clear" onKeyDown={(e) => e.preventDefault()} onClick={() => setPin("")}>C</button>
                                        <button type="button" className="keypad-btn" onKeyDown={(e) => e.preventDefault()} onClick={() => handleNumericKeyPress("0")}>0</button>
                                        <button type="button" className="keypad-btn backspace" onKeyDown={(e) => e.preventDefault()} onClick={handleNumericBackspace}>⌫</button>
                                    </div>
                                </div>

                                <div className="setup-keypad-panel">
                                    <span className="keypad-panel-label">Confirm PIN Keypad</span>
                                    <div className="vault-keypad">
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                                            <button key={num} type="button" className="keypad-btn" onKeyDown={(e) => e.preventDefault()} onClick={() => handleConfirmNumericKeyPress(num.toString())}>{num}</button>
                                        ))}
                                        <button type="button" className="keypad-btn danger-clear" onKeyDown={(e) => e.preventDefault()} onClick={() => setConfirmPin("")}>C</button>
                                        <button type="button" className="keypad-btn" onKeyDown={(e) => e.preventDefault()} onClick={() => handleConfirmNumericKeyPress("0")}>0</button>
                                        <button type="button" className="keypad-btn backspace" onKeyDown={(e) => e.preventDefault()} onClick={handleConfirmNumericBackspace}>⌫</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {confirmPin.length > 0 && pin !== confirmPin && (
                        <div className="vault-error-inline">❌ PINs do not match</div>
                    )}

                    {statusMsg && (
                        <div style={{
                            padding: '10px 16px',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: 600,
                            textAlign: 'center',
                            fontFamily: 'Inter, system-ui, sans-serif',
                            background: statusMsg.type === 'success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            color: statusMsg.type === 'success' ? '#10b981' : '#ef4444',
                            border: `1px solid ${statusMsg.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                            animation: 'fadeIn 0.3s ease'
                        }}>
                            {statusMsg.text}
                        </div>
                    )}

                    <button ref={submitRef} type="submit" className="auth-btn vault-setup-btn" disabled={!canSubmit}>
                        Set PIN
                    </button>
                </form>
            </div>
        </div>
    );
}
