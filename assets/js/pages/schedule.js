/* ===== Schedules: list, create/edit, delete, activate/deactivate =====
   The resolved schedule drives all attendance validation (Late / Half-Day /
   Holiday). Members can be assigned a schedule directly (Members page) or
   matched by Position / Section / Department / Default scope. ================ */
(function () {
  App.pages.schedule = {
    title: "Schedules", crumb: "Schedules",
    async mount(view) {
      view.innerHTML = `
        <div class="page-head">
          <div><h1>Schedules</h1><p>Define work hours and rules, then assign them to members.</p></div>
          <button class="btn btn--primary" id="s-add"><span data-icon="plus"></span> New schedule</button>
        </div>
        <div id="s-table"><div class="card"><div class="card__body">${App.ui.skeletonRows(6)}</div></div></div>`;
      App.ui.icons(view);

      const { rows } = await App.api.call("schedule.list", {});
      const mount = App.ui.$("#s-table");
      App.ui.dataTable(mount, {
        rows, pageSize: 10,
        searchKeys: ["ScheduleName", "ScopeType", "ScopeValue", "WorkingDays", "Status"],
        empty: "Create your first schedule to start validating attendance.",
        columns: [
          { key: "ScheduleName", label: "Name", render: (r) => `<strong>${App.ui.esc(r.ScheduleName || "—")}</strong>` },
          { key: "ScopeType", label: "Applies to", render: (r) => App.ui.esc(scopeText(r)) },
          { key: "StartTime", label: "Hours", sortable: false, render: (r) => `${App.ui.esc(r.StartTime || "—")}–${App.ui.esc(r.EndTime || "—")}` },
          { key: "GracePeriod", label: "Grace", render: (r) => (r.GracePeriod ?? 0) + "m" },
          { key: "WorkingDays", label: "Days", render: (r) => App.ui.esc(r.WorkingDays || "—") },
          { key: "Status", label: "Status", render: (r) => `<span class="badge ${r.Status === "Active" ? "st-present" : "badge--soft"}">${App.ui.esc(r.Status || "Active")}</span>` },
          { key: "actions", label: "", sortable: false, className: "actions", render: (r) => `
            <button class="iconbtn" data-toggle="${r.ScheduleID}" title="${r.Status === "Active" ? "Deactivate" : "Activate"}"><span data-icon="${r.Status === "Active" ? "toggle-right" : "toggle-left"}"></span></button>
            <button class="iconbtn" data-edit="${r.ScheduleID}" title="Edit"><span data-icon="pencil"></span></button>
            <button class="iconbtn" data-del="${r.ScheduleID}" title="Delete"><span data-icon="trash-2"></span></button>` },
        ],
      });
      App.ui.icons(mount);

      mount.addEventListener("click", async (e) => {
        const edit = e.target.closest("[data-edit]");
        const del = e.target.closest("[data-del]");
        const tog = e.target.closest("[data-toggle]");
        if (edit) return openForm(rows.find((r) => r.ScheduleID === edit.dataset.edit));
        if (tog) {
          await App.api.call("schedule.toggle", { scheduleId: tog.dataset.toggle });
          App.ui.toast("Schedule updated.");
          return App.pages.schedule.mount(view);
        }
        if (del) {
          const s = rows.find((r) => r.ScheduleID === del.dataset.del);
          const ok = await App.ui.confirm({ title: "Delete schedule?", text: `${s.ScheduleName} will be removed.`, confirmButtonText: "Delete" });
          if (!ok) return;
          await App.api.call("schedule.delete", { scheduleId: s.ScheduleID });
          App.ui.toast("Schedule deleted.");
          App.pages.schedule.mount(view);
        }
      });

      App.ui.$("#s-add").addEventListener("click", () => openForm(null));
    },
  };

  function scopeText(r) {
    if (!r.ScopeType || r.ScopeType === "Default") return "Everyone (default)";
    return `${r.ScopeType}: ${r.ScopeValue || "—"}`;
  }

  function openForm(sched) {
    const s = sched || {};
    const body = App.ui.el("div");
    body.innerHTML = `
      <form id="s-form">
        <div class="form-grid">
          ${App.ui.input("ScheduleName", "Schedule name", s.ScheduleName, { req: true })}
          ${App.ui.select("Status", "Status", s.Status || "Active", ["Active", "Inactive"])}
          ${App.ui.select("ScopeType", "Applies to", s.ScopeType || "Default", [
            { value: "Default", label: "Everyone (default)" }, { value: "Department", label: "Department" },
            { value: "Section", label: "Section" }, { value: "Position", label: "Position" }, { value: "Employee", label: "Specific member (ID)" }])}
          ${App.ui.input("ScopeValue", "Scope value", s.ScopeValue, { attrs: 'placeholder="IT · Section A · M001 · * for all"' })}
          ${App.ui.input("StartTime", "Start time", s.StartTime || "08:00", { req: true, type: "time" })}
          ${App.ui.input("EndTime", "End time", s.EndTime || "17:00", { req: true, type: "time" })}
          ${App.ui.input("GracePeriod", "Grace period (min)", s.GracePeriod ?? 10, { type: "number" })}
          ${App.ui.input("LateAfter", "Late after", s.LateAfter, { type: "time" })}
          ${App.ui.input("HalfDayAfter", "Half-day after", s.HalfDayAfter, { type: "time" })}
          ${App.ui.input("WorkingDays", "Working days", s.WorkingDays || "Mon-Fri", { attrs: 'placeholder="Mon-Fri or Mon,Wed,Fri"' })}
          ${App.ui.input("EarliestTimeIn", "Earliest time in", s.EarliestTimeIn, { type: "time" })}
          ${App.ui.input("LatestTimeOut", "Latest time out", s.LatestTimeOut, { type: "time" })}
        </div>
        <p class="muted" style="font-size:13px;margin-top:8px">Late = arrival after <strong>Late after</strong> (or Start + Grace if left blank). Non-working days are marked Holiday with no late penalty.</p>
      </form>`;
    const footer = App.ui.el("div", { class: "row row--end", html: `
      <button class="btn" data-cancel>Cancel</button>
      <button class="btn btn--primary" id="s-save"><span class="btn__label">Save schedule</span></button>` });

    const { close, modal } = App.ui.modal({ title: sched ? "Edit schedule" : "New schedule", body, footer });
    footer.querySelector("[data-cancel]").addEventListener("click", close);
    footer.querySelector("#s-save").addEventListener("click", async () => {
      const data = Object.fromEntries(new FormData(modal.querySelector("#s-form")).entries());
      if (!data.ScheduleName) return App.ui.toast("Schedule name is required.", "error");
      const btn = footer.querySelector("#s-save"); App.ui.busy(btn, true);
      try {
        await App.api.call("schedule.save", { schedule: { ...s, ...data } });
        App.ui.toast("Schedule saved.");
        close();
        App.pages.schedule.mount(App.ui.$("#view"));
      } catch (err) { App.ui.toast(err.message, "error"); App.ui.busy(btn, false); }
    });
  }
})();
