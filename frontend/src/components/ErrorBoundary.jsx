import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[Nexus Boundary] Caught runtime render error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
        this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-fallback" style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          height: "100%",
          width: "100%",
          minHeight: "150px",
          backgroundColor: "var(--bg-card, #1e293b)",
          border: "1px dashed var(--border, #334155)",
          borderRadius: "12px",
          textAlign: "center",
          color: "var(--text, #ffffff)"
        }}>
          <AlertTriangle size={28} className="error-icon" style={{ color: "#ef4444", marginBottom: "12px" }} />
          <h4 style={{ margin: "0 0 6px 0", fontSize: "15px", fontWeight: "700" }}>
            {this.props.title || "Something went wrong"}
          </h4>
          <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "var(--muted, #94a3b8)", maxWidth: "260px" }}>
            An unexpected error occurred while rendering this module.
          </p>
          <button 
            onClick={this.handleReset}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 16px",
              fontSize: "12px",
              fontWeight: "600",
              backgroundColor: "var(--accent, #12c7bd)",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(18, 199, 189, 0.15)",
              transition: "transform 0.2s ease"
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-1px)"}
            onMouseLeave={(e) => e.currentTarget.style.transform = "none"}
          >
            <RotateCcw size={13} />
            <span>Try Again</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
