import { useNavigate } from 'react-router-dom';
import ParticleBackground from '../components/ParticleBackground';
import logo from '../assets/logo.png';
import './Landing.css';
import { SmoothInput } from '../components/SmoothInput';
import { useState, useEffect } from 'react';
import { HiOutlineChatBubbleLeftRight } from 'react-icons/hi2';
import { FiSun, FiMoon } from 'react-icons/fi';
import { getBackendUrl } from '../utils/config';
import { initTheme, toggleTheme } from '../utils/theme';

export default function Landing() {
  const navigate = useNavigate();

  const [typedText, setTypedText] = useState('');
  const [showContent, setShowContent] = useState(false);
  const [theme, setTheme] = useState('light');

  // Guest modal state
  const [showModal, setShowModal] = useState(false);
  const [guestUsername, setGuestUsername] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setTheme(initTheme());
  }, []);

  function handleThemeToggle() {
    setTheme(toggleTheme());
  }

  const fullText =
    'Connect instantly with the next-gen\nmessaging platform';

  useEffect(() => {
    let index = 0;

    const timer = setInterval(() => {
      if (index < fullText.length) {
        setTypedText(fullText.slice(0, index + 1));
        index++;
      } else {
        clearInterval(timer);

        setTimeout(() => {
          setShowContent(true);
        }, 500);
      }
    }, 50);

    return () => clearInterval(timer);
  }, []);

  const trimmedUsername = guestUsername.trim();
  const isInputValid = trimmedUsername.length >= 3 && 
                       trimmedUsername.length <= 20 && 
                       /^[A-Za-z0-9_]+$/.test(trimmedUsername);

  async function handleJoinChat(e) {
    if (e) e.preventDefault();
    if (!isInputValid || loading) return;

    const BANNED_WORDS = ["admin", "system", "moderator", "guest", "banned", "support", "staff"];
    if (BANNED_WORDS.includes(trimmedUsername.toLowerCase())) {
      setErrorMsg("This username is reserved or not allowed. Please choose another.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const response = await fetch(`${getBackendUrl()}/api/auth/check-username`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmedUsername })
      });
      const data = await response.json();

      if (data.reserved) {
        setErrorMsg("This username is reserved by a registered user. Please choose another username.");
        setLoading(false);
        return;
      }

      // Create temporary guest profile
      const guestId = "guest_" + Math.random().toString(36).substr(2, 9);
      const guestProfile = {
        username: trimmedUsername,
        isGuest: true,
        guestId
      };

      // Save guest info in localStorage and token in sessionStorage
      localStorage.setItem("guestProfile", JSON.stringify(guestProfile));
      sessionStorage.setItem("token", `guest:${trimmedUsername}`);

      setLoading(false);
      setShowModal(false);
      navigate("/chat");
    } catch (err) {
      console.error(err);
      setErrorMsg("Connection error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="landing-container">

      {/* Antigravity-style particle background */}
      {showContent && <ParticleBackground />}

      {/* ── Top nav ───────────────────────────────────────── */}
      <header className="landing-nav">

        {/* Left — logo + brand */}
        <div className="nav-brand">
          <img src={logo} alt="Nexus logo" className="nav-logo-img" />
          <span className="nav-brand-name"><span className="nexus-word">Nexus</span> Messenger</span>
        </div>

        {/* Right — auth buttons */}
        <div className={`nav-actions ${showContent ? 'show' : ''}`}>
          <button className="theme-toggle-btn" onClick={handleThemeToggle} aria-label="Toggle theme" style={{ marginRight: '8px' }}>
            {theme === 'dark' ? <FiSun /> : <FiMoon />}
          </button>
          <button className="nav-sign-in" onClick={() => navigate('/login')}>
            Sign In
          </button>
          <button className="nav-sign-up" onClick={() => navigate('/register')}>
            Sign Up
          </button>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────── */}
      <main className="landing-hero">

        {/* Small logo + brand label above headline */}
        <div className={`hero-brand ${showContent ? 'show' : ''}`}>
          <img src={logo} alt="" className="hero-logo-img" aria-hidden="true" />
          <span className="hero-brand-name"><span className="nexus-word">Nexus</span> Messenger</span>
        </div>      

        <h1 className="landing-headline typing-headline">
          {typedText}
          {!showContent && <span className="cursor">|</span>}
        </h1>

        {showContent && (
          <div className="hero-buttons">
            <button
              className="hero-chat-btn"
              onClick={() => {
                const existingToken = sessionStorage.getItem("token") || localStorage.getItem("token");
                if (existingToken && !existingToken.startsWith("guest:")) {
                  navigate('/chat');
                  return;
                }

                // Check for saved guest profile
                const guestProfileStr = localStorage.getItem("guestProfile");
                if (guestProfileStr) {
                  try {
                    const profile = JSON.parse(guestProfileStr);
                    if (profile && profile.username) {
                      sessionStorage.setItem("token", `guest:${profile.username}`);
                      navigate('/chat');
                      return;
                    }
                  } catch (e) {
                    console.error(e);
                  }
                }

                // Show selection modal
                setShowModal(true);
              }}
            >
              <HiOutlineChatBubbleLeftRight/>
              General Chat
            </button>

            <button
              className="hero-secondary-btn"
              onClick={() => navigate('/features')}
            >
              Explore Features
            </button>
          </div>
        )}
      </main>

      {/* Username Selection Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => { if (!loading) setShowModal(false); }}>
          <div className="modal-content landing-guest-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-section">
              <h3>Choose Guest Username</h3>
            </div>
            <form onSubmit={handleJoinChat}>
              <div className="modal-body-section">
                <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>
                  Choose a username to enter the General Chat as a guest.
                </p>
                <div className="guest-input-wrap">
                  <SmoothInput
                    type="text"
                    placeholder="Enter your username"
                    value={guestUsername}
                    onChange={(e) => {
                      setGuestUsername(e.target.value);
                      setErrorMsg("");
                    }}
                    autoFocus
                    maxLength={20}
                    disabled={loading}
                    className="guest-username-input"
                  />
                  <small style={{ display: 'block', marginTop: '6px', color: 'var(--muted)', fontSize: '11px' }}>
                    3–20 characters. Letters, numbers, and underscores only.
                  </small>
                </div>
                {errorMsg && (
                  <div className="guest-error-alert">
                    {errorMsg}
                  </div>
                )}
              </div>
              <div className="modal-footer-buttons">
                <button
                  type="submit"
                  className="modal-btn primary"
                  disabled={!isInputValid || loading}
                >
                  {loading ? "Checking..." : "Join Chat"}
                </button>
                <button
                  type="button"
                  className="modal-btn cancel"
                  onClick={() => {
                    setShowModal(false);
                    setErrorMsg("");
                  }}
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}