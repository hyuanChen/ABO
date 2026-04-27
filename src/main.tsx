import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { syncThemeMode } from "./core/theme";
import App from "./App";

syncThemeMode();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
