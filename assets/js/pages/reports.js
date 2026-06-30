/* ===== Reports: pick a type + range, generate (PDF link / summary) ===== */
(function () {
  const TYPES = [
    { id: "daily", label: "Daily report", icon: "calendar-days" },
    { id: "weekly", label: "Weekly report", icon: "calendar-range" },
    { id: "monthly", label: "Monthly report", icon: "calendar" },
    { id: "late", label: "Late report", icon: "clock" },
    { id: "absent", label: "Absent report", icon: "user-x" },
    { id: "department", label: "Department report", icon: "building-2" },
  ];

  App.pages.reports = {
    title: "Reports", crumb: "Reports",
    async mount(view) {
      view.innerHTML = `
        <div class="page-head"><div><h1>Reports</h1><p>Generate and export attendance reports.</p></div></div>
        <div class="kpis" style="grid-template-columns:repeat(3,1fr)">
          ${TYPES.map((t) => `
            <button class="kpi" data-report="${t.id}" style="text-align:left;cursor:pointer">
              <span class="kpi__icon tint-teal" data-icon="${t.icon}"></span>
              <div class="kpi__value" style="font-size:16px">${t.label}</div>
              <div class="kpi__label">Generate PDF / CSV / Excel</div>
            </button>`).join("")}
        </div>
        <div class="card mt-4" id="report-out" hidden><div class="card__body"></div></div>`;
      App.ui.icons(view);

      view.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-report]"); if (!b) return;
        const type = b.dataset.report;
        const out = App.ui.$("#report-out"); out.hidden = false;
        out.querySelector(".card__body").innerHTML = App.ui.skeletonRows(3);
        try {
          const r = await App.api.call("reports.generate", { type, range: "today" });
          out.querySelector(".card__body").innerHTML = `
            <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:12px">
              <div><h3 style="margin:0">${App.ui.esc(TYPES.find((t) => t.id === type).label)}</h3>
                <p class="muted" style="margin:4px 0 0">${App.ui.esc(r.summary)}</p></div>
              <div class="row">
                <a class="btn btn--primary" href="${App.ui.esc(r.url)}" ${r.url.startsWith("#") ? "" : 'target="_blank" rel="noopener"'}><span data-icon="file-down"></span> Open PDF</a>
                <button class="btn"><span data-icon="printer"></span> Print</button>
              </div>
            </div>`;
          App.ui.icons(out);
        } catch (err) {
          out.querySelector(".card__body").innerHTML = `<p class="muted">${App.ui.esc(err.message)}</p>`;
        }
      });
    },
  };
})();
