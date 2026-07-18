import { flushSync } from "react-dom";

const styleId = "theme-transition-styles";

function updateStyles(css, name) {
    if (typeof window === "undefined") return;
    let styleElement = document.getElementById(styleId);
    if (!styleElement) {
        styleElement = document.createElement("style");
        styleElement.id = styleId;
        document.head.appendChild(styleElement);
    }
    styleElement.textContent = css;
}

const getPositionCoords = (position) => {
    switch (position) {
        case "top-left":
            return { cx: "0", cy: "0" };
        case "top-right":
            return { cx: "40", cy: "0" };
        case "bottom-left":
            return { cx: "0", cy: "40" };
        case "bottom-right":
            return { cx: "40", cy: "40" };
        case "top-center":
            return { cx: "20", cy: "0" };
        case "bottom-center":
            return { cx: "20", cy: "40" };
        case "bottom-up":
        case "top-down":
        case "left-right":
        case "right-left":
        case "center":
        default:
            return { cx: "20", cy: "20" };
    }
};

const generateSVG = (variant, start) => {
    if (variant === "circle-blur") {
        if (start === "center") {
            return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><defs><filter id="blur"><feGaussianBlur stdDeviation="2"/></filter></defs><circle cx="20" cy="20" r="18" fill="white" filter="url(%23blur)"/></svg>`;
        }
        const { cx, cy } = getPositionCoords(start);
        return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><defs><filter id="blur"><feGaussianBlur stdDeviation="2"/></filter></defs><circle cx="${cx}" cy="${cy}" r="18" fill="white" filter="url(%23blur)"/></svg>`;
    }

    if (start === "center") return "";
    if (variant === "rectangle") return "";

    const { cx, cy } = getPositionCoords(start);
    if (variant === "circle") {
        return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="${cx}" cy="${cy}" r="20" fill="white"/></svg>`;
    }

    return "";
};

const getTransformOrigin = (start) => {
    switch (start) {
        case "top-left":
            return "top left";
        case "top-right":
            return "top right";
        case "bottom-left":
            return "bottom left";
        case "bottom-right":
            return "bottom right";
        case "top-center":
            return "top center";
        case "bottom-center":
            return "bottom center";
        case "bottom-up":
        case "top-down":
        case "left-right":
        case "right-left":
        case "center":
        default:
            return "center";
    }
};

export const createAnimation = (
    variant,
    start = "center",
    blur = false,
    url = "",
    clickEvent = null
) => {
    const svg = generateSVG(variant, start);
    const transformOrigin = getTransformOrigin(start);

    if (variant === "rectangle") {
        const getClipPath = (direction) => {
            switch (direction) {
                case "bottom-up":
                    return {
                        from: "polygon(0% 100%, 100% 100%, 100% 100%, 0% 100%)",
                        to: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
                    };
                case "top-down":
                    return {
                        from: "polygon(0% 0%, 100% 0%, 100% 0%, 0% 0%)",
                        to: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
                    };
                case "left-right":
                    return {
                        from: "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)",
                        to: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
                    };
                case "right-left":
                    return {
                        from: "polygon(100% 0%, 100% 0%, 100% 100%, 100% 100%)",
                        to: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
                    };
                case "top-left":
                    return {
                        from: "polygon(0% 0%, 0% 0%, 0% 0%, 0% 0%)",
                        to: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
                    };
                case "top-right":
                    return {
                        from: "polygon(100% 0%, 100% 0%, 100% 0%, 100% 0%)",
                        to: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
                    };
                case "bottom-left":
                    return {
                        from: "polygon(0% 100%, 0% 100%, 0% 100%, 0% 100%)",
                        to: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
                    };
                case "bottom-right":
                    return {
                        from: "polygon(100% 100%, 100% 100%, 100% 100%, 100% 100%)",
                        to: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
                    };
                default:
                    return {
                        from: "polygon(0% 100%, 100% 100%, 100% 100%, 0% 100%)",
                        to: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
                    };
            }
        };

        const clipPath = getClipPath(start);

        return {
            name: `${variant}-${start}${blur ? "-blur" : ""}`,
            css: `
            ::view-transition-group(root) {
                animation-duration: 0.3s;
                animation-timing-function: var(--expo-out);
            }
            
            ::view-transition-new(root) {
                animation-name: reveal-light-${start}${blur ? "-blur" : ""};
                animation-duration: inherit;
                animation-fill-mode: both;
                ${blur ? "filter: blur(2px);" : ""}
            }

            ::view-transition-old(root),
            .dark-theme::view-transition-old(root) {
                animation: none;
                z-index: -1;
            }
            .dark-theme::view-transition-new(root) {
                animation-name: reveal-dark-${start}${blur ? "-blur" : ""};
                animation-duration: inherit;
                animation-fill-mode: both;
                ${blur ? "filter: blur(2px);" : ""}
            }

            @keyframes reveal-dark-${start}${blur ? "-blur" : ""} {
                from {
                    clip-path: ${clipPath.from};
                    ${blur ? "filter: blur(8px);" : ""}
                }
                ${blur ? "50% { filter: blur(4px); }" : ""}
                to {
                    clip-path: ${clipPath.to};
                    ${blur ? "filter: blur(0px);" : ""}
                }
            }

            @keyframes reveal-light-${start}${blur ? "-blur" : ""} {
                from {
                    clip-path: ${clipPath.from};
                    ${blur ? "filter: blur(8px);" : ""}
                }
                ${blur ? "50% { filter: blur(4px); }" : ""}
                to {
                    clip-path: ${clipPath.to};
                    ${blur ? "filter: blur(0px);" : ""}
                }
            }
            `,
        };
    }

    if (variant === "gif") {
        return {
            name: `${variant}-${start}`,
            css: `
            ::view-transition-group(root) {
                animation-duration: 1.0s;
                animation-timing-function: var(--expo-in);
            }

            ::view-transition-new(root) {
                mask: url('${url}') center / 0 no-repeat;
                animation: scale-gif 1.0s both;
            }

            ::view-transition-old(root),
            .dark-theme::view-transition-old(root) {
                animation: scale-gif 1.0s both;
            }

            @keyframes scale-gif {
                0% {
                    mask-size: 0;
                }
                10% {
                    mask-size: 50vmax;
                }
                90% {
                    mask-size: 50vmax;
                }
                100% {
                    mask-size: 2000vmax;
                }
            }`,
        };
    }

    if (variant === "circle-blur") {
        if (start === "center") {
            return {
                name: `${variant}-${start}`,
                css: `
                ::view-transition-group(root) {
                    animation-duration: 0.4s;
                    animation-timing-function: var(--expo-out);
                }

                ::view-transition-new(root) {
                    mask: url('${svg}') center / 0 no-repeat;
                    mask-origin: content-box;
                    animation: scale-circle-blur 0.4s both;
                    transform-origin: center;
                }

                ::view-transition-old(root),
                .dark-theme::view-transition-old(root) {
                    animation: scale-circle-blur 0.4s both;
                    transform-origin: center;
                    z-index: -1;
                }

                @keyframes scale-circle-blur {
                    to {
                        mask-size: 350vmax;
                    }
                }
                `,
            };
        }

        return {
            name: `${variant}-${start}`,
            css: `
            ::view-transition-group(root) {
                animation-duration: 0.4s;
                animation-timing-function: var(--expo-out);
            }

            ::view-transition-new(root) {
                mask: url('${svg}') ${start.replace("-", " ")} / 0 no-repeat;
                mask-origin: content-box;
                animation: scale-circle-blur-${start} 0.4s both;
                transform-origin: ${transformOrigin};
            }

            ::view-transition-old(root),
            .dark-theme::view-transition-old(root) {
                animation: scale-circle-blur-${start} 0.4s both;
                transform-origin: ${transformOrigin};
                z-index: -1;
            }

            @keyframes scale-circle-blur-${start} {
                to {
                    mask-size: 350vmax;
                }
            }
            `,
        };
    }

    if (variant === "polygon") {
        const getPolygonClipPaths = (position) => {
            switch (position) {
                case "top-left":
                    return {
                        darkFrom: "polygon(50% -71%, -50% 71%, -50% 71%, 50% -71%)",
                        darkTo: "polygon(50% -71%, -50% 71%, 50% 171%, 171% 50%)",
                        lightFrom: "polygon(171% 50%, 50% 171%, 50% 171%, 171% 50%)",
                        lightTo: "polygon(171% 50%, 50% 171%, -50% 71%, 50% -71%)",
                    };
                case "top-right":
                    return {
                        darkFrom: "polygon(150% -71%, 250% 71%, 250% 71%, 150% -71%)",
                        darkTo: "polygon(150% -71%, 250% 71%, 50% 171%, -71% 50%)",
                        lightFrom: "polygon(-71% 50%, 50% 171%, 50% 171%, -71% 50%)",
                        lightTo: "polygon(-71% 50%, 50% 171%, 250% 71%, 150% -71%)",
                    };
                default:
                    // Default to top-left behavior
                    return {
                        darkFrom: "polygon(50% -71%, -50% 71%, -50% 71%, 50% -71%)",
                        darkTo: "polygon(50% -71%, -50% 71%, 50% 171%, 171% 50%)",
                        lightFrom: "polygon(171% 50%, 50% 171%, 50% 171%, 171% 50%)",
                        lightTo: "polygon(171% 50%, 50% 171%, -50% 71%, 50% -71%)",
                    };
            }
        };

        const clipPaths = getPolygonClipPaths(start);

        return {
            name: `${variant}-${start}${blur ? "-blur" : ""}`,
            css: `
            ::view-transition-group(root) {
                animation-duration: 0.3s;
                animation-timing-function: var(--expo-out);
            }
            
            ::view-transition-new(root) {
                animation-name: reveal-light-${start}${blur ? "-blur" : ""};
                animation-duration: inherit;
                animation-fill-mode: both;
                ${blur ? "filter: blur(2px);" : ""}
            }

            ::view-transition-old(root),
            .dark-theme::view-transition-old(root) {
                animation: none;
                z-index: -1;
            }
            .dark-theme::view-transition-new(root) {
                animation-name: reveal-dark-${start}${blur ? "-blur" : ""};
                animation-duration: inherit;
                animation-fill-mode: both;
                ${blur ? "filter: blur(2px);" : ""}
            }

            @keyframes reveal-dark-${start}${blur ? "-blur" : ""} {
                from {
                    clip-path: ${clipPaths.darkFrom};
                    ${blur ? "filter: blur(8px);" : ""}
                }
                ${blur ? "50% { filter: blur(4px); }" : ""}
                to {
                    clip-path: ${clipPaths.darkTo};
                    ${blur ? "filter: blur(0px);" : ""}
                }
            }

            @keyframes reveal-light-${start}${blur ? "-blur" : ""} {
                from {
                    clip-path: ${clipPaths.lightFrom};
                    ${blur ? "filter: blur(8px);" : ""}
                }
                ${blur ? "50% { filter: blur(4px); }" : ""}
                to {
                    clip-path: ${clipPaths.lightTo};
                    ${blur ? "filter: blur(0px);" : ""}
                }
            }
            `,
        };
    }

    // Default to circle transition
    let clipPosition = "50% 50%";
    let clipRadius = "150.0%";
    
    if (clickEvent && clickEvent.clientX !== undefined) {
        const x = clickEvent.clientX;
        const y = clickEvent.clientY;
        clipPosition = `${(x / window.innerWidth) * 100}% ${(y / window.innerHeight) * 100}%`;
        const w = window.innerWidth;
        const h = window.innerHeight;
        const maxDist = Math.max(
            Math.hypot(x, y),
            Math.hypot(w - x, y),
            Math.hypot(x, h - y),
            Math.hypot(w - x, h - y)
        );
        clipRadius = `${maxDist}px`;
    } else {
        switch (start) {
            case "top-left":
                clipPosition = "0% 0%";
                break;
            case "top-right":
                clipPosition = "100% 0%";
                break;
            case "bottom-left":
                clipPosition = "0% 100%";
                break;
            case "bottom-right":
                clipPosition = "100% 100%";
                break;
            case "top-center":
                clipPosition = "50% 0%";
                break;
            case "bottom-center":
                clipPosition = "50% 100%";
                break;
            default:
                clipPosition = "50% 50%";
                break;
        }
    }

    return {
        name: `${variant}-${start}${blur ? "-blur" : ""}`,
        css: `
        ::view-transition-group(root) {
            animation-duration: 0.3s;
            animation-timing-function: var(--expo-out);
        }
            
        ::view-transition-new(root) {
            animation-name: reveal-light-${start}${blur ? "-blur" : ""};
            animation-duration: inherit;
            animation-fill-mode: both;
            ${blur ? "filter: blur(2px);" : ""}
        }

        ::view-transition-old(root),
        .dark-theme::view-transition-old(root) {
            animation: none;
            z-index: -1;
        }
        .dark-theme::view-transition-new(root) {
            animation-name: reveal-dark-${start}${blur ? "-blur" : ""};
            animation-duration: inherit;
            animation-fill-mode: both;
            ${blur ? "filter: blur(2px);" : ""}
        }

        @keyframes reveal-dark-${start}${blur ? "-blur" : ""} {
            from {
                clip-path: circle(0% at ${clipPosition});
                ${blur ? "filter: blur(8px);" : ""}
            }
            ${blur ? "50% { filter: blur(4px); }" : ""}
            to {
                clip-path: circle(${clipRadius} at ${clipPosition});
                ${blur ? "filter: blur(0px);" : ""}
            }
        }

        @keyframes reveal-light-${start}${blur ? "-blur" : ""} {
            from {
                clip-path: circle(0% at ${clipPosition});
                ${blur ? "filter: blur(8px);" : ""}
            }
            ${blur ? "50% { filter: blur(4px); }" : ""}
            to {
                clip-path: circle(${clipRadius} at ${clipPosition});
                ${blur ? "filter: blur(0px);" : ""}
            }
        }
        `,
    };
};

export function initTheme() {
    const savedTheme = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = savedTheme === "dark" || (!savedTheme && prefersDark);
    
    const savedBrightness = localStorage.getItem("themeBrightness") || "100";
    document.documentElement.style.setProperty("--theme-brightness", `${savedBrightness}%`);
    
    if (isDark) {
        document.body.classList.add("dark-theme");
        document.documentElement.classList.add("dark-theme");
        return "dark";
    } else {
        document.body.classList.remove("dark-theme");
        document.documentElement.classList.remove("dark-theme");
        return "light";
    }
}

export function toggleTheme(clickEvent, updateStateFn) {
    const currentTheme = (document.body.classList.contains("dark-theme") || document.documentElement.classList.contains("dark-theme")) ? "dark" : "light";
    const nextTheme = currentTheme === "light" ? "dark" : "light";
    localStorage.setItem("theme", nextTheme);

    const switchTheme = () => {
        if (nextTheme === "dark") {
            document.body.classList.add("dark-theme");
            document.documentElement.classList.add("dark-theme");
        } else {
            document.body.classList.remove("dark-theme");
            document.documentElement.classList.remove("dark-theme");
        }
        if (updateStateFn) {
            updateStateFn(nextTheme);
        }
    };

    if (typeof window === "undefined" || !document.startViewTransition) {
        switchTheme();
        return nextTheme;
    }

    const variant = localStorage.getItem("theme-transition-variant") || "circle";
    const start = localStorage.getItem("theme-transition-start") || "center";
    const blur = localStorage.getItem("theme-transition-blur") === "true";
    const gifUrl = localStorage.getItem("theme-transition-gifUrl") || "https://media.giphy.com/media/KBbr4hHl9DSahKvInO/giphy.gif?cid=790b76112m5eeeydoe7et0cr3j3ekb1erunxozyshuhxx2vl&ep=v1_stickers_search&rid=giphy.gif&ct=s";

    const animation = createAnimation(variant, start, blur, gifUrl, clickEvent);
    updateStyles(animation.css, animation.name);

    document.startViewTransition(() => {
        if (updateStateFn) {
            flushSync(switchTheme);
        } else {
            switchTheme();
        }
    });

    return nextTheme;
}

export function setThemeBrightness(value) {
    localStorage.setItem("themeBrightness", value);
    document.documentElement.style.setProperty("--theme-brightness", `${value}%`);
}
