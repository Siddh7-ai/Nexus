import { useState, useEffect } from "react";
import { FiX } from "react-icons/fi";
import { SmoothInput } from "./SmoothInput";

export default function VaultPinSetupModal({ onClose, onSave }) {
    const [pinType, setPinType] = useState("4digit"); // "4digit" | "6digit" | "custom"
    const [pin, setPin] = useState("");
    const [confirmPin, setConfirmPin] = useState("");

    const limit = pinType === "4digit" ? 4 : 6;

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

    // Keyboard support for numeric entry (typing enter and confirm keys sequentially)
    useEffect(() => {
        if (pinType === "custom") return;

        const handleKeyDown = (e) => {
            if (/^[0-9]$/.test(e.key)) {
                e.preventDefault();
                setPin(prevPin => {
                    if (prevPin.length < limit) {
                        return prevPin + e.key;
                    } else {
                        setConfirmPin(prevConfirm => {
                            if (prevConfirm.length < limit) {
                                return prevConfirm + e.key;
                            }
                            return prevConfirm;
                        });
                        return prevPin;
                    }
                });
            } else if (e.key === "Backspace") {
                e.preventDefault();
                setConfirmPin(prevConfirm => {
                    if (prevConfirm.length > 0) {
                        return prevConfirm.slice(0, -1);
                    } else {
                        setPin(prevPin => prevPin.slice(0, -1));
                        return prevConfirm;
                    }
                });
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [pinType, limit]);

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

    const handleSubmit = (e) => {
        if (e) e.preventDefault();
        if (!canSubmit) return;
        onSave(pin, pinType);
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
                                            <button key={num} type="button" className="keypad-btn" onClick={() => handleNumericKeyPress(num.toString())}>{num}</button>
                                        ))}
                                        <button type="button" className="keypad-btn danger-clear" onClick={() => setPin("")}>C</button>
                                        <button type="button" className="keypad-btn" onClick={() => handleNumericKeyPress("0")}>0</button>
                                        <button type="button" className="keypad-btn backspace" onClick={handleNumericBackspace}>⌫</button>
                                    </div>
                                </div>

                                <div className="setup-keypad-panel">
                                    <span className="keypad-panel-label">Confirm PIN Keypad</span>
                                    <div className="vault-keypad">
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                                            <button key={num} type="button" className="keypad-btn" onClick={() => handleConfirmNumericKeyPress(num.toString())}>{num}</button>
                                        ))}
                                        <button type="button" className="keypad-btn danger-clear" onClick={() => setConfirmPin("")}>C</button>
                                        <button type="button" className="keypad-btn" onClick={() => handleConfirmNumericKeyPress("0")}>{0}</button>
                                        <button type="button" className="keypad-btn backspace" onClick={handleConfirmNumericBackspace}>⌫</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {confirmPin.length > 0 && pin !== confirmPin && (
                        <div className="vault-error-inline">❌ PINs do not match</div>
                    )}

                    <button type="submit" className="auth-btn vault-setup-btn" disabled={!canSubmit}>
                        Set PIN
                    </button>
                </form>
            </div>
        </div>
    );
}
