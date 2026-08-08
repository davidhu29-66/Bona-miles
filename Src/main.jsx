import "./storagePolyfill.js";
import React from "react";
import ReactDOM from "react-dom/client";
import ErrorBoundary from "./ErrorBoundary.jsx";
import AuthGate from "./AuthGate.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthGate />
    </ErrorBoundary>
  </React.StrictMode>
);
