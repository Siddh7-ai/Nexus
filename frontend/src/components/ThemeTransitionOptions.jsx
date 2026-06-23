import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GripHorizontal } from "lucide-react";
import { FiSettings, FiX } from "react-icons/fi";

export default function ThemeTransitionOptions({ isOpen, setIsOpen }) {
  const [variant, setVariant] = useState(() => localStorage.getItem("theme-transition-variant") || "circle");
  const [start, setStart] = useState(() => localStorage.getItem("theme-transition-start") || "center");
  const [blur, setBlur] = useState(() => localStorage.getItem("theme-transition-blur") === "true");
  const [gifType, setGifType] = useState(() => localStorage.getItem("theme-transition-gifType") || "1");
  const [gifUrl, setGifUrl] = useState(() => localStorage.getItem("theme-transition-gifUrl") || "https://media.giphy.com/media/KBbr4hHl9DSahKvInO/giphy.gif?cid=790b76112m5eeeydoe7et0cr3j3ekb1erunxozyshuhxx2vl&ep=v1_stickers_search&rid=giphy.gif&ct=s");

  useEffect(() => {
    localStorage.setItem("theme-transition-variant", variant);
  }, [variant]);

  useEffect(() => {
    localStorage.setItem("theme-transition-start", start);
  }, [start]);

  useEffect(() => {
    localStorage.setItem("theme-transition-blur", String(blur));
  }, [blur]);

  useEffect(() => {
    localStorage.setItem("theme-transition-gifType", gifType);
  }, [gifType]);

  useEffect(() => {
    localStorage.setItem("theme-transition-gifUrl", gifUrl);
  }, [gifUrl]);

  // Adjust default start parameter based on the selected variant if the current start is invalid for it
  useEffect(() => {
    if (variant === "rectangle") {
      if (!["bottom-up", "top-down", "left-right", "right-left"].includes(start)) {
        setStart("bottom-up");
      }
    } else if (variant === "polygon") {
      if (!["top-left", "top-right"].includes(start)) {
        setStart("top-left");
      }
    } else if (variant === "circle" || variant === "circle-blur") {
      if (!["center", "top-left", "top-right", "bottom-left", "bottom-right", "top-center", "bottom-center"].includes(start)) {
        setStart("center");
      }
    }
  }, [variant, start]);

  return (
    <>

      {/* Styled options stylesheet */}
      <style>{`
        .rotate-settings-icon {
          transform: rotate(45deg);
          transition: transform 0.3s ease;
        }
        .transition-settings-btn:hover {
          transform: scale(1.08);
          background: var(--accent-deep, #0f9f98) !important;
        }
        .transition-settings-btn:active {
          transform: scale(0.95);
        }
        .transition-options-panel {
          font-family: Inter, system-ui, sans-serif;
          box-sizing: border-box;
          color: var(--text, #16171b);
          z-index: 9998;
          display: flex;
          width: 260px;
          flex-direction: column;
          gap: 12px;
          border-radius: 20px;
          border: 1px solid var(--border, rgba(0, 0, 0, 0.08));
          padding: 14px;
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.16);
          user-select: none;
        }
        /* Color themes for the panel based on body.dark-theme class */
        body.dark-theme .transition-options-panel {
          background: rgba(21, 23, 28, 0.85);
          backdrop-filter: blur(16px);
          border-color: rgba(255, 255, 255, 0.08);
          color: #f3f4f6;
        }
        body:not(.dark-theme) .transition-options-panel {
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(16px);
          border-color: rgba(0, 0, 0, 0.08);
          color: #1f2937;
        }
        .panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(128, 128, 128, 0.15);
          padding-bottom: 8px;
          margin-bottom: 4px;
        }
        .panel-title {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          opacity: 0.8;
          margin: 0;
        }
        .drag-handle {
          display: flex;
          align-items: center;
          cursor: grab;
          opacity: 0.5;
        }
        .drag-handle:active {
          cursor: grabbing;
        }
        .close-panel-btn {
          background: none;
          border: none;
          color: inherit;
          cursor: pointer;
          opacity: 0.5;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2px;
        }
        .close-panel-btn:hover {
          opacity: 1;
        }
        .option-row {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 4px 0;
        }
        .option-label {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          opacity: 0.6;
        }
        .option-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .option-btn {
          background: rgba(128, 128, 128, 0.08);
          border: 1px solid transparent;
          border-radius: 6px;
          padding: 4px 8px;
          font-size: 11px;
          cursor: pointer;
          color: inherit;
          transition: all 0.15s ease;
        }
        body.dark-theme .option-btn:hover {
          background: rgba(255, 255, 255, 0.12);
        }
        body:not(.dark-theme) .option-btn:hover {
          background: rgba(0, 0, 0, 0.05);
        }
        .option-btn.active {
          background: var(--accent, #12c7bd) !important;
          color: #031716 !important;
          font-weight: 600;
        }
        .gif-url-input {
          width: 100%;
          border: 1px solid rgba(128, 128, 128, 0.25);
          background: rgba(128, 128, 128, 0.05);
          border-radius: 6px;
          padding: 6px 8px;
          font-size: 11px;
          color: inherit;
          outline: none;
        }
        .gif-url-input:focus {
          border-color: var(--accent, #12c7bd);
        }
      `}</style>

      {/* Options panel with AnimatePresence */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            drag
            dragMomentum={false}
            style={{
              position: "fixed",
              bottom: "76px",
              right: "20px",
            }}
            className="transition-options-panel"
          >
            <div className="panel-header">
              <span className="drag-handle" title="Drag to re-position">
                <GripHorizontal size={16} />
              </span>
              <h4 className="panel-title">Transitions</h4>
              <button onClick={() => setIsOpen(false)} className="close-panel-btn" title="Close Panel">
                <FiX size={14} />
              </button>
            </div>

            <div className="option-row">
              <span className="option-label">Variant</span>
              <div className="option-buttons">
                {["circle", "rectangle", "polygon", "circle-blur", "gif"].map(v => (
                  <button
                    key={v}
                    onClick={() => setVariant(v)}
                    className={`option-btn ${variant === v ? "active" : ""}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="option-row">
              <span className="option-label">Blur</span>
              <div className="option-buttons">
                <button
                  onClick={() => setBlur(false)}
                  className={`option-btn ${!blur ? "active" : ""}`}
                >
                  Off
                </button>
                <button
                  onClick={() => setBlur(true)}
                  className={`option-btn ${blur ? "active" : ""}`}
                >
                  On
                </button>
              </div>
            </div>

            {/* Start Directions based on Variant */}
            {variant !== "gif" && (
              <div className="option-row">
                <span className="option-label">Start Position</span>
                <div className="option-buttons">
                  {/* circle & circle-blur have center + positions */}
                  {(variant === "circle" || variant === "circle-blur") && (
                    <>
                      {["center", "top-left", "top-right", "bottom-left", "bottom-right", "top-center", "bottom-center"].map(s => (
                        <button
                          key={s}
                          onClick={() => setStart(s)}
                          className={`option-btn ${start === s ? "active" : ""}`}
                        >
                          {s}
                        </button>
                      ))}
                    </>
                  )}

                  {/* rectangle directions */}
                  {variant === "rectangle" && (
                    <>
                      {["bottom-up", "top-down", "left-right", "right-left"].map(s => (
                        <button
                          key={s}
                          onClick={() => setStart(s)}
                          className={`option-btn ${start === s ? "active" : ""}`}
                        >
                          {s}
                        </button>
                      ))}
                    </>
                  )}

                  {/* polygon positions */}
                  {variant === "polygon" && (
                    <>
                      {["top-left", "top-right"].map(s => (
                        <button
                          key={s}
                          onClick={() => setStart(s)}
                          className={`option-btn ${start === s ? "active" : ""}`}
                        >
                          {s}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Gif specific options */}
            {variant === "gif" && (
              <>
                <div className="option-row">
                  <span className="option-label">GIF Type</span>
                  <div className="option-buttons">
                    {[
                      { id: "1", label: "1", url: "https://media.giphy.com/media/KBbr4hHl9DSahKvInO/giphy.gif?cid=790b76112m5eeeydoe7et0cr3j3ekb1erunxozyshuhxx2vl&ep=v1_stickers_search&rid=giphy.gif&ct=s" },
                      { id: "2", label: "2", url: "https://media.giphy.com/media/5PncuvcXbBuIZcSiQo/giphy.gif?cid=ecf05e47j7vdjtytp3fu84rslaivdun4zvfhej6wlvl6qqsz&ep=v1_stickers_search&rid=giphy.gif&ct=s" },
                      { id: "3", label: "3", url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ3JwcXdzcHd5MW92NWprZXVpcTBtNXM5cG9obWh0N3I4NzFpaDE3byZlcD12MV9zdGlja2Vyc19zZWFyY2gmY3Q9cw/WgsVx6C4N8tjy/giphy.gif" },
                      { id: "custom", label: "Custom", url: gifUrl }
                    ].map(g => (
                      <button
                        key={g.id}
                        onClick={() => {
                          setGifType(g.id);
                          if (g.id !== "custom") {
                            setGifUrl(g.url);
                          }
                        }}
                        className={`option-btn ${gifType === g.id ? "active" : ""}`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>

                {gifType === "custom" && (
                  <div className="option-row">
                    <span className="option-label">GIF URL</span>
                    <input
                      type="text"
                      value={gifUrl}
                      onChange={(e) => setGifUrl(e.target.value)}
                      placeholder="Enter GIF URL..."
                      className="gif-url-input"
                    />
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
