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
              <button class="iconbtn" id="scan-mute" title="${App.sound.isMuted() ? "Unmute" : "Mute"} scan sounds"><span data-icon="${App.sound.isMuted() ? "volume-x" : "volume-2"}"></span></button>
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
      App.ui.$("#scan-mute").addEventListener("click", toggleMute);
      if (App.isDemo) App.ui.$("#scan-demo").addEventListener("click", () => handleCode("M001"));
    },
    onLeave() {
      stopCamera();
      clearTimeout(popupTimer);
      if (popupEl) popupEl.classList.remove("is-visible", "is-leaving");
    },
  };

  function toggleMute() {
    const next = !App.sound.isMuted();
    App.sound.setMuted(next);
    const btn = App.ui.$("#scan-mute");
    if (btn) {
      btn.title = (next ? "Unmute" : "Mute") + " scan sounds";
      btn.innerHTML = `<span data-icon="${next ? "volume-x" : "volume-2"}"></span>`;
      App.ui.icons(btn);
    }
  }

  async function startCamera() {
    if (running) return;
    App.sound.unlock(); // must happen inside a real user gesture (iOS)
    toggleButtons(true);
    try {
      if (!window.Html5Qrcode) await App.loadScript(App.CDN.HTML5_QRCODE);
      if (!App.ui.$("#qr-reader")) return; // navigated away while the library was loading
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
      showScanPopup(r);
      App.sound.success();
      App.bus.emit("attendance:changed");
      if (navigator.vibrate) navigator.vibrate(60);
    } catch (err) {
      showError(err.message);
      showScanPopup(null, err.message);
      App.sound.fail();
      if (navigator.vibrate) navigator.vibrate([40, 40, 40]);
    } finally {
      setTimeout(() => { busy = false; }, 800); // cooldown before the next member
    }
  }

  /* ---- Transient scan-result popup: one reused node, auto-dismissing,
     never blocks the camera or the next scan (see plan for rationale). ---- */
  let popupEl = null, popupTimer = null;
  function popupNode() {
    if (popupEl) return popupEl;
    popupEl = App.ui.el("div", { class: "scan-popup" }, App.ui.el("div", { class: "scan-popup__card" }));
    document.body.appendChild(popupEl);
    return popupEl;
  }

  function showScanPopup(r, errMsg) {
    const el = popupNode();
    const card = el.querySelector(".scan-popup__card");
    if (r) {
      const name = ((r.member.FirstName || "") + " " + (r.member.LastName || "")).trim();
      card.className = "scan-popup__card";
      card.innerHTML = `
        <div class="scan-tick"><span data-icon="check"></span></div>
        <div class="avatar-lg">${App.ui.initials(name)}</div>
        <h2>${App.ui.esc(name)}</h2>
        <p class="mt-4">${App.ui.statusBadge(r.status)} &nbsp; <strong>${App.ui.esc(r.type)}</strong></p>`;
    } else {
      card.className = "scan-popup__card is-fail";
      card.innerHTML = `
        <div class="scan-tick"><span data-icon="x"></span></div>
        <h2>Scan failed</h2>
        <p class="muted">${App.ui.esc(errMsg || "")}</p>`;
    }
    App.ui.icons(card);

    clearTimeout(popupTimer);
    el.classList.remove("is-leaving");
    el.classList.add("is-visible");
    popupTimer = setTimeout(() => {
      el.classList.add("is-leaving");
      el.classList.remove("is-visible");
    }, 1800);
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
