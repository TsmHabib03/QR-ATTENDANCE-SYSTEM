/* ===== Settings: org config + theme ===== */
(function () {
  App.pages.settings = {
    title: "Settings", crumb: "Settings",
    async mount(view) {
      view.innerHTML = `<div class="page-head"><div><h1>Settings</h1><p>Organization and system preferences.</p></div></div>
        <div class="card"><div class="card__body">${App.ui.skeletonRows(5)}</div></div>`;
      const { settings } = await App.api.call("settings.get", {}).catch(() => ({ settings: App.settings || {} }));
      const s = settings || {};
      view.querySelector(".card").innerHTML = `<div class="card__body"><form id="set-form">
        <div class="form-grid">
          ${row("OrgName", "Organization name", s.OrgName)}
          ${row("Timezone", "Timezone", s.Timezone)}
          ${row("GracePeriod", "Grace period (minutes)", s.GracePeriod, "number")}
          ${row("WorkingDays", "Working days", s.WorkingDays)}
        </div>
        <label class="checkbox"><input type="checkbox" name="EmailEnabled" ${s.EmailEnabled ? "checked" : ""}/> <span>Send email notifications</span></label>
        <div class="field"><label class="field__label" for="set-theme">Theme</label>
          <select class="input" id="set-theme" name="Theme" style="max-width:220px">
            <option value="light" ${s.Theme !== "dark" ? "selected" : ""}>Light</option>
            <option value="dark" ${s.Theme === "dark" ? "selected" : ""}>Dark</option>
          </select></div>
        <div class="row row--end mt-4"><button class="btn btn--primary" id="set-save" type="submit">Save settings</button></div>
      </form></div>`;

      const form = App.ui.$("#set-form");
      App.ui.$("#set-theme").addEventListener("change", (e) => App.setTheme(e.target.value));
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());
        data.EmailEnabled = form.EmailEnabled.checked;
        try {
          await App.api.call("settings.save", { settings: data });
          App.settings = { ...App.settings, ...data };
          App.applyBranding();
          App.ui.toast("Settings saved.");
        } catch (err) { App.ui.toast(err.message, "error"); }
      });
    },
  };

  const row = (name, label, val = "", type = "text") =>
    `<div class="field"><label class="field__label" for="set-${name}">${label}</label><input class="input" id="set-${name}" name="${name}" type="${type}" value="${App.ui.esc(val ?? "")}" /></div>`;
})();
