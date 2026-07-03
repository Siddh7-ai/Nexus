import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import "../App.css";
import { getBackendUrl } from "../utils/config";
import { SmoothInput } from "../components/SmoothInput";
import ThemeToggleButton from "../components/ThemeToggleButton";
import { initTheme, toggleTheme } from "../utils/theme";
import { FiArrowLeft, FiMail } from "react-icons/fi";
import logo from "../assets/logo.png";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [theme, setTheme] = useState("light");

  const navigate = useNavigate();

  useEffect(() => {
    setTheme(initTheme());
  }, []);

  function handleThemeToggle(e) {
    toggleTheme(e, setTheme);
  }

  async function handleSubmit(e) {
    if (e) e.preventDefault();
    if (!email) {
      setError("Please enter your email address.");
      return;
    }

    setLoading(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`${getBackendUrl()}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await response.json();
      
      if (response.ok) {
        setMessage(data.message || "Instructions have been sent if the account exists.");
      } else {
        setError(data.message || "Something went wrong.");
      }
    } catch (err) {
      console.error(err);
      setError("Cannot connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrapper">
      <button 
        className="floating-back-btn" 
        onClick={() => navigate("/login")} 
        aria-label="Back to login"
        title="Back to Login"
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
            <h2>Recover Password</h2>
            <p>We will email you reset instructions</p>
          </div>

          {message && (
            <div style={{
              background: "rgba(18, 199, 189, 0.15)",
              color: "var(--accent)",
              padding: "12px",
              borderRadius: "8px",
              fontSize: "13px",
              marginBottom: "16px",
              fontWeight: 500
            }}>
              {message}
            </div>
          )}

          {error && (
            <div style={{
              background: "rgba(239, 68, 68, 0.15)",
              color: "#ef4444",
              padding: "12px",
              borderRadius: "8px",
              fontSize: "13px",
              marginBottom: "16px",
              fontWeight: 500
            }}>
              {error}
            </div>
          )}

          {!message && (
            <form onSubmit={handleSubmit}>
              <div className="auth-field">
                <label>Email Address</label>
                <div className="auth-input-wrap">
                  <SmoothInput
                    type="email"
                    placeholder="Enter your registered email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <button className="auth-btn" type="submit" disabled={loading}>
                {loading ? "Sending..." : "Request Reset Link"}
              </button>
            </form>
          )}

          <div className="auth-link" style={{ marginTop: "24px" }}>
            Remembered your password? <Link to="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ForgotPassword;
