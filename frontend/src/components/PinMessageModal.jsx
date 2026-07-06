import React, { useState } from "react";
import { FiX } from "react-icons/fi";

export default function PinMessageModal({ msg, onClose, onPin }) {
    const [duration, setDuration] = useState("7d"); // "24h" | "7d" | "30d"

    const handleSubmit = (e) => {
        e.preventDefault();
        onPin(msg, duration);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content pin-message-modal" onClick={(e) => e.stopPropagation()}>
                <button className="vault-modal-close-red" onClick={onClose} aria-label="Close modal">
                    <FiX size={20} />
                </button>
                
                <h3 className="pin-modal-title">Choose how long your pin lasts</h3>
                <p className="pin-modal-subtitle">You can unpin at any time.</p>
                
                <form onSubmit={handleSubmit} className="pin-modal-form">
                    <div className="pin-options">
                        <label className="pin-option-label">
                            <input 
                                type="radio" 
                                name="pin-duration" 
                                value="24h" 
                                checked={duration === "24h"} 
                                onChange={() => setDuration("24h")}
                                className="pin-radio-input"
                            />
                            <span className="pin-radio-custom"></span>
                            <span className="pin-option-text">24 hours</span>
                        </label>
                        
                        <label className="pin-option-label">
                            <input 
                                type="radio" 
                                name="pin-duration" 
                                value="7d" 
                                checked={duration === "7d"} 
                                onChange={() => setDuration("7d")}
                                className="pin-radio-input"
                            />
                            <span className="pin-radio-custom"></span>
                            <span className="pin-option-text">7 days</span>
                        </label>
                        
                        <label className="pin-option-label">
                            <input 
                                type="radio" 
                                name="pin-duration" 
                                value="30d" 
                                checked={duration === "30d"} 
                                onChange={() => setDuration("30d")}
                                className="pin-radio-input"
                            />
                            <span className="pin-radio-custom"></span>
                            <span className="pin-option-text">30 days</span>
                        </label>
                    </div>
                    
                    <div className="pin-modal-actions">
                        <button type="button" className="pin-cancel-btn" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="pin-confirm-btn">
                            Pin
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
