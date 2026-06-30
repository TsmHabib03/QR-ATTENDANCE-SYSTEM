/* ===== Login screen wiring (separate full-screen view, not a router page) ===== */
(function () {
  let wired = false;
  App.login = {
    wire() {
      if (wired) return; wired = true;
      const form = App.ui.$("#login-form");
      const submit = App.ui.$("#login-submit");
      const label = submit.querySelector(".btn__label");
      const spin = submit.querySelector(".spinner");

      const setError = (name, msg) => {
        const node = App.ui.$(`[data-error-for="${name}"]`);
        if (node) node.textContent = msg || "";
      };

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        setError("username", ""); setError("password", "");
        const username = App.ui.$("#login-username").value.trim();
        const password = App.ui.$("#login-password").value;
        const remember = App.ui.$("#login-remember").checked;

        let ok = true;
        if (!username) { setError("username", "Username is required."); ok = false; }
        if (!password) { setError("password", "Password is required."); ok = false; }
        if (!ok) return;

        submit.disabled = true; label.textContent = "Signing in…"; spin.hidden = false;
        try {
          await App.auth.login({ username, password, remember });
          App.ui.toast("Welcome back!");
          location.hash = "#/dashboard";
          App.render();
        } catch (err) {
          setError("password", err.message || "Sign in failed.");
        } finally {
          submit.disabled = false; label.textContent = "Sign in"; spin.hidden = true;
        }
      });
    },
  };
})();
