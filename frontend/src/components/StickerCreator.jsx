import React, { useState, useRef, useEffect } from "react";
import { Upload, X, Type, Check, RefreshCw } from "lucide-react";
import { getBackendUrl } from "../utils/config";

// Lazy import to handle potential loading issues or speed limits
let removeBackgroundFn = null;

function StickerCreator({ onSendSticker, onSaveSticker, onClose }) {
    const [step, setStep] = useState(1); // 1: Upload, 2: Processing, 3: Edit
    const [imageSrc, setImageSrc] = useState(null); // original image URL
    const [originalImage, setOriginalImage] = useState(null); // original file

    // Canvas adjustment states
    const [scale, setScale] = useState(1);
    const [panX, setPanX] = useState(0);
    const [panY, setPanY] = useState(0);
    const [text, setText] = useState("");
    const [isBold, setIsBold] = useState(true);
    const [textColor, setTextColor] = useState("#ffffff");

    // Text position states
    const [textX, setTextX] = useState(200);
    const [textY, setTextY] = useState(350);

    // Dragging state
    const [draggingType, setDraggingType] = useState(null); // null | "text" | "image"
    const dragStart = useRef({ x: 0, y: 0 });
    const canvasRef = useRef(null);
    const imageRef = useRef(null);

    // Redraw canvas whenever parameters change
    useEffect(() => {
        if (step !== 3 || !imageSrc) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");

        // Load image if not already cached
        let img = imageRef.current;
        if (!img) {
            img = new Image();
            img.onload = () => {
                imageRef.current = img;
                drawCanvas(canvas, ctx, img);
            };
            img.src = imageSrc;
        } else {
            drawCanvas(canvas, ctx, img);
        }
    }, [step, imageSrc, scale, panX, panY, text, isBold, textColor, textX, textY]);

    const drawCanvas = (canvas, ctx, img) => {
        // Clear canvas with transparent background
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw checkerboard background for editor visual feedback
        const checkerSize = 10;
        for (let y = 0; y < canvas.height; y += checkerSize) {
            for (let x = 0; x < canvas.width; x += checkerSize) {
                ctx.fillStyle = ((x / checkerSize + y / checkerSize) % 2 === 0) ? "#334155" : "#1e293b";
                ctx.fillRect(x, y, checkerSize, checkerSize);
            }
        }

        ctx.save();
        // Move to center of canvas
        ctx.translate(canvas.width / 2 + panX, canvas.height / 2 + panY);
        ctx.scale(scale, scale);

        // Draw image centered at 0, 0
        const w = img.width;
        const h = img.height;
        const maxDim = Math.max(w, h);
        const fitScale = 380 / maxDim; // Fit inside 380px area
        const drawW = w * fitScale;
        const drawH = h * fitScale;

        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();

        // Draw Text Overlay
        if (text.trim()) {
            ctx.save();
            ctx.font = `${isBold ? "bold" : "normal"} 36px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            // Draw outline for legibility
            ctx.strokeStyle = "#000000";
            ctx.lineWidth = 6;
            ctx.lineJoin = "round";
            ctx.strokeText(text, textX, textY);

            // Draw fill
            ctx.fillStyle = textColor;
            ctx.fillText(text, textX, textY);
            ctx.restore();
        }
    };

    // Upload & background removal handler (Bypassed background removal completely!)
    const handleFileSelect = async (file) => {
        if (!file) return;
        setOriginalImage(file);
        
        // Go straight to edit step (Step 3) using original image
        const reader = new FileReader();
        reader.onload = (e) => {
            setImageSrc(e.target.result);
            setStep(3);
        };
        reader.readAsDataURL(file);
    };

    // Drag / Pan mouse handlers for Text & Image
    const handlePointerDown = (e) => {
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const rect = canvas.getBoundingClientRect();
        const localX = ((clientX - rect.left) / rect.width) * canvas.width;
        const localY = ((clientY - rect.top) / rect.height) * canvas.height;
        
        let clickedText = false;
        if (text.trim()) {
            const ctx = canvas.getContext("2d");
            ctx.save();
            ctx.font = `${isBold ? "bold" : "normal"} 36px sans-serif`;
            const textWidth = ctx.measureText(text).width;
            ctx.restore();
            
            const textHeight = 36;
            if (
                localX >= textX - textWidth / 2 - 20 &&
                localX <= textX + textWidth / 2 + 20 &&
                localY >= textY - textHeight / 2 - 20 &&
                localY <= textY + textHeight / 2 + 20
            ) {
                clickedText = true;
            }
        }
        
        if (clickedText) {
            setDraggingType("text");
            dragStart.current = { x: localX - textX, y: localY - textY };
        } else {
            setDraggingType("image");
            dragStart.current = { x: clientX - panX, y: clientY - panY };
        }
    };

    const handlePointerMove = (e) => {
        if (!draggingType) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        if (draggingType === "text") {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const localX = ((clientX - rect.left) / rect.width) * canvas.width;
            const localY = ((clientY - rect.top) / rect.height) * canvas.height;
            setTextX(localX - dragStart.current.x);
            setTextY(localY - dragStart.current.y);
        } else if (draggingType === "image") {
            setPanX(clientX - dragStart.current.x);
            setPanY(clientY - dragStart.current.y);
        }
    };

    const handlePointerUp = () => {
        setDraggingType(null);
    };

    const generateStickerBlob = () => {
        return new Promise((resolve) => {
            const finalCanvas = document.createElement("canvas");
            finalCanvas.width = 512;
            finalCanvas.height = 512;
            const ctx = finalCanvas.getContext("2d");

            // Transparent background
            ctx.clearRect(0, 0, finalCanvas.width, finalCanvas.height);

            const img = imageRef.current;
            if (img) {
                ctx.save();
                ctx.translate(finalCanvas.width / 2 + panX, finalCanvas.height / 2 + panY);
                ctx.scale(scale, scale);

                const w = img.width;
                const h = img.height;
                const maxDim = Math.max(w, h);
                const fitScale = 380 / maxDim;
                const drawW = w * fitScale;
                const drawH = h * fitScale;

                ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
                ctx.restore();
            }

            // Draw Text
            if (text.trim()) {
                ctx.save();
                ctx.font = `${isBold ? "bold" : "normal"} 36px sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";

                const finalScale = 512 / 400;
                const drawTextX = textX * finalScale;
                const drawTextY = textY * finalScale;

                ctx.strokeStyle = "#000000";
                ctx.lineWidth = 6;
                ctx.lineJoin = "round";
                ctx.strokeText(text, drawTextX, drawTextY);

                ctx.fillStyle = textColor;
                ctx.fillText(text, drawTextX, drawTextY);
                ctx.restore();
            }

            finalCanvas.toBlob((blob) => {
                resolve(blob);
            }, "image/webp", 0.9);
        });
    };

    const handleSendNow = async () => {
        const blob = await generateStickerBlob();
        onSendSticker(blob);
    };

    const handleSaveToPack = async () => {
        const blob = await generateStickerBlob();
        onSaveSticker(blob);
    };

    return (
        <div className="sticker-creator-overlay">
            <div className="sticker-creator-content">
                <div className="creator-header">
                    <h2>Create Sticker</h2>
                    <button type="button" className="close-btn" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                {step === 1 && (
                    <div
                        className="upload-step-container"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                            e.preventDefault();
                            if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
                        }}
                    >
                        <Upload size={48} className="upload-icon" />
                        <p>Drag & drop a photo, or click to upload</p>
                        <span className="formats-label">Supports: JPG, PNG, WEBP, HEIC</span>
                        <input
                            type="file"
                            accept="image/*"
                            id="sticker-file-input"
                            style={{ display: "none" }}
                            onChange={(e) => {
                                if (e.target.files[0]) handleFileSelect(e.target.files[0]);
                            }}
                        />
                        <label htmlFor="sticker-file-input" className="select-btn">
                            Choose Photo
                        </label>
                    </div>
                )}



                {step === 3 && (
                    <div className="edit-step-container">
                        <div className="editor-layout">
                            {/* Left: Canvas Area */}
                            <div className="canvas-viewport">
                                <canvas
                                    ref={canvasRef}
                                    width={400}
                                    height={400}
                                    onMouseDown={handlePointerDown}
                                    onMouseMove={handlePointerMove}
                                    onMouseUp={handlePointerUp}
                                    onMouseLeave={handlePointerUp}
                                    onTouchStart={handlePointerDown}
                                    onTouchMove={handlePointerMove}
                                    onTouchEnd={handlePointerUp}
                                />
                            </div>

                            {/* Right: Controls Area */}
                            <div className="editor-controls">
                                {/* Zoom Scale slider */}
                                <div className="control-group">
                                    <label>Zoom</label>
                                    <input
                                        type="range"
                                        min="0.5"
                                        max="2.5"
                                        step="0.05"
                                        value={scale}
                                        onChange={(e) => setScale(parseFloat(e.target.value))}
                                    />
                                </div>

                                {/* Text Overlay input */}
                                <div className="control-group">
                                    <label>Add Text</label>
                                    <div className="text-input-wrapper">
                                        <Type size={16} className="text-icon" />
                                        <input
                                            type="text"
                                            placeholder="Enter text..."
                                            value={text}
                                            onChange={(e) => setText(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* Text Options */}
                                <div className="text-styling-options">
                                    <button
                                        type="button"
                                        className={`font-btn ${isBold ? "active" : ""}`}
                                        onClick={() => setIsBold(!isBold)}
                                    >
                                        Bold
                                    </button>
                                    <div className="color-palette">
                                        {["#ffffff", "#000000", "#ef4444", "#eab308", "#3b82f6", "#22c55e"].map((c) => (
                                            <button
                                                key={c}
                                                type="button"
                                                className={`color-btn ${textColor === c ? "selected" : ""}`}
                                                style={{ backgroundColor: c }}
                                                onClick={() => setTextColor(c)}
                                            >
                                                {textColor === c && <Check size={12} color={c === "#ffffff" ? "#000000" : "#ffffff"} />}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Save/Send buttons */}
                                <div className="action-buttons-group">
                                    <button type="button" className="btn secondary" onClick={handleSaveToPack}>
                                        Save to My Stickers
                                    </button>
                                    <button type="button" className="btn primary" onClick={handleSendNow}>
                                        Send Now
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default StickerCreator;
