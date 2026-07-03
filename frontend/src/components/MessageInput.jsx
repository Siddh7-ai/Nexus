import React, { useRef, useState, useEffect, Suspense } from "react";
import { useTheme } from "../context/ThemeContext";
import { playPop } from "../utils/audio";
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
    X,
    RefreshCw,
    Crop,
    Plus,
    Lock
} from "lucide-react";
import { SmoothInput } from "./SmoothInput";
import VoiceRecorder from "./VoiceRecorder";
import StickerPicker from "./StickerPicker";
import StickerCreator from "./StickerCreator";
import sodium from "libsodium-wrappers-sumo";
import { motion, useMotionValue, animate } from "framer-motion";

// Lazy load the full emoji picker for performance
const EmojiPicker = React.lazy(() => import("emoji-picker-react"));

import { getBackendUrl } from "../utils/config";

function isElementUnderlined(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    const tagName = node.tagName.toLowerCase();
    if (tagName === "u" || tagName === "ins") return true;
    
    // Check style attribute
    const styleAttr = node.getAttribute("style") || "";
    const cleanStyle = styleAttr.replace(/\s+/g, "").toLowerCase();
    if (cleanStyle.includes("text-decoration:underline") || 
        cleanStyle.includes("text-decoration-line:underline")) {
        return true;
    }
    
    // Check inline style properties
    try {
        const textDec = node.style?.textDecoration || "";
        const textDecLine = node.style?.textDecorationLine || "";
        if (textDec.includes("underline") || textDecLine.includes("underline")) {
            return true;
        }
    } catch (e) {}
    
    // Check class names
    try {
        if (node.classList?.contains("underline") || 
            (node.className && typeof node.className === "string" && node.className.includes("underline"))) {
            return true;
        }
    } catch (e) {}
    
    return false;
}

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

        // Wrap with u tag if the element has underline styling (excluding u/ins to avoid wrapping twice)
        if (isElementUnderlined(node) && tagName !== "u" && tagName !== "ins") {
            childrenContent = childrenContent ? `<u>${childrenContent}</u>` : "";
        }
        
        switch (tagName) {
            case "strong":
            case "b":
                return childrenContent ? `**${childrenContent}**` : "";
            case "em":
            case "i":
                return childrenContent ? `*${childrenContent}*` : "";
            case "u":
            case "ins":
                return childrenContent ? `<u>${childrenContent}</u>` : "";
            case "span":
                return childrenContent;
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
    onLockTrigger,
    onVoiceMessageSend,
    onRecordingStart,
    onRecordingStop
}) {
    const { toggleTheme } = useTheme();
    const [showSlashMenu, setShowSlashMenu] = useState(false);
    const [activeCommandIndex, setActiveCommandIndex] = useState(0);

    const slashCommandsList = [
        { name: "/assign", desc: "Assign task member", usage: "/assign @username" },
        { name: "/clear", desc: "Clear composer text", usage: "/clear" },
        { name: "/gif", desc: "Search & insert a GIF", usage: "/gif [search-term]" },
        { name: "/help", desc: "Display bot help options", usage: "/help" },
        { name: "/task", desc: "Create a new Kanban task", usage: "/task [title]" },
        { name: "/theme", desc: "Toggle light/dark theme", usage: "/theme [light|dark]" }
    ];

    const getFilteredCommands = () => {
        if (!message || !message.startsWith("/")) return [];
        const inputWord = message.split(" ")[0];
        return slashCommandsList.filter(cmd => 
            cmd.name.startsWith(inputWord.toLowerCase())
        );
    };
    const filteredCommands = getFilteredCommands();

    useEffect(() => {
        if (message && message.startsWith("/")) {
            setShowSlashMenu(true);
        } else {
            setShowSlashMenu(false);
        }
        setActiveCommandIndex(0);
    }, [message]);

    const selectSlashCommand = (cmd) => {
        if (!cmd) return;
        if (cmd.name === "/clear") {
            if (inputRef.current) inputRef.current.innerHTML = "";
            setMessage("");
            setShowSlashMenu(false);
            return;
        }
        if (cmd.name === "/theme") {
            if (toggleTheme) toggleTheme();
            if (inputRef.current) inputRef.current.innerHTML = "";
            setMessage("");
            setShowSlashMenu(false);
            return;
        }
        if (cmd.name === "/help") {
            if (inputRef.current) {
                inputRef.current.innerHTML = "Available commands: /assign, /clear, /gif, /help, /task, /theme";
                setMessage("Available commands: /assign, /clear, /gif, /help, /task, /theme");
            }
            setShowSlashMenu(false);
            return;
        }
        
        // Autocomplete
        if (inputRef.current) {
            inputRef.current.innerHTML = cmd.name + " ";
            setMessage(cmd.name + " ");
            inputRef.current.focus();
            setTimeout(() => {
                const range = document.createRange();
                range.selectNodeContents(inputRef.current);
                range.collapse(false);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }, 10);
        }
        setShowSlashMenu(false);
    };

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
    const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
    const [stickerPickerDefaultPack, setStickerPickerDefaultPack] = useState("funny");
    const [stickerCreatorOpen, setStickerCreatorOpen] = useState(false);
    const [permissionModalOpen, setPermissionModalOpen] = useState(false);
    const [permissionType, setPermissionType] = useState("photos");
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [previewModalOpen, setPreviewModalOpen] = useState(false);
    const [activePreviewIndex, setActivePreviewIndex] = useState(0);

    // Animated caret for contentEditable rich text area
    const editorCaretX = useMotionValue(0);
    const editorCaretY = useMotionValue(0);
    const editorCaretOpacity = useMotionValue(0);
    const editorCaretHeight = useMotionValue(20);

    const prevTextRef = useRef("");
    const [isFocused, setIsFocused] = useState(false);
    const [isCaretActive, setIsCaretActive] = useState(false);
    const caretIdleTimeoutRef = useRef(null);
    const activeAnimXRef = useRef(null);
    const activeAnimYRef = useRef(null);
    const prevXRef = useRef(0);
    const prevYRef = useRef(0);

    const updateEditorCaret = () => {
        const editor = inputRef.current;
        if (!editor || document.activeElement !== editor) {
            editorCaretOpacity.set(0);
            return;
        }

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            editorCaretOpacity.set(0);
            return;
        }

        const range = selection.getRangeAt(0);
        const hasSelection = !range.collapsed;
        if (hasSelection) {
            editorCaretOpacity.set(0);
            return;
        }

        const editorRect = editor.getBoundingClientRect();
        let caretRect = null;
        const rects = range.getClientRects();

        if (rects && rects.length > 0) {
            caretRect = rects[0];
        }

        // If caretRect is null or has 0 dimensions, try the dummy node technique (e.g. for empty lines / Shift+Enter newlines)
        if (!caretRect || caretRect.height === 0 || caretRect.width === 0) {
            try {
                const clonedRange = range.cloneRange();
                const tempNode = document.createTextNode("\u200B");
                clonedRange.insertNode(tempNode);
                const tempRects = clonedRange.getClientRects();
                if (tempRects && tempRects.length > 0) {
                    caretRect = tempRects[0];
                }
                if (tempNode.parentNode) {
                    tempNode.parentNode.removeChild(tempNode);
                }
            } catch (err) {
                console.error("Caret calculation error:", err);
            }
        }

        // Fallback if still not determined
        if (!caretRect) {
            const computed = window.getComputedStyle(editor);
            const paddingLeft = parseFloat(computed.paddingLeft) || 0;
            const paddingTop = parseFloat(computed.paddingTop) || 0;
            const fontSize = parseFloat(computed.fontSize) || 14;
            
            caretRect = {
                left: editorRect.left + paddingLeft,
                top: editorRect.top + paddingTop,
                height: fontSize * 1.25
            };
        }

        if (caretRect) {
            const x = caretRect.left - editorRect.left;
            const y = caretRect.top - editorRect.top;
            const h = caretRect.height || 20;

            const currentText = editor.textContent || "";
            const prevText = prevTextRef.current || "";
            const prevX = prevXRef.current || 0;
            const prevY = prevYRef.current || 0;

            if (currentText === prevText && x === prevX && y === prevY && editorCaretOpacity.get() > 0) {
                return;
            }

            prevTextRef.current = currentText;
            prevXRef.current = x;
            prevYRef.current = y;

            const isTyping = currentText.length === prevText.length + 1;

            activeAnimXRef.current?.stop();
            activeAnimYRef.current?.stop();

            if (isTyping) {
                activeAnimXRef.current = animate(editorCaretX, x, {
                    type: "spring",
                    stiffness: 600,
                    damping: 35,
                    mass: 0.4
                });
                activeAnimYRef.current = animate(editorCaretY, y, {
                    type: "spring",
                    stiffness: 600,
                    damping: 35,
                    mass: 0.4
                });
            } else {
                editorCaretX.set(x);
                editorCaretY.set(y);
            }

            setIsCaretActive(true);
            if (caretIdleTimeoutRef.current) clearTimeout(caretIdleTimeoutRef.current);
            caretIdleTimeoutRef.current = setTimeout(() => {
                setIsCaretActive(false);
            }, 500);

            editorCaretHeight.set(h);
            editorCaretOpacity.set(1);
        } else {
            editorCaretOpacity.set(0);
        }
    };

    useEffect(() => {
        const editor = inputRef.current;
        if (!editor) return;

        const handleSelectionChange = () => {
            if (document.activeElement === editor) {
                updateEditorCaret();
            }
        };

        const handleScroll = () => {
            updateEditorCaret();
        };

        document.addEventListener("selectionchange", handleSelectionChange);
        editor.addEventListener("scroll", handleScroll);

        return () => {
            document.removeEventListener("selectionchange", handleSelectionChange);
            editor.removeEventListener("scroll", handleScroll);
        };
    }, []);
    const [hdQuality, setHdQuality] = useState(false);
    const [captionText, setCaptionText] = useState("");
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [errorBanner, setErrorBanner] = useState(null);

    const [cameraOpen, setCameraOpen] = useState(false);
    const [capturedImage, setCapturedImage] = useState(null); // base64 string
    const [facingMode, setFacingMode] = useState("user"); // "user" or "environment"
    const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
    const videoRef = useRef(null);
    const streamRef = useRef(null);

    // Enumerate devices to check if front/back or multiple cameras are available
    useEffect(() => {
        if (typeof navigator !== "undefined" && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
            navigator.mediaDevices.enumerateDevices()
                .then(devices => {
                    const videoDevices = devices.filter(d => d.kind === "videoinput");
                    setHasMultipleCameras(videoDevices.length > 1);
                })
                .catch(err => {
                    console.error("Error enumerating devices:", err);
                });
        }
    }, [cameraOpen]);

    useEffect(() => {
        if (cameraOpen && !capturedImage) {
            let activeStream = null;
            const initCamera = async () => {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ 
                        video: { 
                            width: { ideal: 1920 }, 
                            height: { ideal: 1080 },
                            facingMode: facingMode 
                        } 
                    });
                    activeStream = stream;
                    streamRef.current = stream;
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                    }
                } catch (err) {
                    console.error("Error accessing camera:", err);
                    setErrorBanner("Could not access camera. Please check permissions.");
                    setTimeout(() => setErrorBanner(null), 5000);
                    setCameraOpen(false);
                }
            };
            const timeoutId = setTimeout(initCamera, 100);
            return () => {
                clearTimeout(timeoutId);
                if (activeStream) {
                    activeStream.getTracks().forEach(t => t.stop());
                }
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(t => t.stop());
                    streamRef.current = null;
                }
            };
        }
    }, [cameraOpen, capturedImage, facingMode]);

    const capturePhoto = () => {
        if (!videoRef.current) return;
        const video = videoRef.current;
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
        setCapturedImage(dataUrl);
    };

    const useCapturedPhoto = () => {
        if (!capturedImage) return;
        
        const arr = capturedImage.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while(n--){
            u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });
        const file = new File([blob], `camera_${Date.now()}.jpg`, { type: mime });

        const fileObj = {
            file,
            previewUrl: URL.createObjectURL(file),
            name: file.name,
            size: file.size,
            type: file.type
        };

        setSelectedFiles([fileObj]);
        setActivePreviewIndex(0);
        setPreviewModalOpen(true);
        setHdQuality(false);
        setCaptionText("");
        
        setCameraOpen(false);
        setCapturedImage(null);
    };

    const closeCamera = () => {
        setCameraOpen(false);
        setCapturedImage(null);
        setFacingMode("user");
    };

    const [isEditingImage, setIsEditingImage] = useState(false);
    const [editorImageSrc, setEditorImageSrc] = useState("");
    const [cropBox, setCropBox] = useState({ x: 0, y: 0, w: 100, h: 100 });
    const [isDraggingHandle, setIsDraggingHandle] = useState(null);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0, crop: null });
    const imageRef = useRef(null);

    const startImageEditor = () => {
        const activeFile = selectedFiles[activePreviewIndex];
        if (activeFile && activeFile.type.startsWith("image/")) {
            setEditorImageSrc(activeFile.previewUrl);
            setCropBox({ x: 0, y: 0, w: 100, h: 100 }); // Start with full image crop box
            setIsEditingImage(true);
        }
    };

    const handleCancelEditor = () => {
        setIsEditingImage(false);
    };

    const rotateImage90Degrees = (srcUrl) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = srcUrl;
            img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = img.height;
                canvas.height = img.width;
                
                const ctx = canvas.getContext("2d");
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate(90 * Math.PI / 180);
                ctx.drawImage(img, -img.width / 2, -img.height / 2);
                
                canvas.toBlob((blob) => {
                    if (blob) {
                        const newUrl = URL.createObjectURL(blob);
                        resolve({ blob, url: newUrl });
                    } else {
                        resolve(null);
                    }
                }, "image/jpeg", 0.95);
            };
        });
    };

    const handleRotate = async () => {
        const result = await rotateImage90Degrees(editorImageSrc);
        if (result) {
            setEditorImageSrc(result.url);
            setCropBox({ x: 0, y: 0, w: 100, h: 100 }); // Reset crop box to full image on rotation
        }
    };

    const handleDragStart = (handle, e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        setIsDraggingHandle(handle);
        setDragStart({
            x: clientX,
            y: clientY,
            crop: { ...cropBox }
        });
    };

    useEffect(() => {
        if (!isDraggingHandle) return;

        const onMove = (e) => {
            if (!imageRef.current) return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            const deltaX = clientX - dragStart.x;
            const deltaY = clientY - dragStart.y;

            const rect = imageRef.current.getBoundingClientRect();
            const pctDeltaX = (deltaX / rect.width) * 100;
            const pctDeltaY = (deltaY / rect.height) * 100;

            let newX = dragStart.crop.x;
            let newY = dragStart.crop.y;
            let newW = dragStart.crop.w;
            let newH = dragStart.crop.h;

            const minSize = 15; // Minimum size 15%

            if (isDraggingHandle === "move") {
                newX = Math.max(0, Math.min(100 - dragStart.crop.w, dragStart.crop.x + pctDeltaX));
                newY = Math.max(0, Math.min(100 - dragStart.crop.h, dragStart.crop.y + pctDeltaY));
            } else {
                if (isDraggingHandle.includes("w")) {
                    const proposedX = dragStart.crop.x + pctDeltaX;
                    const proposedW = dragStart.crop.w - pctDeltaX;
                    if (proposedX >= 0 && proposedW >= minSize) {
                        newX = proposedX;
                        newW = proposedW;
                    }
                }
                if (isDraggingHandle.includes("e")) {
                    const proposedW = dragStart.crop.w + pctDeltaX;
                    if (proposedW >= minSize && dragStart.crop.x + proposedW <= 100) {
                        newW = proposedW;
                    }
                }
                if (isDraggingHandle.includes("n")) {
                    const proposedY = dragStart.crop.y + pctDeltaY;
                    const proposedH = dragStart.crop.h - pctDeltaY;
                    if (proposedY >= 0 && proposedH >= minSize) {
                        newY = proposedY;
                        newH = proposedH;
                    }
                }
                if (isDraggingHandle.includes("s")) {
                    const proposedH = dragStart.crop.h + pctDeltaY;
                    if (proposedH >= minSize && dragStart.crop.y + proposedH <= 100) {
                        newH = proposedH;
                    }
                }
            }

            setCropBox({ x: newX, y: newY, w: newW, h: newH });
        };

        const onUp = () => {
            setIsDraggingHandle(null);
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        window.addEventListener("touchmove", onMove, { passive: false });
        window.addEventListener("touchend", onUp);

        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            window.removeEventListener("touchmove", onMove);
            window.removeEventListener("touchend", onUp);
        };
    }, [isDraggingHandle, dragStart]);

    const applyCrop = () => {
        if (!imageRef.current) return;
        
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = editorImageSrc;
        img.onload = () => {
            const canvas = document.createElement("canvas");
            const cropX = (cropBox.x / 100) * img.width;
            const cropY = (cropBox.y / 100) * img.height;
            const cropW = (cropBox.w / 100) * img.width;
            const cropH = (cropBox.h / 100) * img.height;
            
            canvas.width = cropW;
            canvas.height = cropH;
            
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
            
            canvas.toBlob((blob) => {
                if (blob) {
                    const newFile = new File([blob], `edited_${Date.now()}.jpg`, { type: "image/jpeg" });
                    
                    // Update selectedFiles at activePreviewIndex
                    setSelectedFiles(prev => {
                        const updated = [...prev];
                        const oldObj = updated[activePreviewIndex];
                        if (oldObj.previewUrl && !oldObj.previewUrl.startsWith("data:")) {
                            URL.revokeObjectURL(oldObj.previewUrl);
                        }
                        updated[activePreviewIndex] = {
                            file: newFile,
                            previewUrl: URL.createObjectURL(newFile),
                            name: newFile.name,
                            size: newFile.size,
                            type: newFile.type
                        };
                        return updated;
                    });
                    
                    setIsEditingImage(false);
                }
            }, "image/jpeg", 0.95);
        };
    };

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

    const handleSendSticker = async (sticker) => {
        setStickerPickerOpen(false);
        if (activePrivate) {
            if (sticker.isCustom) {
                try {
                    const stickerUrl = sticker.url.startsWith("http") ? sticker.url : `${getBackendUrl()}${sticker.url}`;
                    const blobRes = await fetch(stickerUrl);
                    const stickerBlob = await blobRes.blob();

                    await sodium.ready;
                    const fileKey = sodium.crypto_secretbox_keygen();
                    const fileNonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);

                    const arrayBuffer = await stickerBlob.arrayBuffer();
                    const stickerBytes = new Uint8Array(arrayBuffer);
                    const encryptedBytes = sodium.crypto_secretbox_easy(stickerBytes, fileNonce, fileKey);
                    const encryptedBlob = new Blob([encryptedBytes], { type: 'application/octet-stream' });

                    const formData = new FormData();
                    formData.append("file", encryptedBlob, `sticker_${Date.now()}.enc`);
                    const uploadRes = await fetch(`${getBackendUrl()}/api/upload`, {
                        method: "POST",
                        body: formData
                    });
                    if (!uploadRes.ok) throw new Error("Upload failed");
                    const uploadData = await uploadRes.json();
                    const fileId = uploadData.fileUrl.split("/").pop();

                    sendMessage({
                        overrideText: "Sent a custom E2EE sticker",
                        sticker: {
                            fileId: fileId,
                            fileKey: sodium.to_base64(fileKey),
                            nonce: sodium.to_base64(fileNonce),
                            isCustom: true,
                            packId: sticker.packId || `custom_${username.toLowerCase()}`,
                            stickerId: sticker.stickerId
                        }
                    });
                } catch (err) {
                    console.error("Failed to encrypt and send custom sticker:", err);
                    alert("Failed to send custom sticker.");
                }
            } else {
                sendMessage({
                    overrideText: "Sent a sticker",
                    sticker: {
                        url: sticker.url,
                        packId: sticker.packId,
                        stickerId: sticker.stickerId,
                        isCustom: false
                    }
                });
            }
        } else {
            sendMessage({
                overrideText: "Sent a sticker",
                sticker: {
                    url: sticker.url,
                    packId: sticker.packId,
                    stickerId: sticker.stickerId,
                    isCustom: sticker.isCustom || false
                }
            });
        }
    };

    const getAuthToken = () => {
        let token = sessionStorage.getItem("token") || localStorage.getItem("token");
        if (!token) {
            const guestProfileStr = localStorage.getItem("guestProfile");
            if (guestProfileStr) {
                try {
                    const profile = JSON.parse(guestProfileStr);
                    if (profile && profile.username) {
                        token = `guest:${profile.username}`;
                        sessionStorage.setItem("token", token);
                    }
                } catch (e) {
                    console.error(e);
                }
            }
        }
        return token;
    };

    const addStickerToFavorites = (stickerObj) => {
        try {
            const storedFavs = localStorage.getItem("nexus_favorite_stickers");
            let favs = [];
            if (storedFavs) {
                favs = JSON.parse(storedFavs);
            }
            if (!favs.some(f => f.stickerId === stickerObj.stickerId)) {
                favs = [stickerObj, ...favs];
                localStorage.setItem("nexus_favorite_stickers", JSON.stringify(favs));
            }
        } catch (e) {
            console.error("Failed to add sticker to favorites:", e);
        }
    };

    const handleSendCustomSticker = async (stickerBlob) => {
        setStickerCreatorOpen(false);
        if (activePrivate) {
            try {
                await sodium.ready;
                const fileKey = sodium.crypto_secretbox_keygen();
                const fileNonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);

                const arrayBuffer = await stickerBlob.arrayBuffer();
                const stickerBytes = new Uint8Array(arrayBuffer);
                const encryptedBytes = sodium.crypto_secretbox_easy(stickerBytes, fileNonce, fileKey);
                const encryptedBlob = new Blob([encryptedBytes], { type: 'application/octet-stream' });

                const formData = new FormData();
                formData.append("file", encryptedBlob, `sticker_${Date.now()}.enc`);
                const uploadRes = await fetch(`${getBackendUrl()}/api/upload`, {
                    method: "POST",
                    body: formData
                });
                if (!uploadRes.ok) throw new Error("Upload failed");
                const uploadData = await uploadRes.json();
                const fileId = uploadData.fileUrl.split("/").pop();

                const stickerObj = {
                    fileId: fileId,
                    fileKey: sodium.to_base64(fileKey),
                    nonce: sodium.to_base64(fileNonce),
                    isCustom: true,
                    packId: `custom_${username.toLowerCase()}`,
                    stickerId: `sticker_${Date.now()}`
                };

                sendMessage({
                    overrideText: "Sent a custom E2EE sticker",
                    sticker: stickerObj
                });

                // Save unencrypted copy to their custom pack and favorites in background
                try {
                    const token = getAuthToken();
                    const saveFormData = new FormData();
                    saveFormData.append("file", stickerBlob, `custom_${Date.now()}.webp`);
                    fetch(`${getBackendUrl()}/api/stickers/custom`, {
                        method: "POST",
                        headers: { "Authorization": `Bearer ${token}` },
                        body: saveFormData
                    }).then(async (res) => {
                        if (res.ok) {
                            const data = await res.json();
                            addStickerToFavorites({
                                url: data.sticker.url,
                                packId: data.pack.packId,
                                stickerId: data.sticker.stickerId,
                                isCustom: true
                            });
                        }
                    });
                } catch (err) {
                    console.error("Failed to automatically save unencrypted E2EE custom sticker to favorites:", err);
                }
            } catch (err) {
                console.error("Failed to encrypt and send custom sticker:", err);
                alert("Failed to send custom sticker.");
            }
        } else {
            try {
                const token = getAuthToken();
                const formData = new FormData();
                formData.append("file", stickerBlob, `custom_${Date.now()}.webp`);
                const res = await fetch(`${getBackendUrl()}/api/stickers/custom`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${token}` },
                    body: formData
                });
                if (res.ok) {
                    const data = await res.json();
                    const stickerObj = {
                        url: data.sticker.url,
                        packId: data.pack.packId,
                        stickerId: data.sticker.stickerId,
                        isCustom: true
                    };
                    addStickerToFavorites(stickerObj);
                    sendMessage({
                        overrideText: "Sent a custom sticker",
                        sticker: stickerObj
                    });
                } else {
                    alert("Failed to upload sticker.");
                }
            } catch (err) {
                console.error("Error sending custom sticker:", err);
            }
        }
    };

    const handleSaveCustomSticker = async (stickerBlob) => {
        setStickerCreatorOpen(false);
        try {
            const token = getAuthToken();
            const formData = new FormData();
            formData.append("file", stickerBlob, `custom_${Date.now()}.webp`);
            const res = await fetch(`${getBackendUrl()}/api/stickers/custom`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` },
                body: formData
            });
            if (res.ok) {
                const data = await res.json();
                const stickerObj = {
                    url: data.sticker.url,
                    packId: data.pack.packId,
                    stickerId: data.sticker.stickerId,
                    isCustom: true
                };
                addStickerToFavorites(stickerObj);
                setStickerPickerDefaultPack(data.pack.packId);
                setStickerPickerOpen(true);
            } else {
                alert("Failed to save custom sticker.");
            }
        } catch (err) {
            console.error("Error saving custom sticker:", err);
            alert("Error saving custom sticker.");
        }
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

    const handlePaste = (e) => {
        const files = Array.from(e.clipboardData?.files || []);
        if (files.length === 0) return;

        // Prevent default paste to prevent contentEditable formatting corruption
        e.preventDefault();

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
        const input = inputRef.current;
        if (!input) return;

        const selection = window.getSelection();
        const isSelectionInsideInput = selection.rangeCount > 0 && input.contains(selection.anchorNode);

        if (!isSelectionInsideInput) {
            input.focus();
            const range = document.createRange();
            range.selectNodeContents(input);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
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

        input.focus();
        handleInput();
    }

    useEffect(() => {
        const input = inputRef.current;
        if (!input) return;
        
        const currentMarkdown = getMarkdownFromHtml(input.innerHTML);
        let updated = false;
        if (!message) {
            if (input.innerHTML !== "") {
                input.innerHTML = "";
                updated = true;
            }
        } else if (currentMarkdown !== message) {
            input.innerHTML = markdownToHtml(message);
            updated = true;
        }

        if (updated) {
            setTimeout(() => {
                if (document.activeElement === input) {
                    const range = document.createRange();
                    const sel = window.getSelection();
                    range.selectNodeContents(input);
                    range.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
                updateEditorCaret();
            }, 0);
        }
    }, [message]);

    const isReadOnlyRoom = activeRoom === "Nexus Official" && username !== "Siddh";

    if (isReadOnlyRoom) {
        return (
            <div className="input-area composer-readonly-banner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '78px', padding: '14px 28px 18px', gap: '10px', fontSize: '14px', color: 'var(--muted)', fontWeight: '500' }}>
                <Lock size={16} style={{ color: 'var(--accent)', marginRight: '4px' }} />
                <span>Only the administrator can post messages in this channel.</span>
            </div>
        );
    }

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
                            <SmoothInput 
                                type="text"
                                placeholder="Link display text..."
                                value={linkText}
                                onChange={(e) => setLinkText(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <div className="modal-form-group">
                            <label>URL</label>
                            <SmoothInput 
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
                    <Plus size={20} />
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
                        <button type="button" className="popover-item" onClick={() => { setCameraOpen(true); setAttachmentMenuOpen(false); }}>
                            <div className="popover-icon-wrapper pink-bg">
                                <Camera size={18} />
                            </div>
                            <span>Camera</span>
                        </button>
                        <button type="button" className="popover-item" onClick={() => { setStickerPickerOpen(true); setAttachmentMenuOpen(false); }}>
                            <div className="popover-icon-wrapper yellow-bg">
                                <Smile size={18} />
                            </div>
                            <span>New sticker</span>
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
                    <Smile size={20} />
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

                <div style={{ position: "relative", flex: 1, display: "flex", borderRadius: "24px", overflow: "hidden" }}>
                    {/* SLASH COMMANDS MENU OVERLAY */}
                    {showSlashMenu && filteredCommands.length > 0 && (
                        <div className="slash-commands-popover" style={{
                            position: "absolute",
                            bottom: "100%",
                            left: "12px",
                            marginBottom: "8px",
                            width: "280px",
                            background: "var(--panel, #ffffff)",
                            border: "1px solid var(--border)",
                            borderRadius: "12px",
                            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                            zIndex: 1000,
                            overflow: "hidden",
                            display: "flex",
                            flexDirection: "column"
                        }}>
                            <div style={{ padding: "8px 12px", fontSize: "10px", fontWeight: "bold", color: "var(--accent)", borderBottom: "1px solid var(--border)", textTransform: "uppercase" }}>
                                Commands list
                            </div>
                            <div style={{ maxHeight: "180px", overflowY: "auto" }}>
                                {filteredCommands.map((cmd, idx) => {
                                    const isSelected = idx === activeCommandIndex;
                                    return (
                                        <div 
                                            key={cmd.name}
                                            onClick={() => selectSlashCommand(cmd)}
                                            onMouseEnter={() => setActiveCommandIndex(idx)}
                                            style={{
                                                padding: "8px 14px",
                                                cursor: "pointer",
                                                background: isSelected ? "var(--soft, rgba(0,0,0,0.03))" : "transparent",
                                                borderLeft: isSelected ? "3px solid var(--accent)" : "3px solid transparent",
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: "2px",
                                                transition: "background 0.15s"
                                            }}
                                        >
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                <span style={{ fontWeight: "bold", fontSize: "12px", color: isSelected ? "var(--accent)" : "var(--text)" }}>{cmd.name}</span>
                                                <span style={{ fontSize: "8.5px", opacity: 0.5, color: "var(--muted)" }}>{cmd.usage}</span>
                                            </div>
                                            <span style={{ fontSize: "9.5px", color: "var(--muted)", opacity: 0.8 }}>{cmd.desc}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    <div
                        ref={inputRef}
                        className="composer-textarea-editable"
                        contentEditable="true"
                        data-placeholder={isEditing ? "Edit your message..." : "Type a message..."}
                        onPaste={handlePaste}
                        onInput={() => {
                            handleInput();
                            updateEditorCaret();
                        }}
                        onKeyUp={(e) => {
                            updateActiveStyles(e);
                            updateEditorCaret();
                        }}
                        onMouseUp={(e) => {
                            updateActiveStyles(e);
                            updateEditorCaret();
                        }}
                        onFocus={(e) => {
                            setIsFocused(true);
                            setIsCaretActive(false);
                            updateActiveStyles(e);
                            updateEditorCaret();
                        }}
                        onBlur={() => {
                            setIsFocused(false);
                            if (caretIdleTimeoutRef.current) clearTimeout(caretIdleTimeoutRef.current);
                            setActiveStyles([]);
                            editorCaretOpacity.set(0);
                        }}
                        onKeyDown={(e) => {
                             if (showSlashMenu && filteredCommands.length > 0) {
                                 if (e.key === "ArrowDown") {
                                     e.preventDefault();
                                     setActiveCommandIndex(prev => (prev + 1) % filteredCommands.length);
                                     return;
                                 } else if (e.key === "ArrowUp") {
                                     e.preventDefault();
                                     setActiveCommandIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
                                     return;
                                 } else if (e.key === "Enter" || e.key === "Tab") {
                                     e.preventDefault();
                                     selectSlashCommand(filteredCommands[activeCommandIndex]);
                                     return;
                                 } else if (e.key === "Escape") {
                                     e.preventDefault();
                                     setShowSlashMenu(false);
                                     return;
                                 }
                             }
                             
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
                    <motion.div
                        className={isFocused && !isCaretActive ? "caret-blink" : ""}
                        style={{
                            x: editorCaretX,
                            y: editorCaretY,
                            opacity: editorCaretOpacity,
                            height: editorCaretHeight,
                            position: "absolute",
                            pointerEvents: "none",
                            width: "2.5px",
                            backgroundColor: "var(--accent, currentColor)",
                            left: 0,
                            top: 0,
                            borderRadius: "999px",
                            boxShadow: "0 0 8px var(--accent)",
                            zIndex: 10
                        }}
                    />
                </div>
                <div className="voice-recorder-wrapper" style={{ marginRight: '8px' }}>
                    <VoiceRecorder 
                        onVoiceMessageReady={onVoiceMessageSend} 
                        onRecordingStart={onRecordingStart}
                        onRecordingStop={onRecordingStop}
                    />
                </div>
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
                        {isEditingImage ? (
                            <>
                                {/* Editor Header */}
                                <div className="preview-header">
                                    <span className="editor-mode-title">Adjust Image</span>
                                    <div className="editor-mode-header-spacer" />
                                </div>

                                {/* Editor Body */}
                                <div className="preview-body editor-mode">
                                    <div className="editor-media-wrapper" style={{ position: "relative", display: "inline-block", maxWidth: "100%", margin: "0 auto" }}>
                                        <img 
                                            ref={imageRef} 
                                            src={editorImageSrc} 
                                            alt="Editor viewport" 
                                            className="preview-img-element"
                                            style={{ display: "block", maxWidth: "100%", maxHeight: "calc(100vh - 280px)", objectFit: "contain" }}
                                            draggable={false}
                                        />
                                        
                                        {/* Crop Box Overlay */}
                                        <div className="crop-overlay-container" style={{ position: "absolute", inset: 0, userSelect: "none" }}>
                                            {/* Semi-transparent shades */}
                                            <div className="crop-shade top" style={{ position: "absolute", left: 0, top: 0, width: "100%", height: `${cropBox.y}%`, background: "rgba(0, 0, 0, 0.65)" }} />
                                            <div className="crop-shade bottom" style={{ position: "absolute", left: 0, top: `${cropBox.y + cropBox.h}%`, width: "100%", height: `${100 - cropBox.y - cropBox.h}%`, background: "rgba(0, 0, 0, 0.65)" }} />
                                            <div className="crop-shade left" style={{ position: "absolute", left: 0, top: `${cropBox.y}%`, height: `${cropBox.h}%`, width: `${cropBox.x}%`, background: "rgba(0, 0, 0, 0.65)" }} />
                                            <div className="crop-shade right" style={{ position: "absolute", left: `${cropBox.x + cropBox.w}%`, top: `${cropBox.y}%`, height: `${cropBox.h}%`, width: `${100 - cropBox.x - cropBox.w}%`, background: "rgba(0, 0, 0, 0.65)" }} />

                                            {/* The Crop Area */}
                                            <div 
                                                className="crop-box" 
                                                style={{
                                                    position: "absolute",
                                                    left: `${cropBox.x}%`,
                                                    top: `${cropBox.y}%`,
                                                    width: `${cropBox.w}%`,
                                                    height: `${cropBox.h}%`,
                                                    border: "2px solid #ffffff",
                                                    cursor: "move"
                                                }}
                                                onMouseDown={(e) => handleDragStart("move", e)}
                                                onTouchStart={(e) => handleDragStart("move", e)}
                                            >
                                                {/* Corner Drag Handles */}
                                                <div className="crop-handle nw" style={{ position: "absolute", width: "12px", height: "12px", background: "#ffffff", border: "2px solid var(--accent)", borderRadius: "50%", zIndex: 10, top: "-7px", left: "-7px", cursor: "nwse-resize" }} onMouseDown={(e) => handleDragStart("nw", e)} onTouchStart={(e) => handleDragStart("nw", e)} />
                                                <div className="crop-handle ne" style={{ position: "absolute", width: "12px", height: "12px", background: "#ffffff", border: "2px solid var(--accent)", borderRadius: "50%", zIndex: 10, top: "-7px", right: "-7px", cursor: "nesw-resize" }} onMouseDown={(e) => handleDragStart("ne", e)} onTouchStart={(e) => handleDragStart("ne", e)} />
                                                <div className="crop-handle sw" style={{ position: "absolute", width: "12px", height: "12px", background: "#ffffff", border: "2px solid var(--accent)", borderRadius: "50%", zIndex: 10, bottom: "-7px", left: "-7px", cursor: "nesw-resize" }} onMouseDown={(e) => handleDragStart("sw", e)} onTouchStart={(e) => handleDragStart("sw", e)} />
                                                <div className="crop-handle se" style={{ position: "absolute", width: "12px", height: "12px", background: "#ffffff", border: "2px solid var(--accent)", borderRadius: "50%", zIndex: 10, bottom: "-7px", right: "-7px", cursor: "nwse-resize" }} onMouseDown={(e) => handleDragStart("se", e)} onTouchStart={(e) => handleDragStart("se", e)} />
                                                
                                                {/* Internal Grid Lines */}
                                                <div className="crop-grid-line h1" style={{ position: "absolute", left: 0, right: 0, top: "33.33%", height: "1px", background: "rgba(255, 255, 255, 0.35)", pointerEvents: "none" }} />
                                                <div className="crop-grid-line h2" style={{ position: "absolute", left: 0, right: 0, top: "66.66%", height: "1px", background: "rgba(255, 255, 255, 0.35)", pointerEvents: "none" }} />
                                                <div className="crop-grid-line v1" style={{ position: "absolute", top: 0, bottom: 0, left: "33.33%", width: "1px", background: "rgba(255, 255, 255, 0.35)", pointerEvents: "none" }} />
                                                <div className="crop-grid-line v2" style={{ position: "absolute", top: 0, bottom: 0, left: "66.66%", width: "1px", background: "rgba(255, 255, 255, 0.35)", pointerEvents: "none" }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Editor Footer */}
                                <div className="preview-footer">
                                    <div className="editor-controls-row">
                                        <button 
                                            type="button" 
                                            className="editor-btn secondary" 
                                            onClick={handleCancelEditor}
                                        >
                                            Cancel
                                        </button>
                                        <button 
                                            type="button" 
                                            className="editor-btn secondary"
                                            onClick={() => setCropBox({ x: 0, y: 0, w: 100, h: 100 })}
                                        >
                                            Reset
                                        </button>
                                        <button 
                                            type="button" 
                                            className="editor-btn rotate-btn" 
                                            onClick={handleRotate}
                                            title="Rotate 90 degrees"
                                        >
                                            <RefreshCw size={14} />
                                            Rotate
                                        </button>
                                        <button 
                                            type="button" 
                                            className="editor-btn primary" 
                                            onClick={applyCrop}
                                        >
                                            Done
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                {/* Normal Header */}
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

                                    <div className="preview-header-actions-tray" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                        {/* Edit image button */}
                                        {selectedFiles[activePreviewIndex]?.type.startsWith("image/") && (
                                            <button
                                                type="button"
                                                className="preview-edit-btn"
                                                onClick={startImageEditor}
                                                title="Crop / Rotate Image"
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "6px",
                                                    background: "rgba(255,255,255,0.06)",
                                                    border: "1px solid rgba(255,255,255,0.15)",
                                                    borderRadius: "20px",
                                                    padding: "4px 12px",
                                                    cursor: "pointer",
                                                    color: "#cbd5e1",
                                                    fontWeight: "700",
                                                    fontSize: "11px",
                                                    transition: "all 0.2s ease"
                                                }}
                                            >
                                                <Crop size={14} />
                                                <span>Adjust</span>
                                            </button>
                                        )}

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
                                </div>

                                {/* Normal Body */}
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

                                {/* Normal Footer */}
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
                                            <SmoothInput 
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
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* CAMERA MODAL */}
            {cameraOpen && (
                <div className="camera-modal-overlay">
                    <div className="camera-modal-content">
                        {/* Camera Header */}
                        <div className="camera-header">
                            <span className="camera-title">Capture Photo</span>
                            <button 
                                type="button" 
                                className="camera-close-btn" 
                                onClick={closeCamera}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Viewport Area */}
                        <div className="camera-viewport-container">
                            {!capturedImage ? (
                                <div className="camera-video-wrapper">
                                    <video 
                                        ref={videoRef} 
                                        autoPlay 
                                        playsInline 
                                        className="camera-video-element"
                                    />
                                </div>
                            ) : (
                                <div className="camera-preview-wrapper">
                                    <img 
                                        src={capturedImage} 
                                        alt="Captured preview" 
                                        className="camera-preview-image"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Actions Area */}
                        <div className="camera-actions-container">
                            {!capturedImage ? (
                                <div className="camera-capture-controls">
                                    {hasMultipleCameras && (
                                        <button 
                                            type="button" 
                                            className="camera-control-btn flip-btn"
                                            onClick={() => setFacingMode(prev => prev === "user" ? "environment" : "user")}
                                            title="Switch Camera"
                                        >
                                            <RefreshCw size={20} />
                                        </button>
                                    )}
                                    <button 
                                        type="button" 
                                        className="camera-shutter-btn" 
                                        onClick={capturePhoto}
                                        title="Capture Photo"
                                    >
                                        <div className="camera-shutter-inner" />
                                    </button>
                                    {hasMultipleCameras && <div className="camera-spacer" />}
                                </div>
                            ) : (
                                <div className="camera-confirm-controls">
                                    <button 
                                        type="button" 
                                        className="camera-action-btn retake" 
                                        onClick={() => setCapturedImage(null)}
                                    >
                                        Retake
                                    </button>
                                    <button 
                                        type="button" 
                                        className="camera-action-btn accept" 
                                        onClick={useCapturedPhoto}
                                    >
                                        Use Photo
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* STICKER PICKER OVERLAY */}
            {stickerPickerOpen && (
                <StickerPicker
                    initialPackId={stickerPickerDefaultPack}
                    onSelectSticker={handleSendSticker}
                    onCreateNewClick={() => {
                        setStickerCreatorOpen(true);
                        setStickerPickerOpen(false);
                    }}
                    onClose={() => setStickerPickerOpen(false)}
                />
            )}

            {/* STICKER CREATOR MODAL */}
            {stickerCreatorOpen && (
                <StickerCreator
                    onSendSticker={handleSendCustomSticker}
                    onSaveSticker={handleSaveCustomSticker}
                    onClose={() => setStickerCreatorOpen(false)}
                />
            )}
        </div>
    );
}

export default MessageInput;
