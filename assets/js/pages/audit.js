/* ===== Audit log: activity table with an action filter ===== */
(function () {
  const ICON = {
    Login: "log-in", Logout: "log-out", LoginFailed: "shield-alert",
    Scan: "scan-line", ManualAttendance: "clipboard-pen", AttendanceEdit: "pencil",
    AttendanceDelete: "trash-2", ScheduleChange: "calendar-clock",
    MemberCreate: "user-plus", MemberUpdate: "user-cog", MemberDelete: "user-x",
    ReportGenerate: "file-text", EmailSent: "mail", SettingsUpdate: "settings",
    ChangePassword: "key-round",
  };

  App.pages.audit = {
    title: "Audit log", crumb: "Audit log",
    async mount(view) {
      view.innerHTML = `
        <div class="page-head">
          <div><h1>Audit log</h1><p>Every sensitive action, newest first.</p></div>
          <select class="input" id="a-filter" style="width:auto"><option value="">All actions</option></select>
        </div>
        <div id="a-table"><div class="card"><div class="card__body">${App.ui.skeletonRows(8)}</div></div></div>`;
      App.ui.icons(view);

      const mount = App.ui.$("#a-table");
      const draw = (rows) => {
        App.ui.dataTable(mount, {
          rows, pageSize: 15,
          searchKeys: ["User", "Action", "Description"],
          empty: "No activity recorded yet.",
          columns: [
            { key: "Timestamp", label: "When", render: (r) => App.ui.esc(fmt(r.Timestamp)) },
            { key: "Action", label: "Action", render: (r) => `<span class="row" style="gap:6px"><span data-icon="${ICON[r.Action] || "activity"}"></span>${App.ui.esc(r.Action)}</span>` },
            { key: "User", label: "User" },
            { key: "Description", label: "Details", render: (r) => App.ui.esc(r.Description || "") },
          ],
        });
        App.ui.icons(mount);
      };
      const load = async (action) => {
        mount.innerHTML = `<div class="card"><div class="card__body">${App.ui.skeletonRows(8)}</div></div>`;
        const { rows } = await App.api.call("audit.list", action ? { action } : {});
        draw(rows);
        return rows;
      };

      const rows = await load("");
      const sel = App.ui.$("#a-filter");
      [...new Set(rows.map((r) => r.Action))].sort().forEach((a) => sel.appendChild(App.ui.el("option", { value: a }, a)));
      sel.addEventListener("change", (e) => load(e.target.value));
    },
  };

  function fmt(ts) { const d = new Date(ts); return isNaN(d) ? String(ts || "") : d.toLocaleString(); }
})();
