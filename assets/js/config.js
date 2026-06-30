/* =========================================================================
   Per-client configuration.
   Edit this file to point at your Apps Script Web App and brand the app.
   Leave API_URL empty ("") to run in DEMO MODE (mock data, no backend).
   ========================================================================= */
window.APP_CONFIG = {
  // Paste your Apps Script Web App URL here, e.g.
  // "https://script.google.com/macros/s/XXXXXXXX/exec"
  API_URL: "https://script.google.com/macros/s/AKfycbwqXv__GFLtUFQYHoWrRwEtCZ2xKp1BfcGG9V90BMmZjLPaxDuXzLU346AvRtxQWZxZSw/exec",

  ORG_NAME: "QR Attendance",
  THEME: "light",        // "light" | "dark"
  TIMEZONE: "Asia/Manila"
};

// Global app namespace (classic scripts attach here — no bundler needed).
window.App = window.App || {};
App.config = window.APP_CONFIG;
App.isDemo = !App.config.API_URL;
App.pages = {}; // page modules register themselves here
App.settings = {};
