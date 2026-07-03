import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import "../App.css";
import ThemeToggleButton from "../components/ThemeToggleButton";
import { initTheme, toggleTheme } from "../utils/theme";
import logo from "../assets/logo.png";

function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const status = searchParams.get("status") || "pending";
  const errorMessage = searchParams.get("message") || "Verification failed.";

  const [theme, setTheme] = useState("light");
  const navigate = useNavigate();

  useEffect(() => {
    setTheme(initTheme());
  }, []);

  function handleThemeToggle(e) {
    toggleTheme(e, setTheme);
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
            {status === "success" ? (
              <>
                <h2 style={{ color: "var(--accent)" }}>✓ Email Verified</h2>
                <p>Your account is activated and ready for secure messaging</p>
              </>
            ) : status === "error" ? (
              <>
                <h2 style={{ color: "#ef4444" }}>✗ Verification Failed</h2>
                <p>{errorMessage}</p>
              </>
            ) : (
              <>
                <h2>Verifying Email</h2>
                <p>Please wait while we activate your account...</p>
              </>
            )}
          </div>

          <div style={{ marginTop: "24px" }}>
            {status === "success" ? (
              <Link to="/login" className="auth-btn" style={{ display: "block", textAlign: "center", textDecoration: "none", lineHeight: "38px" }}>
                Sign In
              </Link>
            ) : (
              <Link to="/register" className="auth-btn" style={{ display: "block", textAlign: "center", textDecoration: "none", lineHeight: "38px" }}>
                Back to Registration
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default VerifyEmail;
