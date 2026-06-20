import { motion } from "framer-motion";

export function ThemeToggleIcon({ theme, className = "", style = {} }) {
  const isDark = theme === "dark";
  
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      fill="currentColor"
      strokeLinecap="round"
      viewBox="0 0 32 32"
      className={className}
      style={{
        width: "1.2em",
        height: "1.2em",
        display: "inline-block",
        verticalAlign: "middle",
        ...style
      }}
    >
      <clipPath id="theme-toggle-clip-path">
        <motion.path
          animate={{ y: isDark ? 14 : 0, x: isDark ? -11 : 0 }}
          transition={{ ease: "easeInOut", duration: 0.35 }}
          d="M0-11h25a1 1 0 0017 13v30H0Z"
        />
      </clipPath>
      <g clipPath="url(#theme-toggle-clip-path)">
        <motion.circle
          animate={{ r: isDark ? 10 : 8 }}
          transition={{ ease: "easeInOut", duration: 0.35 }}
          cx="16"
          cy="16"
        />
        <motion.g
          animate={{
            scale: isDark ? 0.5 : 1,
            opacity: isDark ? 0 : 1,
          }}
          transition={{ ease: "easeInOut", duration: 0.35 }}
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M18.3 3.2c0 1.3-1 2.3-2.3 2.3s-2.3-1-2.3-2.3S14.7.9 16 .9s2.3 1 2.3 2.3zm-4.6 25.6c0-1.3 1-2.3 2.3-2.3s2.3 1 2.3 2.3-1 2.3-2.3 2.3-2.3-1-2.3-2.3zm15.1-10.5c-1.3 0-2.3-1-2.3-2.3s1-2.3 2.3-2.3 2.3 1 2.3 2.3-1 2.3-2.3 2.3zM3.2 13.7c1.3 0 2.3 1 2.3 2.3s-1 2.3-2.3 2.3S.9 17.3.9 16s1-2.3 2.3-2.3zm5.8-7C9 7.9 7.9 9 6.7 9S4.4 8 4.4 6.7s1-2.3 2.3-2.3S9 5.4 9 6.7zm16.3 21c-1.3 0-2.3-1-2.3-2.3s1-2.3 2.3-2.3 2.3 1 2.3 2.3-1 2.3-2.3 2.3zm2.4-21c0 1.3-1 2.3-2.3 2.3S23 7.9 23 6.7s1-2.3 2.3-2.3 2.4 1 2.4 2.3zM6.7 23C8 23 9 24 9 25.3s-1 2.3-2.3 2.3-2.3-1-2.3-2.3 1-2.3 2.3-2.3z" />
        </motion.g>
      </g>
    </svg>
  );
}

export default function ThemeToggleButton({ theme, onToggle, className = "", style = {} }) {
  return (
    <button
      type="button"
      className={className}
      onClick={onToggle}
      aria-label="Toggle Theme"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        ...style
      }}
    >
      <ThemeToggleIcon theme={theme} />
    </button>
  );
}
