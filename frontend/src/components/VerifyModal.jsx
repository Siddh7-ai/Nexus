import React, { useState, useEffect, useRef } from "react";
import { FiX, FiCheckCircle, FiCamera, FiAlertTriangle, FiUpload } from "react-icons/fi";
import QRCode from "qrcode";
import { Html5Qrcode } from "html5-qrcode";
import { computeSafetyNumber } from "../utils/crypto/manager";
import "./VerifyModal.css";

function VerifyModal({ isOpen, onClose, myUsername, partnerUsername, myIdentityKey, partnerIdentityKey }) {
    const [tab, setTab] = useState("qr"); // "qr" or "number"
    const [safetyNumber, setSafetyNumber] = useState("");
    const [expectedHash, setExpectedHash] = useState("");
    const [qrUrl, setQrUrl] = useState("");
    const [loading, setLoading] = useState(true);
    
    // Camera scanner state
    const [isScanning, setIsScanning] = useState(false);
    const [scanError, setScanError] = useState("");
    const [verificationStatus, setVerificationStatus] = useState(null); // null, "success", "error"

    const scannerRef = useRef(null);
    const fileInputRef = useRef(null);
    const fileScannerRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return;

        async function generateVerificationData() {
            setLoading(true);
            try {
                // 1. Calculate safety number and hex hash
                const result = await computeSafetyNumber(myUsername, myIdentityKey, partnerUsername, partnerIdentityKey);
                setSafetyNumber(result.formattedDec);
                setExpectedHash(result.hexHash);

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

    // Cleanup scanner on unmount
    useEffect(() => {
        return () => {
            if (scannerRef.current) {
                scannerRef.current.stop().catch(() => {});
            }
        };
    }, []);

    // Stop scanner if modal closes
    useEffect(() => {
        if (!isOpen) {
            if (scannerRef.current) {
                scannerRef.current.stop().catch(() => {});
                scannerRef.current = null;
            }
            setIsScanning(false);
            setVerificationStatus(null);
            setScanError("");
        }
    }, [isOpen]);

    const startScanner = async () => {
        setScanError("");
        setVerificationStatus(null);
        setIsScanning(true);

        if (scannerRef.current) {
            try {
                await scannerRef.current.stop();
            } catch (e) {}
            scannerRef.current = null;
        }

        setTimeout(() => {
            const scanner = new Html5Qrcode("qr-reader");
            scannerRef.current = scanner;

            scanner.start(
                { facingMode: "environment" }, // Rear camera
                {
                    fps: 10,
                    qrbox: (width, height) => {
                        const size = Math.min(width, height) * 0.7;
                        return { width: size, height: size };
                    }
                },
                async (decodedText) => {
                    // Success callback
                    try {
                        await scanner.stop();
                    } catch (e) {}
                    scannerRef.current = null;
                    setIsScanning(false);

                    if (decodedText.trim() === expectedHash.trim()) {
                        setVerificationStatus("success");
                    } else {
                        setVerificationStatus("error");
                    }
                },
                (errorMessage) => {
                    // Ignore scan loop errors
                }
            ).catch((err) => {
                console.error("Failed to start camera scan:", err);
                setScanError("Camera access denied or not found.");
                setIsScanning(false);
                scannerRef.current = null;
            });
        }, 100);
    };

    const stopScanner = async () => {
        if (scannerRef.current) {
            try {
                await scannerRef.current.stop();
            } catch (e) {}
            scannerRef.current = null;
        }
        setIsScanning(false);
    };

    const triggerFileSelect = () => {
        setScanError("");
        setVerificationStatus(null);
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setLoading(true);
        try {
            // Reuse or instantiate scanner on our hidden container
            let html5QrCode = fileScannerRef.current;
            if (!html5QrCode) {
                html5QrCode = new Html5Qrcode("qr-reader-temp");
                fileScannerRef.current = html5QrCode;
            }
            const decodedText = await html5QrCode.scanFile(file, false);
            
            console.log("File QR Code Decoded:", decodedText);
            
            if (decodedText.trim() === expectedHash.trim()) {
                setVerificationStatus("success");
            } else {
                setVerificationStatus("error");
            }
        } catch (err) {
            console.error("QR Code file scan error:", err);
            let errMsg = err?.message || String(err);
            if (errMsg.includes("No MultiFormat Readers")) {
                errMsg = "No QR code detected. Ensure the image is clear and the QR code is fully visible with all 4 corners.";
            }
            setScanError(`Scan failed: ${errMsg}`);
        } finally {
            setLoading(false);
            e.target.value = ""; // Reset file input
        }
    };

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
                        <div className="verify-loading">Processing...</div>
                    ) : (
                        <div className="verify-content-section">
                            <div className="verify-tabs">
                                <button 
                                    className={`verify-tab ${tab === "qr" ? "active" : ""}`} 
                                    onClick={() => {
                                        stopScanner();
                                        setVerificationStatus(null);
                                        setTab("qr");
                                    }}
                                >
                                    Scan QR Code
                                </button>
                                <button 
                                    className={`verify-tab ${tab === "number" ? "active" : ""}`} 
                                    onClick={() => {
                                        stopScanner();
                                        setVerificationStatus(null);
                                        setTab("number");
                                    }}
                                >
                                    Compare Number
                                </button>
                            </div>

                            <div className="verify-tab-content">
                                {tab === "qr" && (
                                    <div className="verify-qr-panel">
                                        {verificationStatus === "success" && (
                                            <div className="verification-feedback success">
                                                <FiCheckCircle size={48} className="feedback-icon" />
                                                <h4>Encryption Verified!</h4>
                                                <p>Your connection with @{partnerUsername} is secure and verified.</p>
                                                <button className="verify-btn-retry" onClick={() => setVerificationStatus(null)}>
                                                    Scan Again
                                                </button>
                                            </div>
                                        )}

                                        {verificationStatus === "error" && (
                                            <div className="verification-feedback error">
                                                <FiAlertTriangle size={48} className="feedback-icon" />
                                                <h4>Keys Mismatch!</h4>
                                                <p>Warning: The keys do not match. The communication might not be secure.</p>
                                                <button className="verify-btn-retry" onClick={() => setVerificationStatus(null)}>
                                                    Try Again
                                                </button>
                                            </div>
                                        )}

                                        {!verificationStatus && (
                                            <>
                                                {isScanning ? (
                                                    <div className="scanner-container">
                                                        <div id="qr-reader" className="qr-video-frame"></div>
                                                        <button className="verify-scan-btn stop" onClick={stopScanner}>
                                                            Stop Scanner
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        {qrUrl ? (
                                                            <div className="qr-wrapper">
                                                                <img src={qrUrl} alt="E2EE Verification QR Code" className="qr-img" />
                                                            </div>
                                                        ) : (
                                                            <div className="qr-error">Failed to load QR Code</div>
                                                        )}
                                                        
                                                        {scanError && <div className="scan-error-msg">{scanError}</div>}
                                                        
                                                        <div className="verify-actions-row">
                                                            <button className="verify-scan-btn start" onClick={startScanner}>
                                                                <FiCamera className="scan-btn-icon" />
                                                                Scan using Camera
                                                            </button>
                                                            <button className="verify-scan-btn upload" onClick={triggerFileSelect}>
                                                                <FiUpload className="scan-btn-icon" />
                                                                Upload QR Image
                                                            </button>
                                                        </div>
                                                        <span className="qr-subtext">Scan code or upload an image to verify identity</span>
                                                    </>
                                                )}
                                            </>
                                        )}
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
                {/* Hidden elements for file-based QR decoding (must be in layout tree for canvas to work) */}
                <div id="qr-reader-temp" style={{ position: "absolute", width: "1px", height: "1px", opacity: 0, overflow: "hidden" }}></div>
                <input 
                    type="file" 
                    ref={fileInputRef}
                    accept="image/*" 
                    style={{ display: "none" }}
                    onChange={handleFileSelect}
                    onClick={(e) => e.stopPropagation()}
                />
            </div>
        </div>
    );
}

export default VerifyModal;
