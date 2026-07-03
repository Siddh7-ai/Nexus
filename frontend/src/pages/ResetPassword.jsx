import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "../App.css";
import { getBackendUrl } from "../utils/config";
import { SmoothInput } from "../components/SmoothInput";
import ThemeToggleButton from "../components/ThemeToggleButton";
import { initTheme, toggleTheme } from "../utils/theme";
import { FiEye, FiEyeOff } from "react-icons/fi";
import logo from "../assets/logo.png";

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

  // Password strength checklist metrics
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

  async function handleSubmit(e) {
    if (e) e.preventDefault();
    if (!token) {
      setError("Reset token is missing in URL.");
      return;
    }
    if (!isPasswordValid) {
      setError("Please satisfy all password complexity rules.");
      return;
    }

    setLoading(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`${getBackendUrl()}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password })
      });
      const data = await response.json();

      if (response.ok) {
        setMessage(data.message || "Password updated successfully. You will be redirected to Login.");
        setTimeout(() => {
          navigate("/login");
        }, 4000);
      } else {
        setError(data.message || "Something went wrong.");
      }
    } catch (err) {
      console.error(err);
      setError("Cannot connect to server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrapper">
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
            <h2>Reset Password</h2>
            <p>Setup a strong new password for your account</p>
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
                <label>New Password</label>
                <div className="auth-input-wrap">
                  <SmoothInput
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your strong password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
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
              </div>

              {/* Real-time rules list */}
              <div className="password-rules" style={{ margin: "16px 0", fontSize: "12px", color: "var(--muted)" }}>
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

              <button className="auth-btn" type="submit" disabled={loading || !isPasswordValid}>
                {loading ? "Updating..." : "Update Password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;
