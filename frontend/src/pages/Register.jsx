import { useMemo, useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import "../App.css";
import { getBackendUrl } from "../utils/config";
import { SmoothInput } from "../components/SmoothInput";
import ThemeToggleButton from "../components/ThemeToggleButton";
import { initTheme, toggleTheme } from "../utils/theme";
import { FiArrowLeft } from "react-icons/fi";
import { generateAndStoreKeys } from "../utils/crypto/manager";

import logo from "../assets/logo.png";

function GoogleLogo() {
  return (
    <svg className="google-logo" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z" />
    </svg>
  );
}

function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState("light");
  const [errorMsg, setErrorMsg] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    setTheme(initTheme());
  }, []);

  function handleThemeToggle(e) {
    toggleTheme(e, setTheme);
  }

  // Password checklist rules
  const checks = useMemo(() => {
    return {
      length: password.length >= 8 && password.length <= 128,
      upper: /[A-Z]/.test(password),
      lower: /[a-z]/.test(password),
      number: /\d/.test(password),
      special: /[^A-Za-z0-9]/.test(password)
    };
  }, [password]);

  const isPasswordValid = useMemo(() => {
    return Object.values(checks).every(Boolean);
  }, [checks]);

  async function handleRegister() {
    setErrorMsg("");

    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedUsername || !trimmedEmail || !password) {
      setErrorMsg("Please fill in all fields.");
      return;
    }

    // Client-side username format check
    if (trimmedUsername.length < 3 || trimmedUsername.length > 20 || !/^[a-zA-Z0-9_.]+$/.test(trimmedUsername)) {
      setErrorMsg("Username must be 3-20 characters long and contain only letters, numbers, underscores (_), or periods (.).");
      return;
    }

    // Client-side email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }

    // Client-side password complexity check
    if (!isPasswordValid) {
      setErrorMsg("Please satisfy all password complexity rules.");
      return;
    }

    setLoading(true);

    try {
      // 1. Generate local E2EE keys, encrypt with derived master key, save to IndexedDB
      const bundle = await generateAndStoreKeys(password, trimmedUsername);

      // 2. Submit user details along with public prekey bundle
      const response = await fetch(
        `${getBackendUrl()}/api/auth/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: trimmedUsername,
            email: trimmedEmail,
            password,
            identityPublicKey: bundle.identityPublicKey,
            signedPrekey: bundle.signedPrekey,
            oneTimePrekeys: bundle.oneTimePrekeys,
            encryptedIdentityPrivateKey: bundle.encryptedIdentityPrivateKey,
            encryptedSignedPrekeyPrivateKey: bundle.encryptedSignedPrekeyPrivateKey,
            encryptedOneTimePrekeys: bundle.encryptedOneTimePrekeys
          })
        }
      );

      const data = await response.json();

      if (response.ok) {
        alert("Registration successful! Please check your email to verify your account before logging in.");
        navigate("/login");
      } else {
        setErrorMsg(data.message || "Registration failed.");
      }
    } catch (error) {
      console.log(error);
      setErrorMsg("Cannot connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrapper">
      <button 
        className="floating-back-btn" 
        onClick={() => navigate("/")} 
        aria-label="Back to landing page"
        title="Back to Home"
      >
        <FiArrowLeft />
      </button>
      <ThemeToggleButton theme={theme} onToggle={handleThemeToggle} className="floating-theme-toggle" />
      <div className="auth-pattern" aria-hidden="true" />
      <div className="auth-stage">
        <div className="auth-container">
          <div className="auth-logo-row">
            <img src={logo} alt="Nexus logo" className="auth-Nexus-logo" />
            <div>
              <h1>Nexus</h1>
              <p>Next-gen messaging platform</p>
            </div>
          </div>

          <div className="auth-heading">
            <h2>Create account</h2>
            <p>Join thousands of users</p>
          </div>

          {errorMsg && (
            <div style={{
              background: "rgba(239, 68, 68, 0.15)",
              color: "#ef4444",
              padding: "12px",
              borderRadius: "8px",
              fontSize: "13px",
              marginBottom: "16px",
              fontWeight: 500
            }}>
              {errorMsg}
            </div>
          )}

          <div className="auth-field">
            <label>Username</label>
            <div className="auth-input-wrap">
              <SmoothInput
                type="text"
                placeholder="Choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div className="auth-field">
            <label>Email</label>
            <div className="auth-input-wrap">
              <SmoothInput
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="auth-field">
            <label>Password</label>
            <div className="auth-input-wrap" style={{ position: "relative" }}>
              <SmoothInput
                type="password"
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRegister()}
              />
            </div>
            
            {/* Real-time rules list */}
            <div className="password-rules" style={{ margin: "16px 0", fontSize: "12px", color: "var(--muted)", textAlign: "left" }}>
              <div style={{ fontWeight: 600, marginBottom: "6px" }}>Password rules:</div>
              <div style={{ color: checks.length ? "var(--accent)" : "#ef4444", display: "flex", gap: "6px", alignItems: "center" }}>
                <span>{checks.length ? "✓" : "✗"}</span> Between 8 and 128 characters
              </div>
              <div style={{ color: checks.upper ? "var(--accent)" : "#ef4444", display: "flex", gap: "6px", alignItems: "center" }}>
                <span>{checks.upper ? "✓" : "✗"}</span> At least 1 uppercase letter (A-Z)
              </div>
              <div style={{ color: checks.lower ? "var(--accent)" : "#ef4444", display: "flex", gap: "6px", alignItems: "center" }}>
                <span>{checks.lower ? "✓" : "✗"}</span> At least 1 lowercase letter (a-z)
              </div>
              <div style={{ color: checks.number ? "var(--accent)" : "#ef4444", display: "flex", gap: "6px", alignItems: "center" }}>
                <span>{checks.number ? "✓" : "✗"}</span> At least 1 number (0-9)
              </div>
              <div style={{ color: checks.special ? "var(--accent)" : "#ef4444", display: "flex", gap: "6px", alignItems: "center" }}>
                <span>{checks.special ? "✓" : "✗"}</span> At least 1 special character (e.g. !@#$)
              </div>
            </div>
          </div>

          <button className="auth-btn" onClick={handleRegister} disabled={loading || !isPasswordValid}>
            {loading ? "Registering..." : "Create account"}
          </button>

          <div className="auth-divider"><span>or continue with</span></div>

          <button 
            className="auth-google-btn" 
            type="button"
            onClick={() => alert("Google Sign-In is coming soon!")}
          >
            <GoogleLogo />
            Continue with Google
          </button>

          <div className="auth-link">
            Already have an account? <Link to="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Register;
