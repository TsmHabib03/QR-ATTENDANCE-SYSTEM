/* =========================================================================
   Hash router (works on GitHub Pages with no server config).
   #/dashboard -> App.pages.dashboard.mount(view)
   ========================================================================= */
(function () {
  const DEFAULT = "dashboard";
  let current = null;

  function parse() {
    const raw = (location.hash || "").replace(/^#\/?/, "").split("?")[0];
    return raw || DEFAULT;
  }

  function setActiveNav(name) {
    App.ui.$$(".nav__link").forEach((a) =>
      a.classList.toggle("is-active", a.dataset.route === name));
  }

  function setBreadcrumbs(crumb) {
    const bc = App.ui.$("#breadcrumbs");
    if (bc) bc.innerHTML = `<span>Home</span><span class="sep">/</span><span class="current">${App.ui.esc(crumb)}</span>`;
  }

  async function handle() {
    if (!App.auth.isAuthed()) { App.render(); return; }
    let name = parse();
    if (!App.pages[name]) name = DEFAULT;
    const page = App.pages[name];

    // lifecycle: let the outgoing page clean up (e.g., stop the camera)
    if (current && current.onLeave) { try { current.onLeave(); } catch (_) {} }
    current = page;

    setActiveNav(name);
    setBreadcrumbs(page.crumb || page.title || name);
    document.title = `${page.title || name} · ${App.settings.OrgName || App.config.ORG_NAME}`;

    const view = App.ui.$("#view");
    view.scrollTo ? view.scrollTo(0, 0) : (view.scrollTop = 0);
    view.focus({ preventScroll: true });

    // close the mobile drawer on navigation
    App.ui.$("#app-shell").classList.remove("nav-open");
    const scrim = App.ui.$("#sidebar-scrim"); if (scrim) scrim.hidden = true;

    try {
      await page.mount(view);
    } catch (err) {
      view.innerHTML = `<div class="empty"><span data-icon="alert-triangle" style="color:var(--status-absent)"></span>
        <h3>Something went wrong</h3><p>${App.ui.esc(err.message || err)}</p></div>`;
      App.ui.icons(view);
    }
  }

  App.router = { handle, parse };
})();
