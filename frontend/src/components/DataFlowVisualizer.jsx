import React, { useState, useEffect } from "react";
import { FiX, FiCheck, FiAlertTriangle } from "react-icons/fi";
import "./DataFlowVisualizer.css";

function DataFlowVisualizer({ isOpen, onClose, visualizerData }) {
    const [e2eeEnabled, setE2eeEnabled] = useState(true);
    const [currentStage, setCurrentStage] = useState(0); // 0: Idle, 1: Sender, 2: Transit, 3: Recipient
    const [senderText, setSenderText] = useState("");
    const [transitText, setTransitText] = useState("");
    const [recipientText, setRecipientText] = useState("");

    useEffect(() => {
        if (!isOpen || !visualizerData) {
            setCurrentStage(0);
            return;
        }

        const { plaintext, ciphertext, type } = visualizerData;
        const shortCiphertext = ciphertext ? (ciphertext.substring(0, 30) + "...") : "";

        // Determine who is sender and who is recipient
        const isSend = type === "send";

        // Reset text states
        setSenderText(plaintext);
        setTransitText("");
        setRecipientText("");
        setCurrentStage(1); // Start at Stage 1

        let t1, t2, t3, t4, t5;

        if (e2eeEnabled) {
            // Stage 1: Sender holds plaintext, then encrypts
            t1 = setTimeout(() => {
                setSenderText(shortCiphertext); // Fades into ciphertext
            }, 1000);

            // Stage 2: Move to Server / In-Transit (ciphertext only)
            t2 = setTimeout(() => {
                setCurrentStage(2);
                setSenderText(plaintext); // Restore sender box to plaintext
                setTransitText(shortCiphertext);
            }, 2500);

            // Stage 3: Move to Recipient (starts as ciphertext, then decrypts)
            t3 = setTimeout(() => {
                setCurrentStage(3);
                setRecipientText(shortCiphertext);
            }, 4000);

            t4 = setTimeout(() => {
                setRecipientText(plaintext); // Decrypts to plaintext
            }, 5000);
        } else {
            // E2EE OFF: Plaintext remains visible at all stages
            t1 = setTimeout(() => {
                // No encryption transition
            }, 1000);

            t2 = setTimeout(() => {
                setCurrentStage(2);
                setTransitText(plaintext); // Server sees raw plaintext!
            }, 2000);

            t3 = setTimeout(() => {
                setCurrentStage(3);
                setRecipientText(plaintext);
            }, 3500);
        }

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
            clearTimeout(t4);
            clearTimeout(t5);
        };
    }, [isOpen, visualizerData, e2eeEnabled]);

    if (!isOpen) return null;

    const messageNumber = visualizerData ? visualizerData.messageNumber : 0;
    const sessionId = visualizerData ? visualizerData.sessionId : "none";
    const displayType = visualizerData ? visualizerData.type : "send";

    return (
        <div className="visualizer-drawer">
            <div className="visualizer-header">
                <h3>Live Data-Flow</h3>
                <button className="visualizer-close" onClick={onClose} aria-label="Close visualizer">
                    <FiX size={20} />
                </button>
            </div>

            <div className="visualizer-body">
                {/* Simulation Control Toggle */}
                <div className="visualizer-toggle-row">
                    <span className="toggle-label">Encryption Simulation Mode:</span>
                    <div className="simulation-toggle">
                        <button 
                            className={`toggle-btn secure ${e2eeEnabled ? "active" : ""}`}
                            onClick={() => setE2eeEnabled(true)}
                        >
                            E2EE ON
                        </button>
                        <button 
                            className={`toggle-btn unsecure ${!e2eeEnabled ? "active" : ""}`}
                            onClick={() => setE2eeEnabled(false)}
                        >
                            E2EE OFF
                        </button>
                    </div>
                </div>

                <div className="visualizer-flow-container">
                    {/* Stage 1: Sender */}
                    <div className={`flow-stage ${currentStage === 1 ? "active" : ""} ${currentStage > 1 ? "completed" : ""}`}>
                        <div className="stage-header">
                            <span className="stage-num">1</span>
                            <span className="stage-name">{displayType === "send" ? "Sender (You)" : `Sender (@${visualizerData?.username})`}</span>
                        </div>
                        <div className="stage-box">
                            <div className="stage-box-label">Plaintext Message</div>
                            <div className="stage-text-display">
                                {currentStage >= 1 ? senderText || "[No Data]" : ""}
                            </div>
                            {currentStage === 1 && e2eeEnabled && (
                                <div className="action-badge encrypting">Encrypting...</div>
                            )}
                        </div>
                    </div>

                    {/* Arrow / Line 1 */}
                    <div className={`flow-line ${currentStage >= 2 ? "active" : ""} ${!e2eeEnabled && currentStage >= 2 ? "danger" : ""}`}>
                        <div className="flow-dot" />
                    </div>

                    {/* Stage 2: Server */}
                    <div className={`flow-stage ${currentStage === 2 ? "active" : ""} ${currentStage > 2 ? "completed" : ""}`}>
                        <div className="stage-header">
                            <span className="stage-num">2</span>
                            <span className="stage-name">Server / Transit Relay</span>
                        </div>
                        <div className={`stage-box server-stage-box ${!e2eeEnabled ? "unencrypted-alert" : ""}`}>
                            <div className="stage-box-label">Stored in MongoDB / Sent via WebSocket</div>
                            <div className="stage-text-display server-data">
                                {currentStage >= 2 ? transitText || "[No Data]" : ""}
                            </div>
                            
                            {e2eeEnabled ? (
                                <div className="security-status-badge secure">
                                    <FiCheck size={12} />
                                    Server is Blind (Ciphertext only)
                                </div>
                            ) : (
                                <div className="security-status-badge insecure">
                                    <FiAlertTriangle size={12} />
                                    UNENCRYPTED — Server sees plaintext!
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Arrow / Line 2 */}
                    <div className={`flow-line ${currentStage >= 3 ? "active" : ""} ${!e2eeEnabled && currentStage >= 3 ? "danger" : ""}`}>
                        <div className="flow-dot" />
                    </div>

                    {/* Stage 3: Recipient */}
                    <div className={`flow-stage ${currentStage === 3 ? "active" : ""} ${currentStage > 3 || currentStage === 0 ? "completed" : ""}`}>
                        <div className="stage-header">
                            <span className="stage-num">3</span>
                            <span className="stage-name">{displayType === "send" ? `Recipient (@${visualizerData?.username})` : "Recipient (You)"}</span>
                        </div>
                        <div className="stage-box">
                            <div className="stage-box-label">Decrypted Message</div>
                            <div className="stage-text-display">
                                {currentStage >= 3 ? recipientText || "[No Data]" : ""}
                            </div>
                            {currentStage === 3 && e2eeEnabled && (
                                <div className="action-badge decrypting">Decrypting...</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Metadata Panel */}
            <div className="visualizer-metadata-footer">
                <div className="meta-grid">
                    <div className="meta-item">
                        <span className="meta-label">Double Ratchet Session</span>
                        <span className="meta-value font-mono">{sessionId}</span>
                    </div>
                    <div className="meta-item">
                        <span className="meta-label">Message Number</span>
                        <span className="meta-value font-mono">#{messageNumber}</span>
                    </div>
                    <div className="meta-item">
                        <span className="meta-label">Ratchet Key Advanced</span>
                        <span className={`meta-value font-mono ${e2eeEnabled ? "accent-text" : "danger-text"}`}>
                            {e2eeEnabled ? "YES" : "NO (Simulation Off)"}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default DataFlowVisualizer;
