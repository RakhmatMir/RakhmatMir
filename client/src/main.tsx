import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { App } from "./App";
import "./styles/global.css";

const Router = import.meta.env.VITE_PAGES_DEMO === "true" ? HashRouter : BrowserRouter;
const basename =
  import.meta.env.VITE_PAGES_DEMO === "true"
    ? undefined
    : import.meta.env.BASE_URL.replace(/\/$/, "") || undefined;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Router basename={basename}>
      <App />
    </Router>
  </React.StrictMode>,
);
