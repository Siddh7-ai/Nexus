import React, { useRef, useState, useEffect, Suspense } from "react";
import { 
    Bold, 
    Italic, 
    Underline, 
    Strikethrough, 
    Link, 
    ListOrdered, 
    List, 
    Quote, 
    Code, 
    FileCode,
    SendHorizontal,
    FileText,
    Image as ImageIcon,
    Camera,
    Headphones,
    User,
    BarChart2,
    Calendar,
    Smile,
    X
} from "lucide-react";

// Lazy load the full emoji picker for performance
const EmojiPicker = React.lazy(() => import("emoji-picker-react"));

import { getBackendUrl } from "../utils/config";

function htmlToMarkdown(node) {
    if (!node) return "";
    
    if (node.nodeType === Node.TEXT_NODE) {
        return node.nodeValue;
    }
    
    if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toLowerCase();
        
        // Handle code blocks (pre/code)
        if (tagName === "pre") {
            return `\n\`\`\`javascript\n${node.textContent.trim()}\n\`\`\`\n`;
        }
        if (tagName === "code") {
            // If it's already inside a pre, we handled it
            if (node.parentNode?.tagName?.toLowerCase() === "pre") {
                return node.textContent;
            }
            return `\`${node.textContent}\``;
        }
        
        let childrenContent = "";
        node.childNodes.forEach(child => {
            childrenContent += htmlToMarkdown(child);
        });
        
        switch (tagName) {
            case "strong":
            case "b":
                return childrenContent ? `**${childrenContent}**` : "";
            case "em":
            case "i":
                return childrenContent ? `*${childrenContent}*` : "";
            case "u":
                return childrenContent ? `<u>${childrenContent}</u>` : "";
            case "del":
            case "s":
            case "strike":
                return childrenContent ? `~~${childrenContent}~~` : "";
            case "a":
                const href = node.getAttribute("href") || "";
                return childrenContent ? `[${childrenContent}](${href})` : "";
            case "blockquote":
                return childrenContent ? `\n> ${childrenContent.trim().replace(/\n/g, "\n> ")}\n` : "";
            case "li":
                const parent = node.parentNode;
                if (parent?.tagName?.toLowerCase() === "ol") {
                    const siblings = Array.from(parent.childNodes).filter(n => n.tagName?.toLowerCase() === "li");
                    const index = siblings.indexOf(node) + 1;
                    return `${index}. ${childrenContent}\n`;
                }
                return `- ${childrenContent}\n`;
            case "ul":
            case "ol":
                return `\n${childrenContent}\n`;
            case "div":
            case "p":
                return `\n${childrenContent}`;
            case "br":
                return "\n";
            default:
                return childrenContent;
        }
    }
    return "";
}

function getMarkdownFromHtml(html) {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;
    
    // Remove zero-width spaces
    const cleanHtml = tempDiv.innerHTML.replace(/\u200B/g, "");
    tempDiv.innerHTML = cleanHtml;
    
    let markdown = htmlToMarkdown(tempDiv);
    
    // Collapse excess newlines, clean edges
    markdown = markdown
        .replace(/\n{3,}/g, "\n\n")
        .trim();
        
    return markdown;
}

function parseInlineMarkdown(text) {
    let result = "";
    let i = 0;
    let boldActive = false;
    let italicActive = false;
    let strikeActive = false;
    let codeActive = false;
    
    while (i < text.length) {
        if (text.startsWith("`", i)) {
            if (codeActive) {
                result += "</code>";
                codeActive = false;
            } else {
                result += "<code>";
                codeActive = true;
            }
            i += 1;
            continue;
        }
        
        if (codeActive) {
            result += text[i];
            i += 1;
            continue;
        }
        
        if (text.startsWith("**", i)) {
            if (boldActive) {
                result += "</strong>";
                boldActive = false;
            } else {
                result += "<strong>";
                boldActive = true;
            }
            i += 2;
            continue;
        }
        
        if (text.startsWith("*", i)) {
            if (italicActive) {
                result += "</em>";
                italicActive = false;
            } else {
                result += "<em>";
                italicActive = true;
            }
            i += 1;
            continue;
        }
        
        if (text.startsWith("~~", i)) {
            if (strikeActive) {
                result += "</del>";
                strikeActive = false;
            } else {
                result += "<del>";
                strikeActive = true;
            }
            i += 2;
            continue;
        }
        
        result += text[i];
        i += 1;
    }
    
    if (codeActive) result += "</code>";
    if (boldActive) result += "</strong>";
    if (italicActive) result += "</em>";
    if (strikeActive) result += "</del>";
    
    return result;
}

function parseInlineStyles(html) {
    const parts = html.split(/(<[^>]+>)/g);
    let insideCode = false;
    
    const parsedParts = parts.map(part => {
        if (part.startsWith("<") && part.endsWith(">")) {
            const tagName = part.replace(/[<>]/g, "").split(" ")[0].toLowerCase();
            if (tagName === "code" || tagName === "pre" || tagName === "/code" || tagName === "/pre") {
                insideCode = part.startsWith("</") ? false : true;
            }
            return part;
        }
        
        if (insideCode) {
            return part;
        }
        
        return parseInlineMarkdown(part);
    });
    return parsedParts.join("");
}

function markdownToHtml(markdown) {
    if (!markdown) return "";
    
    // Escape HTML first to prevent arbitrary script execution inside the contenteditable
    let html = markdown
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Code Blocks
    html = html.replace(/```(?:javascript|js)?\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

    // Re-enable <u> tags that we escaped
    html = html.replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, '<u>$1</u>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // BlockQuotes
    html = html.replace(/^&gt;\s+(.*)$/gm, '<blockquote>$1</blockquote>');

    // Bullet Lists
    html = html.replace(/^-\s+(.*)$/gm, '<ul><li>$1</li></ul>');

    // Ordered Lists
    html = html.replace(/^(\d+)\.\s+(.*)$/gm, '<ol><li>$2</li></ol>');

    // Merge consecutive ul/ol groups
    html = html.replace(/<\/ul>\n*<ul>/g, '');
    html = html.replace(/<\/ol>\n*<ol>/g, '');

    // Parse inline styles (Bold, Italic, Strikethrough, Inline Code) statefully
    html = parseInlineStyles(html);

    // Convert newlines to <br> in text portions
    const parts = html.split(/(<pre>[\s\S]*?<\/pre>)/g);
    html = parts.map(part => {
        if (part.startsWith("<pre>")) return part;
        return part.replace(/\n/g, "<br>");
    }).join("");

    return html;
}

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
    const [hoveredButton, setHoveredButton] = useState(null);
    const [tooltipPos, setTooltipPos] = useState({ left: 0, bottom: 0 });
    const [tooltipAlign, setTooltipAlign] = useState("edge-center");
    const [activeStyles, setActiveStyles] = useState([]);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const [linkModalOpen, setLinkModalOpen] = useState(false);
    const [linkText, setLinkText] = useState("");
    const [linkUrl, setLinkUrl] = useState("");
    
    const inputRef = useRef(null);
    const emojiButtonRef = useRef(null);
    const emojiPanelRef = useRef(null);

    const photosInputRef = useRef(null);
    const docsInputRef = useRef(null);

    const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
    const [permissionModalOpen, setPermissionModalOpen] = useState(false);
    const [permissionType, setPermissionType] = useState("photos");
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [previewModalOpen, setPreviewModalOpen] = useState(false);
    const [activePreviewIndex, setActivePreviewIndex] = useState(0);
    const [hdQuality, setHdQuality] = useState(false);
    const [captionText, setCaptionText] = useState("");
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [errorBanner, setErrorBanner] = useState(null);

    const compressImage = (file) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    let width = img.width;
                    let height = img.height;
                    const MAX_WIDTH = 1280;
                    const MAX_HEIGHT = 1280;
                    if (width > MAX_WIDTH || height > MAX_HEIGHT) {
                        if (width > height) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        } else {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0, width, height);
                    canvas.toBlob((blob) => {
                        if (blob) {
                            const compressedFile = new File([blob], file.name, {
                                type: "image/jpeg",
                                lastModified: Date.now()
                            });
                            resolve(compressedFile);
                        } else {
                            resolve(file);
                        }
                    }, "image/jpeg", 0.7);
                };
            };
        });
    };

    const handlePhotosClick = () => {
        setAttachmentMenuOpen(false);
        const perm = localStorage.getItem("nexus_file_permission");
        if (perm === "granted") {
            photosInputRef.current?.click();
        } else {
            setPermissionType("photos");
            setPermissionModalOpen(true);
        }
    };

    const handleDocsClick = () => {
        setAttachmentMenuOpen(false);
        const perm = localStorage.getItem("nexus_file_permission");
        if (perm === "granted") {
            docsInputRef.current?.click();
        } else {
            setPermissionType("documents");
            setPermissionModalOpen(true);
        }
    };

    const handleFileSelection = (e, source) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        e.target.value = "";

        if (source === "photos") {
            if (files.length > 20) {
                setErrorBanner("You can only select a maximum of 20 photos/videos.");
                setTimeout(() => setErrorBanner(null), 5000);
                return;
            }

            const largeVideo = files.find(f => f.type.startsWith("video/") && f.size > 100 * 1024 * 1024);
            if (largeVideo) {
                setErrorBanner("Video files must be smaller than 100MB.");
                setTimeout(() => setErrorBanner(null), 5000);
                return;
            }
        }

        const fileObjects = files.map(file => ({
            file,
            previewUrl: file.type.startsWith("image/") || file.type.startsWith("video/") 
                ? URL.createObjectURL(file) 
                : null,
            name: file.name,
            size: file.size,
            type: file.type
        }));

        setSelectedFiles(fileObjects);
        setActivePreviewIndex(0);
        setPreviewModalOpen(true);
        setHdQuality(false);
        setCaptionText("");
    };

    const handleSendAttachments = async () => {
        if (selectedFiles.length === 0) return;
        setUploading(true);
        setUploadProgress(0);

        try {
            for (let i = 0; i < selectedFiles.length; i++) {
                const fileObj = selectedFiles[i];
                let fileToUpload = fileObj.file;

                if (fileToUpload.type.startsWith("image/") && !hdQuality) {
                    fileToUpload = await compressImage(fileToUpload);
                }

                const formData = new FormData();
                formData.append("file", fileToUpload);

                const res = await fetch(`${getBackendUrl()}/api/upload`, {
                    method: "POST",
                    body: formData
                });
                
                if (!res.ok) {
                    throw new Error("Upload failed");
                }

                const uploadData = await res.json();
                
                const attachmentMsg = {
                    text: i === 0 ? captionText : "",
                    fileUrl: uploadData.fileUrl,
                    fileName: uploadData.fileName,
                    fileSize: uploadData.fileSize,
                    fileType: uploadData.fileType,
                    fileQuality: uploadData.fileType.startsWith("image/") ? (hdQuality ? "HD" : "Normal") : null
                };

                sendMessage(attachmentMsg);
                setUploadProgress(Math.round(((i + 1) / selectedFiles.length) * 100));
            }

            setSelectedFiles([]);
            setPreviewModalOpen(false);
            setCaptionText("");
        } catch (err) {
            console.error("Error sending files:", err);
            setErrorBanner("Failed to upload files. Please try again.");
            setTimeout(() => setErrorBanner(null), 5000);
        } finally {
            setUploading(false);
            setUploadProgress(0);
        }
    };

    const handleMouseEnter = (buttonType, event) => {
        const button = event.currentTarget;
        const inputArea = button.closest(".input-area");
        if (button && inputArea) {
            const buttonRect = button.getBoundingClientRect();
            const areaRect = inputArea.getBoundingClientRect();
            const left = (buttonRect.left - areaRect.left) + (buttonRect.width / 2);
            const bottom = areaRect.bottom - buttonRect.top + 8;
            
            // Prevent edge collision clipping
            let align = "edge-center";
            if (left < 75) {
                align = "edge-left";
            } else if (areaRect.width - left < 75) {
                align = "edge-right";
            }
            
            setTooltipAlign(align);
            setTooltipPos({ left, bottom });
            setHoveredButton(buttonType);
        }
    };

    const handleMouseLeave = () => {
        setHoveredButton(null);
    };

    function updateActiveStyles() {
        const selection = window.getSelection();
        if (!selection.rangeCount) {
            setActiveStyles([]);
            return;
        }
        
        let node = selection.anchorNode;
        if (!node) {
            setActiveStyles([]);
            return;
        }
        
        if (node.nodeType === Node.TEXT_NODE) {
            node = node.parentNode;
        }
        
        const styles = [];
        const editableContainer = inputRef.current;
        
        while (node && node !== editableContainer) {
            const tagName = node.tagName?.toLowerCase();
            if (tagName) {
                styles.push(tagName);
            }
            node = node.parentNode;
        }
        
        setActiveStyles(styles);
    }

    const isStyleActive = (type) => {
        try {
            const selection = window.getSelection();
            if (!selection.rangeCount) return false;
            
            // Check if selection anchor is within the editor container
            let node = selection.anchorNode;
            let insideEditor = false;
            const editableContainer = inputRef.current;
            while (node) {
                if (node === editableContainer) {
                    insideEditor = true;
                    break;
                }
                node = node.parentNode;
            }
            
            if (!insideEditor) return false;

            switch (type) {
                case "bold":
                    return document.queryCommandState("bold");
                case "italic":
                    return document.queryCommandState("italic");
                case "underline":
                    return document.queryCommandState("underline");
                case "strikethrough":
                    return document.queryCommandState("strikeThrough");
                case "ordered-list":
                    return document.queryCommandState("insertOrderedList");
                case "bullet-list":
                    return document.queryCommandState("insertUnorderedList");
                case "link":
                    return activeStyles.includes("a");
                case "quote":
                    return activeStyles.includes("blockquote");
                case "code-inline": {
                    const codeIndex = activeStyles.indexOf("code");
                    const preIndex = activeStyles.indexOf("pre");
                    return codeIndex !== -1 && preIndex === -1;
                }
                case "code-block":
                    return activeStyles.includes("pre");
                default:
                    return false;
            }
        } catch (e) {
            return false;
        }
    };

    function handleInput() {
        const input = inputRef.current;
        if (!input) return;
        
        const nextMarkdown = getMarkdownFromHtml(input.innerHTML);
        handleTyping(nextMarkdown);
    }
    function applyFormatting(type, options = {}) {
        const input = inputRef.current;
        if (!input) return;

        input.focus();

        switch (type) {
            case "bold":
                document.execCommand("bold", false, null);
                break;
            case "italic":
                document.execCommand("italic", false, null);
                break;
            case "underline":
                document.execCommand("underline", false, null);
                break;
            case "strikethrough":
                document.execCommand("strikeThrough", false, null);
                break;
            case "ordered-list":
                document.execCommand("insertOrderedList", false, null);
                break;
            case "bullet-list":
                document.execCommand("insertUnorderedList", false, null);
                break;
            case "quote": {
                const selection = window.getSelection();
                if (selection.rangeCount) {
                    let parent = selection.getRangeAt(0).commonAncestorContainer;
                    if (parent.nodeType === Node.TEXT_NODE) parent = parent.parentNode;
                    
                    let insideQuote = false;
                    let node = parent;
                    while (node && node !== input) {
                        if (node.tagName?.toLowerCase() === "blockquote") {
                            insideQuote = true;
                            break;
                        }
                        node = node.parentNode;
                    }
                    
                    if (insideQuote) {
                        document.execCommand("formatBlock", false, "div");
                    } else {
                        document.execCommand("formatBlock", false, "blockquote");
                    }
                }
                break;
            }
            case "code-block": {
                const selection = window.getSelection();
                if (selection.rangeCount) {
                    const range = selection.getRangeAt(0);
                    const selectedText = range.toString() || "\u200B";
                    const htmlToInsert = `<pre><code>${selectedText}</code></pre>`;
                    document.execCommand("insertHTML", false, htmlToInsert);
                }
                break;
            }
            case "code-inline": {
                const selection = window.getSelection();
                if (selection.rangeCount) {
                    const range = selection.getRangeAt(0);
                    const selectedText = range.toString() || "\u200B";
                    const htmlToInsert = `<code>${selectedText}</code>`;
                    document.execCommand("insertHTML", false, htmlToInsert);
                }
                break;
            }
            case "link": {
                const url = options.url || "https://";
                const text = options.text || "link";
                const htmlToInsert = `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
                document.execCommand("insertHTML", false, htmlToInsert);
                break;
            }
            default:
                break;
        }

        handleInput();
        updateActiveStyles();
    }

    function handleInsertLink(e) {
        e.preventDefault();
        applyFormatting("link", { text: linkText, url: linkUrl });
        setLinkModalOpen(false);
        setLinkText("");
        setLinkUrl("");
    }

    useEffect(() => {
        function handleClickOutside(event) {
            if (emojiOpen) {
                const clickedButton = emojiButtonRef.current && emojiButtonRef.current.contains(event.target);
                const clickedPanel = emojiPanelRef.current && emojiPanelRef.current.contains(event.target);
                if (!clickedButton && !clickedPanel) {
                    setEmojiOpen(false);
                }
            }
            if (attachmentMenuOpen) {
                const clickedAddBtn = event.target.closest(".composer-tool");
                const clickedPopover = event.target.closest(".attachment-menu-popover");
                if (!clickedAddBtn && !clickedPopover) {
                    setAttachmentMenuOpen(false);
                }
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [emojiOpen, attachmentMenuOpen]);

    function handleTyping(value) {
        if (onTyping) {
            onTyping(value, { username, activeRoom, activePrivate });
            return;
        }
        setMessage(value);
    }

    function insertEmoji(emoji) {
        const selection = window.getSelection();
        if (!selection.rangeCount) {
            const input = inputRef.current;
            if (input) {
                input.focus();
                input.innerHTML += emoji;
                handleInput();
            }
            return;
        }
        
        const range = selection.getRangeAt(0);
        range.deleteContents();
        
        const textNode = document.createTextNode(emoji);
        range.insertNode(textNode);
        
        const newRange = document.createRange();
        newRange.setStartAfter(textNode);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
        
        handleInput();
    }

    useEffect(() => {
        const input = inputRef.current;
        if (!input) return;
        
        const currentMarkdown = getMarkdownFromHtml(input.innerHTML);
        if (currentMarkdown !== message) {
            if (!message) {
                input.innerHTML = "";
            } else {
                input.innerHTML = markdownToHtml(message);
            }
        }
    }, [message]);

    return (
        <div className="input-area">
            {isEditing && (
                <div className="edit-banner">
                    Editing message
                    <button className="cancel-edit-btn" onClick={onCancelEdit}>Cancel</button>
                </div>
            )}

            {/* LINK FORMATTING DIALOG MODAL */}
            {linkModalOpen && (
                <div className="formatting-link-modal-overlay">
                    <form className="formatting-link-modal" onSubmit={handleInsertLink}>
                        <h3>Insert Link</h3>
                        <div className="modal-form-group">
                            <label>Text</label>
                            <input 
                                type="text"
                                placeholder="Link display text..."
                                value={linkText}
                                onChange={(e) => setLinkText(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <div className="modal-form-group">
                            <label>URL</label>
                            <input 
                                type="text"
                                placeholder="https://example.com"
                                value={linkUrl}
                                onChange={(e) => setLinkUrl(e.target.value)}
                            />
                        </div>
                        <div className="modal-actions">
                            <button type="submit" className="modal-btn primary">Insert</button>
                            <button type="button" className="modal-btn" onClick={() => setLinkModalOpen(false)}>Cancel</button>
                        </div>
                    </form>
                </div>
            )}

            {/* RICH TEXT FORMATTING TOOLBAR */}
            <div className="composer-formatting-toolbar">
                <button
                    className={`format-btn ${isStyleActive("bold") ? "active" : ""}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyFormatting("bold")}
                    onMouseEnter={(e) => handleMouseEnter("bold", e)}
                    onMouseLeave={handleMouseLeave}
                    aria-label="Format Bold"
                >
                    <Bold size={15} />
                </button>
                <button
                    className={`format-btn ${isStyleActive("italic") ? "active" : ""}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyFormatting("italic")}
                    onMouseEnter={(e) => handleMouseEnter("italic", e)}
                    onMouseLeave={handleMouseLeave}
                    aria-label="Format Italic"
                >
                    <Italic size={15} />
                </button>
                <button
                    className={`format-btn ${isStyleActive("underline") ? "active" : ""}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyFormatting("underline")}
                    onMouseEnter={(e) => handleMouseEnter("underline", e)}
                    onMouseLeave={handleMouseLeave}
                    aria-label="Format Underline"
                >
                    <Underline size={15} />
                </button>
                <button
                    className={`format-btn ${isStyleActive("strikethrough") ? "active" : ""}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyFormatting("strikethrough")}
                    onMouseEnter={(e) => handleMouseEnter("strikethrough", e)}
                    onMouseLeave={handleMouseLeave}
                    aria-label="Format Strikethrough"
                >
                    <Strikethrough size={15} />
                </button>
                <div className="toolbar-divider" />
                <button
                    className={`format-btn ${isStyleActive("link") ? "active" : ""}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                        const selectionText = window.getSelection()?.toString() || "";
                        setLinkText(selectionText);
                        setLinkUrl("");
                        setLinkModalOpen(true);
                    }}
                    onMouseEnter={(e) => handleMouseEnter("link", e)}
                    onMouseLeave={handleMouseLeave}
                    aria-label="Insert Link"
                >
                    <Link size={15} />
                </button>
                <div className="toolbar-divider" />
                <button
                    className={`format-btn ${isStyleActive("ordered-list") ? "active" : ""}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyFormatting("ordered-list")}
                    onMouseEnter={(e) => handleMouseEnter("ordered-list", e)}
                    onMouseLeave={handleMouseLeave}
                    aria-label="Numbered List"
                >
                    <ListOrdered size={15} />
                </button>
                <button
                    className={`format-btn ${isStyleActive("bullet-list") ? "active" : ""}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyFormatting("bullet-list")}
                    onMouseEnter={(e) => handleMouseEnter("bullet-list", e)}
                    onMouseLeave={handleMouseLeave}
                    aria-label="Bullet List"
                >
                    <List size={15} />
                </button>
                <div className="toolbar-divider" />
                <button
                    className={`format-btn ${isStyleActive("quote") ? "active" : ""}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyFormatting("quote")}
                    onMouseEnter={(e) => handleMouseEnter("quote", e)}
                    onMouseLeave={handleMouseLeave}
                    aria-label="Block Quote"
                >
                    <Quote size={15} />
                </button>
                <div className="toolbar-divider" />
                <button
                    className={`format-btn ${isStyleActive("code-inline") ? "active" : ""}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyFormatting("code-inline")}
                    onMouseEnter={(e) => handleMouseEnter("code-inline", e)}
                    onMouseLeave={handleMouseLeave}
                    aria-label="Inline Code"
                >
                    <Code size={15} />
                </button>
                <button
                    className={`format-btn ${isStyleActive("code-block") ? "active" : ""}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyFormatting("code-block")}
                    onMouseEnter={(e) => handleMouseEnter("code-block", e)}
                    onMouseLeave={handleMouseLeave}
                    aria-label="Code Block"
                >
                    <FileCode size={15} />
                </button>
            </div>

            {/* ERROR BANNER */}
            {errorBanner && (
                <div className="composer-error-banner">
                    <span>{errorBanner}</span>
                    <button className="close-banner-btn" onClick={() => setErrorBanner(null)}><X size={14} /></button>
                </div>
            )}

            <div className="input-group">
                {/* HIDDEN INPUTS */}
                <input
                    type="file"
                    ref={photosInputRef}
                    style={{ display: "none" }}
                    accept="image/*,video/*"
                    multiple
                    onChange={(e) => handleFileSelection(e, "photos")}
                />
                <input
                    type="file"
                    ref={docsInputRef}
                    style={{ display: "none" }}
                    accept="*"
                    multiple
                    onChange={(e) => handleFileSelection(e, "documents")}
                />

                <button
                    className={`composer-tool ${attachmentMenuOpen ? "active" : ""}`}
                    type="button"
                    aria-label="Attach file"
                    onClick={() => {
                        if (isGuest) {
                            if (onLockTrigger) onLockTrigger();
                            return;
                        }
                        setAttachmentMenuOpen(!attachmentMenuOpen);
                    }}
                >
                    +
                </button>

                {/* ATTACHMENT POPOVER MENU */}
                {attachmentMenuOpen && (
                    <div className="attachment-menu-popover">
                        <button type="button" className="popover-item" onClick={handleDocsClick}>
                            <div className="popover-icon-wrapper purple-bg">
                                <FileText size={18} />
                            </div>
                            <span>Document</span>
                        </button>
                        <button type="button" className="popover-item" onClick={handlePhotosClick}>
                            <div className="popover-icon-wrapper blue-bg">
                                <ImageIcon size={18} />
                            </div>
                            <span>Photos & videos</span>
                        </button>
                        <button type="button" className="popover-item disabled-item" onClick={() => {}}>
                            <div className="popover-icon-wrapper pink-bg">
                                <Camera size={18} />
                            </div>
                            <span>Camera</span>
                            <span className="coming-soon-badge">Soon</span>
                        </button>
                        <button type="button" className="popover-item disabled-item" onClick={() => {}}>
                            <div className="popover-icon-wrapper orange-bg">
                                <Headphones size={18} />
                            </div>
                            <span>Audio</span>
                            <span className="coming-soon-badge">Soon</span>
                        </button>
                        <button type="button" className="popover-item disabled-item" onClick={() => {}}>
                            <div className="popover-icon-wrapper cyan-bg">
                                <User size={18} />
                            </div>
                            <span>Contact</span>
                            <span className="coming-soon-badge">Soon</span>
                        </button>
                        <button type="button" className="popover-item disabled-item" onClick={() => {}}>
                            <div className="popover-icon-wrapper yellow-bg">
                                <BarChart2 size={18} />
                            </div>
                            <span>Poll</span>
                            <span className="coming-soon-badge">Soon</span>
                        </button>
                        <button type="button" className="popover-item disabled-item" onClick={() => {}}>
                            <div className="popover-icon-wrapper magenta-bg">
                                <Calendar size={18} />
                            </div>
                            <span>Event</span>
                            <span className="coming-soon-badge">Soon</span>
                        </button>
                        <button type="button" className="popover-item disabled-item" onClick={() => {}}>
                            <div className="popover-icon-wrapper green-bg">
                                <Smile size={18} />
                            </div>
                            <span>New sticker</span>
                            <span className="coming-soon-badge">Soon</span>
                        </button>
                    </div>
                )}

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

                <div
                    ref={inputRef}
                    className="composer-textarea-editable"
                    contentEditable="true"
                    data-placeholder={isEditing ? "Edit your message..." : "Type a message..."}
                    onInput={handleInput}
                    onKeyUp={updateActiveStyles}
                    onMouseUp={updateActiveStyles}
                    onFocus={updateActiveStyles}
                    onBlur={() => setActiveStyles([])}
                    onKeyDown={(e) => {
                        // Keyboard shortcuts for formatting
                        if (e.ctrlKey || e.metaKey) {
                            const key = e.key.toLowerCase();
                            if (key === "b") {
                                e.preventDefault();
                                applyFormatting("bold");
                                return;
                            } else if (key === "i") {
                                e.preventDefault();
                                applyFormatting("italic");
                                return;
                            } else if (key === "u") {
                                e.preventDefault();
                                applyFormatting("underline");
                                return;
                            } else if (key === "e") {
                                e.preventDefault();
                                applyFormatting("code-inline");
                                return;
                            } else if (key === "k") {
                                e.preventDefault();
                                const selectionText = window.getSelection()?.toString() || "";
                                setLinkText(selectionText);
                                setLinkUrl("");
                                setLinkModalOpen(true);
                                return;
                            } else if (e.shiftKey && key === "x") {
                                e.preventDefault();
                                applyFormatting("strikethrough");
                                return;
                            } else if (e.shiftKey && key === "c") {
                                e.preventDefault();
                                applyFormatting("code-block");
                                return;
                            }
                        }

                        if (e.key === "Enter") {
                            if (e.shiftKey) {
                                // Allow default shift+enter newline behavior
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
                />
                <button className="send-btn" onClick={sendMessage} disabled={!message.trim()} aria-label="Send Message">
                    {isEditing ? "Save" : <SendHorizontal size={17} />}
                </button>
            </div>

            {/* GLOBAL PREVIEW TOOLTIP */}
            {hoveredButton && (
                <div 
                    className={`format-preview-tooltip ${tooltipAlign}`}
                    style={{ 
                        left: `${tooltipPos.left}px`, 
                        bottom: `${tooltipPos.bottom}px`,
                        position: "absolute" 
                    }}
                >
                    {hoveredButton === "bold" && (
                        <>
                            <div className="preview-title">Bold</div>
                            <div className="preview-shortcut">
                                <kbd className="preview-keycap">Ctrl</kbd>
                                <kbd className="preview-keycap">B</kbd>
                            </div>
                            <div className="preview-divider" />
                            <div className="preview-label">Preview</div>
                            <div className="preview-content">
                                <strong>Hiii</strong>
                            </div>
                        </>
                    )}
                    {hoveredButton === "italic" && (
                        <>
                            <div className="preview-title">Italic</div>
                            <div className="preview-shortcut">
                                <kbd className="preview-keycap">Ctrl</kbd>
                                <kbd className="preview-keycap">I</kbd>
                            </div>
                            <div className="preview-divider" />
                            <div className="preview-label">Preview</div>
                            <div className="preview-content">
                                <em>Hiii</em>
                            </div>
                        </>
                    )}
                    {hoveredButton === "underline" && (
                        <>
                            <div className="preview-title">Underline</div>
                            <div className="preview-shortcut">
                                <kbd className="preview-keycap">Ctrl</kbd>
                                <kbd className="preview-keycap">U</kbd>
                            </div>
                            <div className="preview-divider" />
                            <div className="preview-label">Preview</div>
                            <div className="preview-content">
                                <u>Hiii</u>
                            </div>
                        </>
                    )}
                    {hoveredButton === "strikethrough" && (
                        <>
                            <div className="preview-title">Strikethrough</div>
                            <div className="preview-shortcut">
                                <kbd className="preview-keycap">Ctrl</kbd>
                                <kbd className="preview-keycap">Shift</kbd>
                                <kbd className="preview-keycap">X</kbd>
                            </div>
                            <div className="preview-divider" />
                            <div className="preview-label">Preview</div>
                            <div className="preview-content">
                                <del>Hiii</del>
                            </div>
                        </>
                    )}
                    {hoveredButton === "link" && (
                        <>
                            <div className="preview-title">Insert Link</div>
                            <div className="preview-shortcut">
                                <kbd className="preview-keycap">Ctrl</kbd>
                                <kbd className="preview-keycap">K</kbd>
                            </div>
                            <div className="preview-divider" />
                            <div className="preview-label">Preview</div>
                            <div className="preview-content">
                                <span style={{ color: "var(--accent)", textDecoration: "underline" }}>Hello Hello</span>
                            </div>
                        </>
                    )}
                    {hoveredButton === "ordered-list" && (
                        <>
                            <div className="preview-title">Numbered List</div>
                            <div className="preview-divider" />
                            <div className="preview-label">Preview</div>
                            <div className="preview-content">
                                <ol style={{ margin: 0, paddingLeft: "14px", textAlign: "left", listStyleType: "decimal" }}>
                                    <li style={{ fontSize: "11px" }}>Hiii</li>
                                    <li style={{ fontSize: "11px" }}>Hiii</li>
                                </ol>
                            </div>
                        </>
                    )}
                    {hoveredButton === "bullet-list" && (
                        <>
                            <div className="preview-title">Bullet List</div>
                            <div className="preview-divider" />
                            <div className="preview-label">Preview</div>
                            <div className="preview-content">
                                <ul style={{ margin: 0, paddingLeft: "14px", textAlign: "left", listStyleType: "disc" }}>
                                    <li style={{ fontSize: "11px" }}>Hiii</li>
                                    <li style={{ fontSize: "11px" }}>Hiii</li>
                                </ul>
                            </div>
                        </>
                    )}
                    {hoveredButton === "quote" && (
                        <>
                            <div className="preview-title">Block Quote</div>
                            <div className="preview-divider" />
                            <div className="preview-label">Preview</div>
                            <div className="preview-content" style={{ width: "100%" }}>
                                <blockquote style={{ margin: 0, paddingLeft: "6px", borderLeft: "2px solid var(--accent)", color: "#94a3b8", fontStyle: "italic", textAlign: "left", width: "100%" }}>
                                    Hiii
                                </blockquote>
                            </div>
                        </>
                    )}
                    {hoveredButton === "code-inline" && (
                        <>
                            <div className="preview-title">Inline Code</div>
                            <div className="preview-shortcut">
                                <kbd className="preview-keycap">Ctrl</kbd>
                                <kbd className="preview-keycap">E</kbd>
                            </div>
                            <div className="preview-divider" />
                            <div className="preview-label">Preview</div>
                            <div className="preview-content">
                                <code style={{ background: "rgba(255,255,255,0.15)", padding: "2px 4px", borderRadius: "3px", fontFamily: "monospace" }}>Hiii</code>
                            </div>
                        </>
                    )}
                    {hoveredButton === "code-block" && (
                        <>
                            <div className="preview-title">Code Block</div>
                            <div className="preview-shortcut">
                                <kbd className="preview-keycap">Ctrl</kbd>
                                <kbd className="preview-keycap">Shift</kbd>
                                <kbd className="preview-keycap">C</kbd>
                            </div>
                            <div className="preview-divider" />
                            <div className="preview-label">Preview</div>
                            <div className="preview-content" style={{ width: "100%" }}>
                                <pre style={{ margin: 0, background: "rgba(0,0,0,0.25)", padding: "4px 6px", borderRadius: "4px", fontFamily: "monospace", textAlign: "left", width: "100%" }}>
                                    <code>Hiii</code>
                                </pre>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* PERMISSION MODAL */}
            {permissionModalOpen && (
                <div className="permission-modal-overlay">
                    <div className="permission-modal">
                        <div className="permission-modal-icon">
                            <FileText size={40} className="purple-text" />
                        </div>
                        <h3>Permission Request</h3>
                        <p>Allow Nexus to access photos, media, and files on your device?</p>
                        <div className="permission-actions">
                            <button 
                                type="button" 
                                className="permission-btn deny" 
                                onClick={() => {
                                    setPermissionModalOpen(false);
                                    setErrorBanner("Permission to access files was denied.");
                                    setTimeout(() => setErrorBanner(null), 3000);
                                }}
                            >
                                Don't Allow
                            </button>
                            <button 
                                type="button" 
                                className="permission-btn allow" 
                                onClick={() => {
                                    localStorage.setItem("nexus_file_permission", "granted");
                                    setPermissionModalOpen(false);
                                    if (permissionType === "photos") {
                                        photosInputRef.current?.click();
                                    } else {
                                        docsInputRef.current?.click();
                                    }
                                }}
                            >
                                Allow
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* PREVIEW MODAL */}
            {previewModalOpen && selectedFiles.length > 0 && (
                <div className="attachment-preview-overlay">
                    <div className="attachment-preview-modal">
                        {/* Header */}
                        <div className="preview-header">
                            <button 
                                type="button" 
                                className="preview-close-btn" 
                                onClick={() => {
                                    setSelectedFiles([]);
                                    setPreviewModalOpen(false);
                                }}
                            >
                                <X size={20} />
                            </button>

                            {/* HD quality toggle (only visible if there are photos) */}
                            {selectedFiles.some(f => f.type.startsWith("image/")) && (
                                <div className="preview-hd-toggle-container">
                                    <button 
                                        type="button" 
                                        className={`hd-quality-btn ${hdQuality ? "active" : ""}`}
                                        onClick={() => setHdQuality(!hdQuality)}
                                        title={hdQuality ? "HD Quality enabled (Original size)" : "Standard Quality enabled (Compressed)"}
                                    >
                                        <span className="hd-badge-text">HD</span>
                                        <span className="hd-status-text">{hdQuality ? "HD" : "Standard"}</span>
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Central Preview Area */}
                        <div className="preview-body">
                            {selectedFiles[activePreviewIndex].type.startsWith("image/") ? (
                                <div className="preview-media-container">
                                    <img 
                                        src={selectedFiles[activePreviewIndex].previewUrl} 
                                        alt="Preview" 
                                        className="preview-img-element"
                                    />
                                </div>
                            ) : selectedFiles[activePreviewIndex].type.startsWith("video/") ? (
                                <div className="preview-media-container">
                                    <video 
                                        src={selectedFiles[activePreviewIndex].previewUrl} 
                                        controls 
                                        className="preview-video-element"
                                    />
                                </div>
                            ) : (
                                <div className="preview-doc-container">
                                    <FileText size={64} className="doc-icon" />
                                    <span className="doc-name">{selectedFiles[activePreviewIndex].name}</span>
                                    <span className="doc-size">
                                        {(selectedFiles[activePreviewIndex].size / 1024 / 1024).toFixed(2)} MB
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Footer input and send row */}
                        <div className="preview-footer">
                            {/* Horizontal grid of selected files at bottom if more than 1 file */}
                            {selectedFiles.length > 1 && (
                                <div className="preview-thumbnails-tray">
                                    {selectedFiles.map((f, idx) => (
                                        <div 
                                            key={idx}
                                            className={`thumbnail-item ${idx === activePreviewIndex ? "active" : ""}`}
                                            onClick={() => setActivePreviewIndex(idx)}
                                        >
                                            {f.type.startsWith("image/") ? (
                                                <img src={f.previewUrl} alt="Thumb" />
                                            ) : f.type.startsWith("video/") ? (
                                                <div className="video-thumb-placeholder">Video</div>
                                            ) : (
                                                <div className="doc-thumb-placeholder">Doc</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {uploading ? (
                                <div className="preview-uploading-progress">
                                    <div className="progress-bar-container">
                                        <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }} />
                                    </div>
                                    <span className="progress-text">Sending files... {uploadProgress}%</span>
                                </div>
                            ) : (
                                <div className="preview-caption-row">
                                    <input 
                                        type="text" 
                                        placeholder="Add a caption..." 
                                        value={captionText} 
                                        onChange={(e) => setCaptionText(e.target.value)} 
                                        className="preview-caption-input"
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                handleSendAttachments();
                                            }
                                        }}
                                    />
                                    <button 
                                        type="button" 
                                        className="preview-send-btn" 
                                        onClick={handleSendAttachments}
                                    >
                                        <SendHorizontal size={20} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default MessageInput;
