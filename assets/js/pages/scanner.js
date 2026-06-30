/* ===== Scanner: fast, continuous QR scan -> attendance.scan -> success card =====
   Keeps the camera running so you can scan many people in a row; a short
   cooldown debounces duplicate frames. Uses the native BarcodeDetector when
   available for near-instant detection. ====================================== */
(function () {
  let scanner = null, busy = false, running = false;

  App.pages.scanner = {
    title: "Scan", crumb: "Scan attendance",
    async mount(view) {
      view.innerHTML = `
        <div class="page-head"><div><h1>Attendance scanner</h1><p>Point the camera at a member's QR code — scanning is continuous.</p></div></div>
        <div class="scanner-grid">
          <div class="card"><div class="card__body">
            <div id="qr-reader"></div>
            <div class="row mt-4">
              <button class="btn btn--cta" id="scan-start"><span data-icon="camera"></span> Start camera</button>
              <button class="btn" id="scan-stop" hidden><span data-icon="square"></span> Stop</button>
              <button class="btn" id="scan-manual"><span data-icon="clipboard-pen"></span> Manual entry</button>
              ${App.isDemo ? `<button class="btn" id="scan-demo"><span data-icon="zap"></span> Simulate scan</button>` : ""}
            </div>
            <p class="muted mt-4" id="scan-hint">Camera needs HTTPS (or localhost) and permission. It stays on between members.</p>
          </div></div>
          <div class="card"><div class="card__head"><span class="card__title">Last scan</span></div>
            <div class="card__body"><div class="scan-result" id="scan-result">
              <div class="empty"><span data-icon="scan-line"></span><h3>Ready</h3><p>Scan results appear here.</p></div>
            </div></div></div>
        </div>`;
      App.ui.icons(view);

      App.ui.$("#scan-start").addEventListener("click", startCamera);
      App.ui.$("#scan-stop").addEventListener("click", stopCamera);
      App.ui.$("#scan-manual").addEventListener("click", () => App.manualAttendance && App.manualAttendance());
      if (App.isDemo) App.ui.$("#scan-demo").addEventListener("click", () => handleCode("M001"));
    },
    onLeave() { stopCamera(); },
  };

  async function startCamera() {
    if (running) return;
    if (!window.Html5Qrcode) { App.ui.toast("Scanner library not loaded.", "error"); return; }
    toggleButtons(true);
    try {
      scanner = scanner || new Html5Qrcode("qr-reader", { experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox: (w, h) => { const m = Math.floor(Math.min(w, h) * 0.7); return { width: m, height: m }; },
          aspectRatio: 1.0,
          disableFlip: true,
          videoConstraints: { facingMode: "environment", advanced: [{ focusMode: "continuous" }] },
        },
        (decoded) => handleCode(decoded),
        () => {} // per-frame decode failures are normal — ignore
      );
      running = true;
    } catch (err) {
      running = false; toggleButtons(false);
      showCameraError(err);
    }
  }

  async function stopCamera() {
    running = false;
    if (!scanner) { toggleButtons(false); return; }
    try { await scanner.stop(); } catch (_) {}
    try { await scanner.clear(); } catch (_) {}
    scanner = null;
    toggleButtons(false);
  }

  function toggleButtons(on) {
    const s = App.ui.$("#scan-start"), t = App.ui.$("#scan-stop");
    if (s) s.hidden = on; if (t) t.hidden = !on;
  }

  async function handleCode(code) {
    if (busy) return; busy = true;
    try {
      const r = await App.api.call("attendance.scan", { qr: code });
      showResult(r);
      App.bus.emit("attendance:changed");
      if (navigator.vibrate) navigator.vibrate(60);
    } catch (err) {
      showError(err.message);
      if (navigator.vibrate) navigator.vibrate([40, 40, 40]);
    } finally {
      setTimeout(() => { busy = false; }, 1300); // cooldown before the next member
    }
  }

  function showResult(r) {
    const m = r.member, host = App.ui.$("#scan-result"); if (!host) return;
    const name = ((m.FirstName || "") + " " + (m.LastName || "")).trim();
    host.innerHTML = `
      <div class="scan-ok">
        <div class="scan-tick"><span data-icon="check"></span></div>
        <div class="avatar-lg">${App.ui.initials(name)}</div>
        <h2>${App.ui.esc(name)}</h2>
        <p class="muted">${App.ui.esc(m.Department || "")} · ${App.ui.esc(m.MemberID)}</p>
        <p class="mt-4">${App.ui.statusBadge(r.status)} &nbsp; <strong>${App.ui.esc(r.type)}</strong></p>
        <p class="muted">${new Date().toLocaleTimeString()} · ${new Date().toLocaleDateString()}</p>
        ${r.noSchedule ? `<p class="notice notice--warn">No schedule assigned — recorded without late/absent rules.</p>` : ""}
      </div>`;
    App.ui.icons(host);
  }

  function showError(msg) {
    const host = App.ui.$("#scan-result"); if (!host) return;
    host.innerHTML = `<div class="empty"><span data-icon="alert-triangle" style="color:var(--status-absent)"></span><h3>Scan failed</h3><p>${App.ui.esc(msg)}</p></div>`;
    App.ui.icons(host);
  }

  function showCameraError(err) {
    const s = String(err || "");
    const msg = /permission|notallowed/i.test(s) ? "Camera permission denied. Allow camera access in your browser, then tap Start camera."
      : /notfound|no camera|overconstrained/i.test(s) ? "No usable camera was found on this device."
      : "Could not start the camera: " + s;
    const hint = App.ui.$("#scan-hint");
    if (hint) hint.innerHTML = `<span style="color:var(--status-absent)">${App.ui.esc(msg)}</span>`;
    App.ui.toast(msg, "error");
  }
})();
