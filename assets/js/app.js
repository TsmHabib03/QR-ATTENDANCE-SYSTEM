/* =========================================================================
   Bootstrap: theme, branding, top-bar interactions, auth gate, routing.
   ========================================================================= */
(function () {
  const THEME_KEY = "qr_theme";

  App.setTheme = (theme) => {
    const t = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem(THEME_KEY, t);
    const btn = App.ui.$("#theme-toggle [data-icon]");
    if (btn) { btn.setAttribute("data-icon", t === "dark" ? "sun" : "moon"); btn.dataset.iconDone = ""; App.ui.icons(); }
  };

  App.applyBranding = () => {
    const org = App.settings.OrgName || App.config.ORG_NAME;
    App.ui.$$("[data-org-name]").forEach((n) => (n.textContent = org));
    const badge = App.ui.$("[data-env-badge]");
    if (badge) { badge.hidden = !App.isDemo; }
    const user = App.auth.getUser() || { name: "Admin" };
    const nameEl = App.ui.$("[data-user-name]"); if (nameEl) nameEl.textContent = user.name;
    const initEl = App.ui.$("[data-user-initials]"); if (initEl) initEl.textContent = App.ui.initials(user.name);
  };

  App.render = () => {
    const authed = App.auth.isAuthed();
    App.ui.$("#login-screen").hidden = authed;
    App.ui.$("#app-shell").hidden = !authed;
    App.ui.$("[data-demo-hint]").hidden = !App.isDemo;
    App.ui.icons();
    if (!authed) { App.login.wire(); return; }
    App.applyBranding();
    if (!location.hash || location.hash === "#/login") location.hash = "#/dashboard";
    App.router.handle();
  };

  function wireTopbar() {
    // mobile drawer
    App.ui.$("#menu-toggle").addEventListener("click", () => {
      const shell = App.ui.$("#app-shell");
      const open = shell.classList.toggle("nav-open");
      App.ui.$("#sidebar-scrim").hidden = !open;
    });
    App.ui.$("#sidebar-scrim").addEventListener("click", () => {
      App.ui.$("#app-shell").classList.remove("nav-open");
      App.ui.$("#sidebar-scrim").hidden = true;
    });

    // theme
    App.ui.$("#theme-toggle").addEventListener("click", () =>
      App.setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"));

    // user menu (origin-aware popover)
    const btn = App.ui.$("#user-btn"), pop = App.ui.$("#user-popover");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const show = pop.hidden; pop.hidden = !show; btn.setAttribute("aria-expanded", String(show));
      if (show) App.ui.icons(pop);
    });
    document.addEventListener("click", () => { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); });

    App.ui.$("#logout").addEventListener("click", () => App.auth.logout());
    App.ui.$("#change-password").addEventListener("click", changePassword);
  }

  async function changePassword() {
    const { value: form } = await Swal.fire({
      title: "Change password",
      html: `<input id="cp-old" class="swal2-input" type="password" placeholder="Current password">
             <input id="cp-new" class="swal2-input" type="password" placeholder="New password">`,
      focusConfirm: false, showCancelButton: true, confirmButtonColor: "#0D9488",
      preConfirm: () => ({ old: document.getElementById("cp-old").value, new: document.getElementById("cp-new").value }),
    });
    if (!form) return;
    if (!form.new || form.new.length < 6) return App.ui.toast("New password must be at least 6 characters.", "error");
    try { await App.api.call("auth.changePassword", form); App.ui.toast("Password changed."); }
    catch (err) { App.ui.toast(err.message, "error"); }
  }

  function boot() {
    App.setTheme(localStorage.getItem(THEME_KEY) || App.config.THEME);
    App.ui.icons();
    wireTopbar();
    App.login.wire();
    window.addEventListener("hashchange", () => App.router.handle());
    App.render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
