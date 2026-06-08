import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "../App.css";
import { getBackendUrl } from "../utils/config";

import logo from "../assets/logo.png";

function getPasswordStrength(password) {
  let score = 0;
  if (password.length >= 6) score += 1;
  if (password.length >= 10) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
}

function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);

  async function handleRegister() {
    if (!username || !email || !password) {
      alert("Please fill in all fields");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${getBackendUrl()}/api/auth/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, email, password })
        }
      );

      const data = await response.json();

      if (response.ok) {
        alert("Registration successful! Please login.");
        navigate("/login");
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

          <div className="auth-field">
            <label>Username</label>
            <div className="auth-input-wrap">
              <input
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
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="auth-field">
            <label>Password</label>
            <div className="auth-password-wrap">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRegister()}
              />
              <button
                type="button"
                className="auth-eye-btn"
                onClick={() => setShowPassword(value => !value)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <div className="password-strength" aria-hidden="true">
              {[1, 2, 3, 4].map(level => (
                <span key={level} className={passwordStrength >= level ? "active" : ""} />
              ))}
            </div>
          </div>

          <button className="auth-btn" onClick={handleRegister} disabled={loading}>
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
