import React, { useState, useEffect, useRef } from "react";
import { FiSearch, FiBriefcase, FiGrid, FiMessageSquare, FiSettings, FiCheck, FiChevronRight, FiVolume2, FiVolumeX, FiMoon, FiSun } from "react-icons/fi";
import { useTheme } from "../context/ThemeContext";

export default function CommandPalette({ 
    isOpen, 
    onClose, 
    setActiveSidebarTab, 
    setSelectedNexTask,
    rooms = [],
    activeTab,
    setActiveTab
}) {
    const { theme, toggleTheme, accentColor, setAccentColor, soundEnabled, setSoundEnabled } = useTheme();
    const [search, setSearch] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef(null);
    const resultsRef = useRef(null);

    // Focus input on open
    useEffect(() => {
        if (isOpen) {
            setSearch("");
            setActiveIndex(0);
            setTimeout(() => inputRef.current?.focus(), 80);
        }
    }, [isOpen]);

    // Build the list of available commands
    const getCommands = () => {
        const list = [
            {
                id: "tab-board",
                category: "Navigation",
                title: "Switch to Kanban Task Board",
                subtitle: "Manage your tasks and columns",
                icon: <FiBriefcase />,
                action: () => {
                    setActiveSidebarTab("nextask");
                    setActiveTab("board");
                }
            },
            {
                id: "tab-timeline",
                category: "Navigation",
                title: "Switch to Gantt Timeline View",
                subtitle: "Visualize task durations on a schedule",
                icon: <FiGrid />,
                action: () => {
                    setActiveSidebarTab("nextask");
                    setActiveTab("timeline");
                }
            },
            {
                id: "tab-bot",
                category: "Navigation",
                title: "Switch to NexTask AI Chat Bot",
                subtitle: "Automate task management using chat",
                icon: <FiMessageSquare />,
                action: () => {
                    setActiveSidebarTab("nextask");
                    setActiveTab("bot");
                }
            },
            {
                id: "board-personal",
                category: "NexTask Board",
                title: "Open Personal NexTask Board",
                subtitle: "Go to your private task space",
                icon: <FiBriefcase style={{ color: "#3b82f6" }} />,
                action: () => {
                    setActiveSidebarTab("nextask");
                    setSelectedNexTask("personal");
                }
            },
            {
                id: "theme-toggle",
                category: "Aesthetics",
                title: `Switch Theme to ${theme === "dark" ? "Light" : "Dark"} Mode`,
                subtitle: `Toggle visual theme (Current: ${theme})`,
                icon: theme === "dark" ? <FiSun /> : <FiMoon />,
                action: () => toggleTheme()
            },
            {
                id: "sound-toggle",
                category: "Configuration",
                title: `Toggle Sound Effects (${soundEnabled ? "Mute" : "Unmute"})`,
                subtitle: `Pop effects on sending and completing`,
                icon: soundEnabled ? <FiVolumeX /> : <FiVolume2 />,
                action: () => setSoundEnabled(!soundEnabled)
            },
            {
                id: "accent-teal",
                category: "Accent Color",
                title: "Set Accent Color to Teal",
                subtitle: "Default color scheme",
                icon: <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#12c7bd', display: 'inline-block' }} />,
                action: () => setAccentColor("teal")
            },
            {
                id: "accent-blue",
                category: "Accent Color",
                title: "Set Accent Color to Blue",
                subtitle: "Cool blue color scheme",
                icon: <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} />,
                action: () => setAccentColor("blue")
            },
            {
                id: "accent-violet",
                category: "Accent Color",
                title: "Set Accent Color to Violet",
                subtitle: "Vibrant violet theme style",
                icon: <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#8b5cf6', display: 'inline-block' }} />,
                action: () => setAccentColor("violet")
            },
            {
                id: "accent-amber",
                category: "Accent Color",
                title: "Set Accent Color to Amber",
                subtitle: "Warm amber gold aesthetic",
                icon: <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />,
                action: () => setAccentColor("amber")
            },
            {
                id: "accent-emerald",
                category: "Accent Color",
                title: "Set Accent Color to Emerald",
                subtitle: "Fresh emerald green look",
                icon: <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />,
                action: () => setAccentColor("emerald")
            },
            {
                id: "accent-rose",
                category: "Accent Color",
                title: "Set Accent Color to Rose",
                subtitle: "Elegant rose pink colorway",
                icon: <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#f43f5e', display: 'inline-block' }} />,
                action: () => setAccentColor("rose")
            }
        ];

        // Add rooms dynamically
        rooms.forEach(room => {
            list.push({
                id: `board-room-${room._id}`,
                category: "Rooms NexTask",
                title: `Open ${room.name} Task Board`,
                subtitle: `Collaborate in room ${room.name}`,
                icon: <FiBriefcase style={{ color: "#10b981" }} />,
                action: () => {
                    setActiveSidebarTab("nextask");
                    setSelectedNexTask(room._id);
                }
            });
        });

        // Filter commands based on search
        return list.filter(cmd => 
            cmd.title.toLowerCase().includes(search.toLowerCase()) ||
            cmd.category.toLowerCase().includes(search.toLowerCase()) ||
            (cmd.subtitle && cmd.subtitle.toLowerCase().includes(search.toLowerCase()))
        );
    };

    const commands = getCommands();

    // Handle Keyboard Events
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e) => {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex(prev => (prev + 1) % Math.max(1, commands.length));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex(prev => (prev - 1 + commands.length) % Math.max(1, commands.length));
            } else if (e.key === "Enter") {
                e.preventDefault();
                if (commands[activeIndex]) {
                    commands[activeIndex].action();
                    onClose();
                }
            } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, activeIndex, commands]);

    // Keep active item in view inside scrollable area
    useEffect(() => {
        const activeEl = resultsRef.current?.children[activeIndex];
        if (activeEl) {
            activeEl.scrollIntoView({ block: "nearest" });
        }
    }, [activeIndex]);

    if (!isOpen) return null;

    return (
        <div 
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(15, 23, 42, 0.45)',
                backdropFilter: 'blur(4px)',
                zIndex: 20000,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                paddingTop: '10vh'
            }}
            onClick={onClose}
        >
            <div 
                style={{
                    width: '100%',
                    maxWidth: '560px',
                    background: 'var(--panel, #ffffff)',
                    border: '1px solid var(--border)',
                    borderRadius: '16px',
                    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '450px',
                    animation: 'zoomInUp 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Search Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '16px',
                    borderBottom: '1px solid var(--border)',
                    gap: '12px'
                }}>
                    <FiSearch size={20} style={{ color: 'var(--muted)', opacity: 0.7 }} />
                    <input 
                        ref={inputRef}
                        type="text"
                        placeholder="Type a command or search board..."
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setActiveIndex(0);
                        }}
                        style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text)',
                            fontSize: '16px',
                            fontWeight: '600',
                            outline: 'none'
                        }}
                    />
                    <span style={{
                        fontSize: '10px',
                        background: 'var(--border)',
                        color: 'var(--muted)',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        letterSpacing: '0.5px'
                    }}>ESC</span>
                </div>

                {/* Results List */}
                <div 
                    ref={resultsRef}
                    style={{
                        overflowY: 'auto',
                        padding: '8px 0',
                        flex: 1
                    }}
                >
                    {commands.length === 0 ? (
                        <div style={{
                            padding: '32px',
                            textAlign: 'center',
                            color: 'var(--muted)',
                            fontSize: '13px'
                        }}>No commands found matching "{search}"</div>
                    ) : (
                        commands.map((cmd, index) => {
                            const isActive = index === activeIndex;
                            return (
                                <div 
                                    key={cmd.id}
                                    onClick={() => {
                                        cmd.action();
                                        onClose();
                                    }}
                                    onMouseEnter={() => setActiveIndex(index)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '12px 18px',
                                        cursor: 'pointer',
                                        background: isActive ? 'var(--soft, rgba(0, 0, 0, 0.04))' : 'transparent',
                                        transition: 'background 0.15s ease',
                                        borderLeft: isActive ? '4px solid var(--accent)' : '4px solid transparent',
                                        gap: '14px'
                                    }}
                                >
                                    <div style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '8px',
                                        background: isActive ? 'var(--accent-soft)' : 'var(--border)',
                                        color: isActive ? 'var(--accent)' : 'var(--text)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '16px',
                                        transition: 'all 0.15s ease'
                                    }}>
                                        {cmd.icon}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <span style={{
                                            fontWeight: 'bold',
                                            fontSize: '13.5px',
                                            color: 'var(--text)',
                                            display: 'block'
                                        }}>{cmd.title}</span>
                                        {cmd.subtitle && (
                                            <span style={{
                                                fontSize: '10.5px',
                                                color: 'var(--muted)',
                                                opacity: 0.8,
                                                display: 'block',
                                                marginTop: '2px'
                                            }}>{cmd.subtitle}</span>
                                        )}
                                    </div>
                                    <span style={{
                                        fontSize: '9px',
                                        textTransform: 'uppercase',
                                        fontWeight: 'bold',
                                        color: 'var(--accent)',
                                        opacity: isActive ? 1 : 0.4,
                                        background: isActive ? 'var(--accent-soft)' : 'transparent',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        letterSpacing: '0.5px'
                                    }}>{cmd.category}</span>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer instructions */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 16px',
                    borderTop: '1px solid var(--border)',
                    background: 'var(--soft, rgba(0,0,0,0.01))',
                    fontSize: '10.5px',
                    color: 'var(--muted)'
                }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <span>↑↓ to navigate</span>
                        <span>ENTER to select</span>
                    </div>
                    <span>Press Ctrl+K at any time</span>
                </div>
            </div>
        </div>
    );
}
