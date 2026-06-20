import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import "../App.css";
import { getBackendUrl } from "../utils/config";
import { SmoothInput } from "../components/SmoothInput";
import ThemeToggleButton from "../components/ThemeToggleButton";
import { initTheme, toggleTheme } from "../utils/theme";

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

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState("light");

  const navigate = useNavigate();

  useEffect(() => {
    setTheme(initTheme());
  }, []);

  function handleThemeToggle() {
    setTheme(toggleTheme());
  }

  async function handleLogin() {
    if (!email || !password) {
      alert("Please fill in all fields");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${getBackendUrl()}/api/auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        }
      );

      const data = await response.json();

      if (response.ok) {
        sessionStorage.setItem("token", data.token);
        localStorage.removeItem("token");
        navigate("/chat");
      } else {
        alert(data.message);
      }
    } catch (error) {
      console.log(error);
      alert("Cannot connect to server");
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
              <h1><strong>Nexus</strong></h1>
              <p>Next-gen messaging platform</p>
            </div>
          </div>

          <div className="auth-heading">
            <h2>Welcome back</h2>
            <p>Sign in to your account</p>
          </div>

          <div className="auth-field">
            <label>Email</label>
            <div className="auth-input-wrap">
              <SmoothInput
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
          </div>

          <div className="auth-field">
            <label>Password</label>
            <div className="auth-password-wrap">
              <SmoothInput
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
              <button
                type="button"
                className="auth-eye-btn"
                onClick={() => setShowPassword(value => !value)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <button className="auth-forgot" type="button">Forgot password?</button>

          <button className="auth-btn" onClick={handleLogin} disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>

          <div className="auth-divider"><span>or continue with</span></div>

          <button className="auth-google-btn" type="button">
            <GoogleLogo />
            Continue with Google
          </button>

          <div className="auth-link">
            Don&apos;t have an account? <Link to="/register">Register</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
