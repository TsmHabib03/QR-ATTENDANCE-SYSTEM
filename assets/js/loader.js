/* =========================================================================
   loader.js — on-demand <script> loading for CDN libs only a few pages need.
   De-duped by URL so repeat page visits resolve instantly (no reinjection).
   ========================================================================= */
(function () {
  const loaded = new Map(); // url -> Promise

  function loadScript(url) {
    if (loaded.has(url)) return loaded.get(url);
    const p = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = url;
      s.onload = () => resolve();
      s.onerror = () => { loaded.delete(url); reject(new Error("Failed to load " + url)); };
      document.head.appendChild(s);
    });
    loaded.set(url, p);
    return p;
  }

  App.loadScript = loadScript;
  App.CDN = {
    CHART: "https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js",
    HTML5_QRCODE: "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js",
    QRCODEJS: "https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js",
  };
})();
