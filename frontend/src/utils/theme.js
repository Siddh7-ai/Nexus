export function initTheme() {
    const savedTheme = localStorage.getItem("theme");
    const savedBrightness = localStorage.getItem("themeBrightness") || "100";
    document.documentElement.style.setProperty("--theme-brightness", `${savedBrightness}%`);
    
    // Default to dark mode if user preferred, else default to light mode
    if (savedTheme === "dark") {
        document.body.classList.add("dark-theme");
        return "dark";
    } else {
        document.body.classList.remove("dark-theme");
        return "light";
    }
}

export function toggleTheme() {
    const currentTheme = localStorage.getItem("theme") || "light";
    const nextTheme = currentTheme === "light" ? "dark" : "light";
    localStorage.setItem("theme", nextTheme);
    if (nextTheme === "dark") {
        document.body.classList.add("dark-theme");
    } else {
        document.body.classList.remove("dark-theme");
    }
    return nextTheme;
}

export function setThemeBrightness(value) {
    localStorage.setItem("themeBrightness", value);
    document.documentElement.style.setProperty("--theme-brightness", `${value}%`);
}

