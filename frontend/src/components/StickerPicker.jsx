import React, { useState, useEffect, useRef } from "react";
import { Search, Star, Plus, Trash2, Heart, Clock } from "lucide-react";
import { getBackendUrl } from "../utils/config";

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

const StickerImage = ({ stickerUrl, alt, ...props }) => {
    const [src, setSrc] = useState(stickerUrl);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        setSrc(stickerUrl);
        setHasError(false);
    }, [stickerUrl]);

    const handleError = () => {
        if (!hasError && stickerUrl && stickerUrl.includes("notoemoji")) {
            setHasError(true);
            const parts = stickerUrl.split("/");
            const hex = parts[parts.length - 2];
            if (hex) {
                setSrc(`https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${hex}.svg`);
            }
        }
    };

    return <img src={src} alt={alt} onError={handleError} {...props} />;
};

function StickerPicker({ onSelectSticker, onCreateNewClick, onClose, initialPackId = "funny" }) {
    const [packs, setPacks] = useState([]);
    const [activePackId, setActivePackId] = useState(initialPackId);
    const [searchQuery, setSearchQuery] = useState("");
    const [stickers, setStickers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [favorites, setFavorites] = useState([]);
    const [recents, setRecents] = useState([]);
    const [contextMenu, setContextMenu] = useState(null); // { x, y, sticker }
    const pickerRef = useRef(null);

    // Fetch packs on mount
    useEffect(() => {
        const fetchPacks = async () => {
            try {
                const token = getAuthToken();
                const res = await fetch(`${getBackendUrl()}/api/stickers/packs`, {
                    headers: { "Authorization": `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setPacks(data);
                }
            } catch (err) {
                console.error("Error fetching sticker packs:", err);
            }
        };
        fetchPacks();

        // Load favorites and recents from localStorage
        const storedFavs = localStorage.getItem("nexus_favorite_stickers");
        if (storedFavs) {
            try { setFavorites(JSON.parse(storedFavs)); } catch(e) {}
        }
        const storedRecents = localStorage.getItem("nexus_recent_stickers");
        if (storedRecents) {
            try { setRecents(JSON.parse(storedRecents)); } catch(e) {}
        }
    }, []);

    // Load stickers when activePackId changes
    useEffect(() => {
        if (activePackId === "recents") {
            setStickers(recents);
            return;
        }
        if (activePackId === "favorites") {
            setStickers(favorites);
            return;
        }

        const fetchStickers = async () => {
            setLoading(true);
            try {
                const token = getAuthToken();
                const res = await fetch(`${getBackendUrl()}/api/stickers/pack/${activePackId}`, {
                    headers: { "Authorization": `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setStickers(data);
                }
            } catch (err) {
                console.error("Error fetching stickers:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchStickers();
    }, [activePackId, recents, favorites]);

    // Close when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (pickerRef.current && !pickerRef.current.contains(event.target)) {
                onClose();
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [onClose]);

    // Search filter
    const getFilteredStickers = () => {
        if (!searchQuery.trim()) return stickers;

        const query = searchQuery.toLowerCase().trim();
        
        // Define tags mapping for system packs
        const packTags = {
            funny: ["funny", "laugh", "joke", "clown", "emoji", "smile", "🤣", "😂"],
            love: ["love", "heart", "kiss", "romance", "hug", "relationship", "❤️", "😍"],
            celebrate: ["celebrate", "party", "birthday", "cake", "cupcake", "gift", "🎉"],
            mood: ["mood", "angry", "sad", "cry", "sleep", "tired", "screaming", "😤"],
            thanks: ["thanks", "thank you", "please", "pray", "respect", "hands", "🙏"],
            greetings: ["greetings", "hello", "hi", "wave", "morning", "sun", "👋"],
            animals: ["animals", "dog", "cat", "fox", "bear", "frog", "panda", "koala", "🐶"],
            aesthetic: ["aesthetic", "sparkles", "star", "magic", "rainbow", "moon", "✨"]
        };

        // If searching across all packs, search through all packs
        // But if they search, we search the active pack's stickers first or all system stickers.
        // Let's filter the current visible list first, or return from matched packs
        return stickers.filter(sticker => {
            const packId = sticker.packId || activePackId;
            const tags = packTags[packId] || [];
            return (
                packId.toLowerCase().includes(query) ||
                tags.some(t => t.includes(query)) ||
                (sticker.stickerId && sticker.stickerId.toLowerCase().includes(query))
            );
        });
    };

    const handleSelectSticker = (sticker) => {
        // Build the correct sticker object format
        const stickerObj = {
            url: sticker.url,
            packId: sticker.packId || activePackId,
            stickerId: sticker.stickerId,
            isCustom: activePackId.startsWith("custom") || sticker.isCustom || false,
            createdBy: sticker.createdBy || null
        };

        // Update recents
        let updatedRecents = [stickerObj, ...recents.filter(s => s.stickerId !== sticker.stickerId)];
        if (updatedRecents.length > 20) {
            updatedRecents = updatedRecents.slice(0, 20);
        }
        setRecents(updatedRecents);
        localStorage.setItem("nexus_recent_stickers", JSON.stringify(updatedRecents));

        onSelectSticker(stickerObj);
    };

    // Right click / Long press handler
    const handleContextMenu = (e, sticker) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            sticker
        });
    };

    const closeContextMenu = () => {
        setContextMenu(null);
    };

    useEffect(() => {
        window.addEventListener("click", closeContextMenu);
        return () => window.removeEventListener("click", closeContextMenu);
    }, []);

    const toggleFavorite = (sticker) => {
        const isFav = favorites.some(s => s.stickerId === sticker.stickerId);
        let updated;
        if (isFav) {
            updated = favorites.filter(s => s.stickerId !== sticker.stickerId);
        } else {
            const stickerObj = {
                url: sticker.url,
                packId: sticker.packId || activePackId,
                stickerId: sticker.stickerId,
                isCustom: activePackId.startsWith("custom") || sticker.isCustom || false,
                createdBy: sticker.createdBy || null
            };
            updated = [stickerObj, ...favorites];
        }
        setFavorites(updated);
        localStorage.setItem("nexus_favorite_stickers", JSON.stringify(updated));
    };

    const deleteCustomSticker = async (sticker) => {
        if (!window.confirm("Are you sure you want to delete this custom sticker?")) return;
        try {
            const token = getAuthToken();
            const res = await fetch(`${getBackendUrl()}/api/stickers/custom/${sticker.stickerId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) {
                // Remove from visible stickers list
                setStickers(prev => prev.filter(s => s.stickerId !== sticker.stickerId));
                // Remove from recents and favorites
                const updatedFavs = favorites.filter(s => s.stickerId !== sticker.stickerId);
                setFavorites(updatedFavs);
                localStorage.setItem("nexus_favorite_stickers", JSON.stringify(updatedFavs));

                const updatedRecents = recents.filter(s => s.stickerId !== sticker.stickerId);
                setRecents(updatedRecents);
                localStorage.setItem("nexus_recent_stickers", JSON.stringify(updatedRecents));
            } else {
                alert("Failed to delete sticker.");
            }
        } catch (err) {
            console.error("Error deleting custom sticker:", err);
            alert("Error deleting sticker.");
        }
    };

    const filteredStickers = getFilteredStickers();

    return (
        <div className="sticker-picker-container" ref={pickerRef}>
            {/* Search */}
            <div className="sticker-picker-search">
                <Search size={16} className="search-icon" />
                <input
                    type="text"
                    placeholder="Search stickers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            {/* Pack Selector */}
            <div className="sticker-pack-selector">
                {/* Recents */}
                <button
                    type="button"
                    className={`pack-tab ${activePackId === "recents" ? "active" : ""}`}
                    onClick={() => setActivePackId("recents")}
                    title="Recently Used"
                >
                    🕒
                </button>
                {/* Favorites */}
                <button
                    type="button"
                    className={`pack-tab ${activePackId === "favorites" ? "active" : ""}`}
                    onClick={() => setActivePackId("favorites")}
                    title="Favorites"
                >
                    ⭐
                </button>

                {/* System & User packs */}
                {packs.map((pack) => (
                    <button
                        key={pack.packId}
                        type="button"
                        className={`pack-tab ${activePackId === pack.packId ? "active" : ""}`}
                        onClick={() => setActivePackId(pack.packId)}
                        title={pack.name}
                    >
                        {pack.emoji}
                    </button>
                ))}
            </div>

            {/* Sticker Grid */}
            <div className="sticker-grid-container">
                {loading ? (
                    <div className="sticker-picker-loader">Loading stickers...</div>
                ) : filteredStickers.length === 0 ? (
                    <div className="sticker-picker-empty">No stickers found</div>
                ) : (
                    <div className="sticker-grid">
                        {filteredStickers.map((sticker) => {
                            const isFav = favorites.some(s => s.stickerId === sticker.stickerId);
                            const isCustom = activePackId.startsWith("custom") || sticker.isCustom;
                            const stickerUrl = sticker.url.startsWith("http")
                                ? sticker.url
                                : `${getBackendUrl()}${sticker.url}`;

                            return (
                                <div
                                    key={sticker.stickerId}
                                    className="sticker-grid-item"
                                    onClick={() => handleSelectSticker(sticker)}
                                    onContextMenu={(e) => handleContextMenu(e, sticker)}
                                    title="Right-click for options"
                                >
                                     <StickerImage stickerUrl={stickerUrl} alt="Sticker" loading="lazy" />
                                    {isFav && <Heart size={10} className="sticker-fav-indicator" />}
                                    {isCustom && <span className="sticker-custom-badge">C</span>}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Bottom Actions */}
            <div className="sticker-picker-footer">
                <button type="button" className="footer-action-btn" onClick={() => setActivePackId("recents")}>
                    <Clock size={14} /> Recently Used
                </button>
                <button type="button" className="footer-action-btn create-btn" onClick={onCreateNewClick}>
                    <Plus size={14} /> Create New
                </button>
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="sticker-context-menu"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <button
                        type="button"
                        onClick={() => toggleFavorite(contextMenu.sticker)}
                    >
                        {favorites.some(s => s.stickerId === contextMenu.sticker.stickerId)
                            ? "Remove from Favorites"
                            : "Add to Favorites"}
                    </button>
                    {(activePackId.startsWith("custom") || contextMenu.sticker.isCustom) && (
                        <button
                            type="button"
                            className="delete-item"
                            onClick={() => deleteCustomSticker(contextMenu.sticker)}
                        >
                            <Trash2 size={12} /> Delete Sticker
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

export default StickerPicker;
