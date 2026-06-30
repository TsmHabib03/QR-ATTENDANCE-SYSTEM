/* ===== Scanner: camera QR scan -> attendance.scan -> success card ===== */
(function () {
  let scanner = null, busy = false;

  App.pages.scanner = {
    title: "Scan", crumb: "Scan attendance",
    async mount(view) {
      view.innerHTML = `
        <div class="page-head"><div><h1>Attendance scanner</h1><p>Point the camera at a member's QR code.</p></div></div>
        <div class="scanner-grid">
          <div class="card"><div class="card__body">
            <div id="qr-reader"></div>
            <div class="row mt-4">
              <button class="btn btn--cta" id="scan-start"><span data-icon="camera"></span> Start camera</button>
              <button class="btn" id="scan-stop" hidden><span data-icon="square"></span> Stop</button>
              ${App.isDemo ? `<button class="btn" id="scan-demo"><span data-icon="zap"></span> Simulate scan</button>` : ""}
            </div>
            <p class="muted mt-4" id="scan-hint">Camera requires HTTPS (or localhost) and permission.</p>
          </div></div>
          <div class="card"><div class="card__head"><span class="card__title">Last scan</span></div>
            <div class="card__body"><div class="scan-result" id="scan-result">
              <div class="empty"><span data-icon="scan-line"></span><h3>Ready</h3><p>Scan results appear here.</p></div>
            </div></div></div>
        </div>`;
      App.ui.icons(view);

      const start = App.ui.$("#scan-start"), stop = App.ui.$("#scan-stop");
      start.addEventListener("click", () => startCamera());
      stop.addEventListener("click", () => stopCamera());
      if (App.isDemo) App.ui.$("#scan-demo").addEventListener("click", () => handleCode("M001"));
    },
    onLeave() { stopCamera(); },
  };

  async function startCamera() {
    if (scanner) return;
    if (!window.Html5Qrcode) { App.ui.toast("Scanner library not loaded.", "error"); return; }
    App.ui.$("#scan-start").hidden = true; App.ui.$("#scan-stop").hidden = false;
    scanner = new Html5Qrcode("qr-reader");
    try {
      await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 230, height: 230 } },
        (decoded) => handleCode(decoded), () => {});
    } catch (err) {
      App.ui.$("#scan-hint").textContent = "Could not access camera: " + err;
      App.ui.$("#scan-start").hidden = false; App.ui.$("#scan-stop").hidden = true;
      scanner = null;
    }
  }

  async function stopCamera() {
    if (!scanner) return;
    try { await scanner.stop(); await scanner.clear(); } catch (_) {}
    scanner = null;
    const s = App.ui.$("#scan-start"), t = App.ui.$("#scan-stop");
    if (s) s.hidden = false; if (t) t.hidden = true;
  }

  async function handleCode(code) {
    if (busy) return; busy = true;
    try {
      const r = await App.api.call("attendance.scan", { qr: code });
      showResult(r);
      if (navigator.vibrate) navigator.vibrate(60);
    } catch (err) {
      showError(err.message);
    } finally {
      setTimeout(() => { busy = false; }, 1200); // debounce repeated frames
    }
  }

  function showResult(r) {
    const m = r.member;
    const host = App.ui.$("#scan-result"); if (!host) return;
    host.innerHTML = `
      <div>
        <div class="avatar-lg">${App.ui.initials(m.FirstName + " " + m.LastName)}</div>
        <h2>${App.ui.esc(m.FirstName + " " + m.LastName)}</h2>
        <p class="muted">${App.ui.esc(m.Department)} · ${App.ui.esc(m.MemberID)}</p>
        <p class="mt-4">${App.ui.statusBadge(r.status)} &nbsp; <strong>${App.ui.esc(r.type)}</strong></p>
        <p class="muted">${new Date().toLocaleTimeString()} · ${new Date().toLocaleDateString()}</p>
      </div>`;
  }

  function showError(msg) {
    const host = App.ui.$("#scan-result"); if (!host) return;
    host.innerHTML = `<div class="empty"><span data-icon="alert-triangle" style="color:var(--status-absent)"></span><h3>Scan failed</h3><p>${App.ui.esc(msg)}</p></div>`;
    App.ui.icons(host);
  }
})();
