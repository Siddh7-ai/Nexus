import { useMemo, useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import "../App.css";
import { getBackendUrl } from "../utils/config";
import { SmoothInput } from "../components/SmoothInput";
import ThemeToggleButton from "../components/ThemeToggleButton";
import { initTheme, toggleTheme } from "../utils/theme";
import { FiArrowLeft, FiEye, FiEyeOff } from "react-icons/fi";
import { generateAndStoreKeys } from "../utils/crypto/manager";

import logo from "../assets/logo.png";

function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
                type={showPassword ? "text" : "password"}
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRegister()}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "var(--muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center"
                }}
              >
                {showPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
              </button>
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

          <div className="auth-link">
            Already have an account? <Link to="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Register;
