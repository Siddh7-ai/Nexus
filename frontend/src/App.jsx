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

// Rich animated dashboard layout preview skeleton styled with default/theme values
const PageSkeleton = () => (
  <div className="chat-wrapper" style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--page)" }}>
    <div className="chat-layout" style={{ display: "flex", flex: 1, width: "100%", height: "100%", background: "var(--panel)" }}>
      
      {/* Sidebar Panel Skeleton */}
      <div className="sidebar-panel" style={{ width: "280px", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", padding: "18px 14px", background: "var(--sidebar)" }}>
        {/* Sidebar Brand Skeleton */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
          <div className="skeleton-element" style={{ width: "42px", height: "42px", borderRadius: "12px" }}></div>
          <div style={{ flex: 1 }}>
            <div className="skeleton-element" style={{ width: "100px", height: "16px", borderRadius: "4px", marginBottom: "6px" }}></div>
            <div className="skeleton-element" style={{ width: "60px", height: "12px", borderRadius: "4px" }}></div>
          </div>
        </div>
        
        {/* Search Bar Skeleton */}
        <div className="skeleton-element" style={{ width: "100%", height: "36px", borderRadius: "8px", marginBottom: "20px" }}></div>
        
        {/* List Items Skeletons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div className="skeleton-element" style={{ width: "40px", height: "40px", borderRadius: "50%", borderRadius: "50%" }}></div>
              <div style={{ flex: 1 }}>
                <div className="skeleton-element" style={{ width: "80%", height: "14px", borderRadius: "4px", marginBottom: "6px" }}></div>
                <div className="skeleton-element" style={{ width: "50%", height: "10px", borderRadius: "4px" }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Main Chat Container Skeleton */}
      <div className="chat-container" style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--page)" }}>
        {/* Chat Header Skeleton */}
        <div style={{ height: "74px", borderBottom: "1px solid var(--border)", padding: "18px 28px", display: "flex", alignItems: "center", background: "var(--panel)" }}>
          <div className="skeleton-element" style={{ width: "40px", height: "40px", borderRadius: "50%", marginRight: "12px" }}></div>
          <div style={{ flex: 1 }}>
            <div className="skeleton-element" style={{ width: "120px", height: "16px", borderRadius: "4px", marginBottom: "6px" }}></div>
            <div className="skeleton-element" style={{ width: "80px", height: "12px", borderRadius: "4px" }}></div>
          </div>
        </div>
        
        {/* Messages Area Skeleton */}
        <div style={{ flex: 1, padding: "30px", display: "flex", flexDirection: "column", gap: "24px", overflow: "hidden" }}>
          {/* Message Left */}
          <div style={{ display: "flex", gap: "12px", maxWidth: "60%" }}>
            <div className="skeleton-element" style={{ width: "36px", height: "36px", borderRadius: "50%", flexShrink: 0 }}></div>
            <div className="skeleton-element" style={{ flex: 1, height: "60px", borderRadius: "4px 16px 16px 16px" }}></div>
          </div>
          
          {/* Message Right */}
          <div style={{ display: "flex", gap: "12px", maxWidth: "60%", alignSelf: "flex-end", justifyContent: "flex-end", width: "100%" }}>
            <div className="skeleton-element" style={{ width: "80%", height: "45px", borderRadius: "16px 16px 4px 16px" }}></div>
          </div>

          {/* Message Left */}
          <div style={{ display: "flex", gap: "12px", maxWidth: "50%" }}>
            <div className="skeleton-element" style={{ width: "36px", height: "36px", borderRadius: "50%", flexShrink: 0 }}></div>
            <div className="skeleton-element" style={{ flex: 1, height: "48px", borderRadius: "4px 16px 16px 16px" }}></div>
          </div>

          {/* Message Right */}
          <div style={{ display: "flex", gap: "12px", maxWidth: "45%", alignSelf: "flex-end", justifyContent: "flex-end", width: "100%" }}>
            <div className="skeleton-element" style={{ width: "90%", height: "70px", borderRadius: "16px 16px 4px 16px" }}></div>
          </div>
        </div>
        
        {/* Message Input Area Skeleton */}
        <div style={{ padding: "20px 30px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "12px", background: "var(--panel)" }}>
          <div className="skeleton-element" style={{ width: "36px", height: "36px", borderRadius: "50%" }}></div>
          <div className="skeleton-element" style={{ flex: 1, height: "44px", borderRadius: "24px" }}></div>
          <div className="skeleton-element" style={{ width: "36px", height: "36px", borderRadius: "50%" }}></div>
        </div>
      </div>
      
    </div>

    {/* Styling for shimmer animations */}
    <style>{`
      .skeleton-element {
        background-color: var(--soft, #f0f1f4);
        background-image: linear-gradient(
          90deg,
          rgba(255, 255, 255, 0) 0,
          rgba(255, 255, 255, 0.4) 20%,
          rgba(255, 255, 255, 0.6) 60%,
          rgba(255, 255, 255, 0)
        );
        background-size: 200% 100%;
        background-repeat: no-repeat;
        animation: skeleton-shimmer 1.5s infinite;
      }
      .dark-theme .skeleton-element {
        background-color: var(--soft, #1e293b);
        background-image: linear-gradient(
          90deg,
          rgba(255, 255, 255, 0) 0,
          rgba(255, 255, 255, 0.05) 20%,
          rgba(255, 255, 255, 0.1) 60%,
          rgba(255, 255, 255, 0)
        );
      }
      @keyframes skeleton-shimmer {
        0% {
          background-position: -200% 0;
        }
        100% {
          background-position: 200% 0;
        }
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
