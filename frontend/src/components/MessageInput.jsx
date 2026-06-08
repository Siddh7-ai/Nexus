import React, { useRef, useState, useEffect, Suspense } from "react";

// Lazy load the full emoji picker for performance
const EmojiPicker = React.lazy(() => import("emoji-picker-react"));

function MessageInput({
    message,
    setMessage,
    sendMessage,
    username,
    activeRoom,
    activePrivate,
    onTyping,
    isEditing,
    onCancelEdit,
    isGuest,
    onLockTrigger
}) {
    const [emojiOpen, setEmojiOpen] = useState(false);
    const inputRef = useRef(null);
    const emojiButtonRef = useRef(null);
    const emojiPanelRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (emojiOpen) {
                const clickedButton = emojiButtonRef.current && emojiButtonRef.current.contains(event.target);
                const clickedPanel = emojiPanelRef.current && emojiPanelRef.current.contains(event.target);
                if (!clickedButton && !clickedPanel) {
                    setEmojiOpen(false);
                }
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [emojiOpen]);

    function handleTyping(value) {
        if (onTyping) {
            onTyping(value, { username, activeRoom, activePrivate });
            return;
        }
        setMessage(value);
    }

    function insertEmoji(emoji) {
        const input = inputRef.current;
        const cursor = input?.selectionStart ?? message.length;
        const nextMessage = `${message.slice(0, cursor)}${emoji}${message.slice(cursor)}`;
        handleTyping(nextMessage);

        requestAnimationFrame(() => {
            input?.focus();
            const nextCursor = cursor + emoji.length;
            input?.setSelectionRange(nextCursor, nextCursor);
        });
    }

    return (
        <div className="input-area">
            {isEditing && (
                <div className="edit-banner">
                    Editing message
                    <button className="cancel-edit-btn" onClick={onCancelEdit}>Cancel</button>
                </div>
            )}

            <div className="input-group">
                <button
                    className="composer-tool"
                    type="button"
                    aria-label="Attach file"
                    onClick={() => {
                        if (isGuest && onLockTrigger) {
                            onLockTrigger();
                        }
                    }}
                >
                    +
                </button>
                <button
                    ref={emojiButtonRef}
                    className={`composer-tool ${emojiOpen ? "active" : ""}`}
                    type="button"
                    aria-label="Emoji"
                    onClick={() => setEmojiOpen(value => !value)}
                >
                    ☺
                </button>

                {emojiOpen && (
                    <div ref={emojiPanelRef} className="composer-emoji-panel">
                        <Suspense fallback={<div className="emoji-picker-loader">Loading Picker...</div>}>
                            <EmojiPicker
                                onEmojiClick={(emojiData) => insertEmoji(emojiData.emoji)}
                                autoFocusSearch={true}
                                skinTonesDisabled={false}
                                width="100%"
                                height="340px"
                            />
                        </Suspense>
                    </div>
                )}

                <textarea
                    ref={inputRef}
                    placeholder={isEditing ? "Edit your message..." : "Type a message..."}
                    value={message}
                    onChange={(e) => handleTyping(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            if (e.shiftKey) {
                                // Allow default newline behavior in textarea
                                return;
                            } else {
                                // Enter only: send message
                                e.preventDefault();
                                sendMessage();
                            }
                        }
                        if (e.key === "Escape" && isEditing) onCancelEdit();
                        if (e.key === "Escape" && emojiOpen) setEmojiOpen(false);
                    }}
                    autoFocus={isEditing}
                    rows={1}
                />
                <button className="send-btn" onClick={sendMessage} disabled={!message.trim()}>
                    {isEditing ? "Save" : ">"}
                </button>
            </div>
        </div>
    );
}

export default MessageInput;
