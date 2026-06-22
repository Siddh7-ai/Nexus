import React, { useState, useEffect } from "react";
import { FiX, FiCheckCircle } from "react-icons/fi";
import QRCode from "qrcode";
import { computeSafetyNumber } from "../utils/crypto/manager";
import "./VerifyModal.css";

function VerifyModal({ isOpen, onClose, myUsername, partnerUsername, myIdentityKey, partnerIdentityKey }) {
    const [tab, setTab] = useState("qr"); // "qr" or "number"
    const [safetyNumber, setSafetyNumber] = useState("");
    const [qrUrl, setQrUrl] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isOpen) return;

        async function generateVerificationData() {
            setLoading(true);
            try {
                // 1. Calculate safety number and hex hash
                const result = await computeSafetyNumber(myUsername, myIdentityKey, partnerUsername, partnerIdentityKey);
                setSafetyNumber(result.formattedDec);

                // 2. Generate QR code using the hex hash of concatenated public keys
                const qrCodeDataUrl = await QRCode.toDataURL(result.hexHash, {
                    color: {
                        dark: "#000000",
                        light: "#ffffff"
                    },
                    width: 200,
                    margin: 2
                });
                setQrUrl(qrCodeDataUrl);
            } catch (error) {
                console.error("Failed to generate verification safety number:", error);
            } finally {
                setLoading(false);
            }
        }

        generateVerificationData();
    }, [isOpen, myUsername, myIdentityKey, partnerUsername, partnerIdentityKey]);

    if (!isOpen) return null;

    return (
        <div className="verify-modal-overlay" onClick={onClose}>
            <div className="verify-modal-container" onClick={(e) => e.stopPropagation()}>
                <div className="verify-modal-header">
                    <h3>Verify Encryption</h3>
                    <button className="verify-modal-close" onClick={onClose} aria-label="Close modal">
                        <FiX size={20} />
                    </button>
                </div>

                <div className="verify-modal-body">
                    <p className="verify-modal-desc">
                        To verify that messages with <strong>@{partnerUsername}</strong> are end-to-end encrypted, scan the QR code or compare the 60-digit safety number.
                    </p>

                    <div className="verify-graphic-section">
                        <div className="two-phones-icon">
                            <span className="phone-screen left-phone">📱</span>
                            <span className="phone-screen right-phone">📱</span>
                        </div>
                        <div className="verified-badge">
                            <FiCheckCircle size={22} className="verified-check-icon" />
                            <span>Verified automatically</span>
                        </div>
                    </div>

                    {loading ? (
                        <div className="verify-loading">Calculating safety numbers...</div>
                    ) : (
                        <div className="verify-content-section">
                            <div className="verify-tabs">
                                <button 
                                    className={`verify-tab ${tab === "qr" ? "active" : ""}`} 
                                    onClick={() => setTab("qr")}
                                >
                                    Scan QR Code
                                </button>
                                <button 
                                    className={`verify-tab ${tab === "number" ? "active" : ""}`} 
                                    onClick={() => setTab("number")}
                                >
                                    Compare Number
                                </button>
                            </div>

                            <div className="verify-tab-content">
                                {tab === "qr" && (
                                    <div className="verify-qr-panel">
                                        {qrUrl ? (
                                            <div className="qr-wrapper">
                                                <img src={qrUrl} alt="E2EE Verification QR Code" className="qr-img" />
                                            </div>
                                        ) : (
                                            <div className="qr-error">Failed to load QR Code</div>
                                        )}
                                        <span className="qr-subtext">Scan this code on another device to verify identity</span>
                                    </div>
                                )}

                                {tab === "number" && (
                                    <div className="verify-number-panel">
                                        <div className="safety-number-grid">
                                            {safetyNumber.split(" ").map((group, idx) => (
                                                <span key={idx} className="safety-number-group">
                                                    {group}
                                                </span>
                                            ))}
                                        </div>
                                        <span className="number-subtext">Compare these 12 blocks with your contact's device</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default VerifyModal;
