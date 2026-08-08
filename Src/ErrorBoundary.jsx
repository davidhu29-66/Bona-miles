import React from "react";

// Deliberately plain inline styles, no Tailwind classes — if something in the
// CSS pipeline is part of what's broken, this still needs to render readably.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("App crashed:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            background: "#020617",
            color: "#e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            fontFamily: "monospace",
            fontSize: "13px",
          }}
        >
          <div style={{ maxWidth: "420px", width: "100%" }}>
            <div style={{ color: "#f87171", fontWeight: "bold", marginBottom: "10px", fontSize: "14px" }}>
              Something crashed
            </div>
            <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.5 }}>
              {this.state.error.message || String(this.state.error)}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
