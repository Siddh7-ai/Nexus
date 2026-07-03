import React, { createContext, useContext, useState, useEffect } from "react";

const ThemeContext = createContext();

export const accentColors = {
    teal: { name: "Teal", accent: "#12c7bd", deep: "#0f9f98", soft: "#dff8f5", rgb: "18, 199, 189" },
    blue: { name: "Blue", accent: "#3b82f6", deep: "#2563eb", soft: "#eff6ff", rgb: "59, 130, 246" },
    violet: { name: "Violet", accent: "#8b5cf6", deep: "#7c3aed", soft: "#f5f3ff", rgb: "139, 92, 246" },
    amber: { name: "Amber", accent: "#f59e0b", deep: "#d97706", soft: "#fffbeb", rgb: "245, 158, 11" },
    emerald: { name: "Emerald", accent: "#10b981", deep: "#059669", soft: "#ecfdf5", rgb: "16, 185, 129" },
    rose: { name: "Rose", accent: "#f43f5e", deep: "#e11d48", soft: "#fff1f2", rgb: "244, 63, 94" }
};

export const ThemeProvider = ({ children }) => {
    const [theme, setThemeState] = useState(() => {
        return localStorage.getItem("theme") || "light";
    });

    const [accentColor, setAccentColorState] = useState(() => {
        return localStorage.getItem("nexus_accent_color") || "teal";
    });

    const [soundEnabled, setSoundEnabledState] = useState(() => {
        const val = localStorage.getItem("nexus_sound_enabled");
        return val !== "false"; // default to true
    });

    // Handle initial load and theme state persistence
    useEffect(() => {
        localStorage.setItem("theme", theme);
        if (theme === "dark") {
            document.body.classList.add("dark-theme");
        } else {
            document.body.classList.remove("dark-theme");
        }
    }, [theme]);

    // Handle accent color injection
    useEffect(() => {
        localStorage.setItem("nexus_accent_color", accentColor);
        const palette = accentColors[accentColor] || accentColors.teal;
        
        // Inject root variables
        document.documentElement.style.setProperty("--accent", palette.accent);
        document.documentElement.style.setProperty("--accent-deep", palette.deep);
        document.documentElement.style.setProperty("--accent-soft", palette.soft);
        document.documentElement.style.setProperty("--accent-rgb", palette.rgb);
    }, [accentColor]);

    const setAccentColor = (color) => {
        if (accentColors[color]) {
            setAccentColorState(color);
        }
    };

    const toggleTheme = () => {
        setThemeState(prev => (prev === "dark" ? "light" : "dark"));
    };

    const setSoundEnabled = (enabled) => {
        localStorage.setItem("nexus_sound_enabled", enabled ? "true" : "false");
        setSoundEnabledState(enabled);
    };

    return (
        <ThemeContext.Provider value={{
            theme,
            setTheme: setThemeState,
            toggleTheme,
            accentColor,
            setAccentColor,
            soundEnabled,
            setSoundEnabled
        }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
};
