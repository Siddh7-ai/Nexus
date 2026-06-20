import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  FiActivity,
  FiArchive,
  FiCpu,
  FiFile,
  FiLock,
  FiMoon,
  FiRadio,
  FiSearch,
  FiShield,
  FiSun,
  FiType,
  FiUser,
  FiVideo
} from "react-icons/fi";
import logo from "../assets/logo.png";
import "./Features.css";
import ThemeToggleButton from "../components/ThemeToggleButton";
import { initTheme, toggleTheme } from "../utils/theme";

const FEATURES = [
  { title: "Real-Time Messaging", icon: FiRadio, status: "Live", tone: "green" },
  { title: "Private Messaging", icon: FiLock, status: "Live", tone: "green" },
  { title: "Smart Chat Rooms", icon: FiArchive, status: "Live", tone: "green" },
  { title: "Typing Indicators", icon: FiType, status: "Live", tone: "green" },
  { title: "Online Presence", icon: FiActivity, status: "Live", tone: "green" },
  { title: "Secure Auth", icon: FiShield, status: "Live", tone: "green" },
  { title: "Smart User Profiles", icon: FiUser, status: "Live", tone: "green" },
  { title: "Universal Search", icon: FiSearch, status: "Soon", tone: "blue" },
  { title: "File Sharing", icon: FiFile, status: "Soon", tone: "blue" },
  { title: "Dark Mode", icon: FiMoon, status: "Live", tone: "green" },
  { title: "AI Assistant", icon: FiCpu, status: "Soon", tone: "blue" },
  { title: "Video Calling", icon: FiVideo, status: "Soon", tone: "blue" }
];

export default function Features() {
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    setTheme(initTheme());
  }, []);

  function handleThemeToggle() {
    setTheme(toggleTheme());
  }
  // Pre-initialize the revealed state to match the screenshot layout:
  // Card 01 (index 0), Card 07 (index 6), and Card 12 (index 11) are not revealed.
  // The rest (1, 2, 3, 4, 5, 7, 8, 9, 10) are revealed.
  const [revealed, setRevealed] = useState(() => new Set([1, 2, 3, 4, 5, 7, 8, 9, 10]));
  const revealedCount = revealed.size;

  const featureCards = useMemo(() => FEATURES.map((feature, index) => ({
    ...feature,
    number: String(index + 1).padStart(2, "0")
  })), []);

  function toggleCard(index) {
    setRevealed(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function revealAll() {
    setRevealed(new Set(featureCards.map((_, index) => index)));
  }

  function resetAll() {
    setRevealed(new Set());
  }

  return (
    <main className="features-page">
      <section className="features-hero">
        <nav className="features-nav">
          <Link to="/" className="features-brand">
            <img src={logo} alt="Nexus logo" />
            <span><strong>Nexus</strong> Messenger</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <ThemeToggleButton theme={theme} onToggle={handleThemeToggle} className="theme-toggle-btn" />
            <Link to="/chat" className="features-nav-link">Open chat</Link>
          </div>
        </nav>

        <div className="features-kicker">
          <span></span>
          Nexus Messenger
        </div>

        <div className="features-hero-grid">
          <div>
            <h1>
              Explore<br />
              our <span className="highlight">features</span>
            </h1>
          </div>

          <div className="features-count">
            <strong>{FEATURES.length}</strong>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <i className="features-live-dot" />
              Features live
            </span>
          </div>
        </div>
      </section>

      <section className="reveal-section">
        <div className="reveal-header">
          <div>
            <p>Discover every feature</p>
            <h2>Click to <span>reveal</span></h2>
          </div>
          <div className="reveal-progress">
            <span>{revealedCount}/{FEATURES.length}</span>
            <small>cards revealed</small>
          </div>
        </div>

        <div className="feature-grid-container">
          <div className="feature-card-grid">
            {featureCards.map((feature, index) => {
              const Icon = feature.icon;
              const isRevealed = revealed.has(index);

              return (
                <button
                  key={feature.title}
                  className={`feature-flip-card ${isRevealed ? "revealed" : ""}`}
                  onClick={() => toggleCard(index)}
                >
                  <span className="feature-card-face feature-card-back">
                    {feature.number}
                  </span>
                  <span className="feature-card-face feature-card-front">
                    <span className="card-bg-number">{feature.number}</span>
                    <Icon aria-hidden="true" />
                    <div className="feature-card-info">
                      <strong>{feature.title}</strong>
                      <em className={`feature-status ${feature.tone}`}>
                        {feature.tone === "green" && <i className="status-dot green" />}
                        {feature.status}
                      </em>
                    </div>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="reveal-actions">
          <button onClick={revealAll}>Reveal all</button>
          <button onClick={resetAll}>Reset</button>
        </div>
      </section>
    </main>
  );
}

