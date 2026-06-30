/* =========================================================================
   Token-based auth for a static frontend.
   "Remember me"  -> localStorage (persists)
   otherwise      -> sessionStorage (cleared when tab closes)
   ========================================================================= */
(function () {
  const KEY = "qr_token", USER = "qr_user";

  const store = () => (localStorage.getItem(KEY) ? localStorage : sessionStorage);

  const auth = {
    getToken: () => localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || "",
    getUser:  () => { try { return JSON.parse(localStorage.getItem(USER) || sessionStorage.getItem(USER) || "null"); } catch { return null; } },
    isAuthed: () => !!auth.getToken(),

    async login({ username, password, remember }) {
      const result = await App.api.call("login", { username, password, remember });
      const target = remember ? localStorage : sessionStorage;
      target.setItem(KEY, result.token);
      target.setItem(USER, JSON.stringify(result.admin || { name: username }));
      if (result.settings) App.settings = result.settings;
      return result;
    },

    async logout() {
      try { await App.api.call("logout", {}); } catch (_) {}
      auth.clear();
      location.hash = "#/login";
      App.render && App.render();
    },

    clear() {
      [localStorage, sessionStorage].forEach((s) => { s.removeItem(KEY); s.removeItem(USER); });
    },

    onExpired() {
      auth.clear();
      App.ui && App.ui.toast("Session expired — please sign in again.", "info");
      location.hash = "#/login";
      App.render && App.render();
    },
  };

  App.auth = auth;
})();
