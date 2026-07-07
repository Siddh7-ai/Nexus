import React, { Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";

// Lazy load all page containers
const Landing = React.lazy(() => import("./pages/Landing"));
const Login = React.lazy(() => import("./pages/Login"));
const Register = React.lazy(() => import("./pages/Register"));
const Chat = React.lazy(() => import("./pages/Chat"));
const Features = React.lazy(() => import("./pages/Features"));
const ForgotPassword = React.lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = React.lazy(() => import("./pages/ResetPassword"));
const VerifyEmail = React.lazy(() => import("./pages/VerifyEmail"));

// Sleek loading fallback styled with default/theme values
const PageSkeleton = () => (
  <div className="skeleton-container" style={{
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    width: "100vw",
    backgroundColor: "var(--bg-primary, #ffffff)",
    fontFamily: "sans-serif"
  }}>
    <div className="skeleton-spinner" style={{
      width: "48px",
      height: "48px",
      border: "4px solid rgba(18, 199, 189, 0.1)",
      borderTop: "4px solid var(--accent, #12c7bd)",
      borderRadius: "50%",
      animation: "spin 1s linear infinite",
      marginBottom: "16px"
    }} />
    <span style={{ fontSize: "14px", fontWeight: "500", color: "var(--text-secondary, #6b7280)" }}>Loading Nexus...</span>
    <style>{`
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `}</style>
  </div>
);

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/features" element={<Features />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
