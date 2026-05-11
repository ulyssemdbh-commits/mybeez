import { createRoot } from "react-dom/client";
import App from "./App";
import { initSentry } from "./lib/sentry";
import "./index.css";

// Initialise error tracking before mounting React so an exception in
// the App boot path is captured. No-op when VITE_SENTRY_DSN is unset.
initSentry();

createRoot(document.getElementById("root")!).render(<App />);
