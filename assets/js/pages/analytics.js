/* ===== Analytics: rate KPIs + charts + accessible data-table alternative ===== */
(function () {
  let charts = [], unsub = null, alive = false;
  const destroy = () => { charts.forEach((c) => c.destroy()); charts = []; };

  App.pages.analytics = {
    title: "Analytics", crumb: "Analytics",
    async mount(view) {
      alive = true;
      destroy();
      view.innerHTML = `
        <div class="page-head"><div><h1>Analytics</h1><p>Rates and trends across recent days.</p></div></div>
        <div id="a-kpis">${App.ui.skeletonKpis(4)}</div>
        <div class="grid-2 mt-4">
          <div class="card"><div class="card__head"><span class="card__title">Attendance trend (7 days)</span></div>
            <div class="card__body"><div class="chart-wrap" id="a-trend">${App.ui.skeletonChart()}</div></div></div>
          <div class="card"><div class="card__head"><span class="card__title">Most active departments</span></div>
            <div class="card__body"><div class="chart-wrap chart-wrap--sm" id="a-dept">${App.ui.skeletonChart()}</div></div></div>
        </div>
        <div class="card mt-4"><div class="card__head"><span class="card__title">Daily breakdown (table view)</span></div>
          <div class="card__body"><div class="table-wrap" id="a-table"></div></div></div>`;
      App.ui.icons(view);

      await load();
      if (!unsub) unsub = App.bus.on("attendance:changed", () => { if (alive) load(); });
    },
    onLeave() {
      alive = false; // set first: a load() suspended mid-await must see this even if unsub was never assigned
      destroy();
      if (unsub) { unsub(); unsub = null; }
    },
  };

  async function load() {
    destroy();
    const [data] = await Promise.all([
      App.api.call("analytics.summary", {}, { fresh: true }),
      window.Chart ? Promise.resolve() : App.loadScript(App.CDN.CHART),
    ]);
    // Lazy-loading Chart.js can make this await noticeably longer than the
    // old eager-script version — if the user navigated away before it
    // resolved, `alive` was already flipped false by onLeave() (which can
    // run mid-await, before unsub is even assigned) — bail instead of
    // rendering into a page that's no longer mounted.
    if (!alive) return;
    renderKpis(data);
    drawTrend(data.series);
    drawDept(data.series);
    drawTable(data.series);
    App.ui.icons(App.ui.$("#view"));
  }

  function renderKpis(d) {
    const w = d.week || {}, m = d.month || {}, c = d.cards || {};
    const cards = [
      { label: "Present rate (today)", value: c.presentRate ?? 0, suffix: "%", icon: "user-check", tint: "tint-green" },
      { label: "Late rate (7 days)", value: w.lateRate ?? 0, suffix: "%", icon: "clock", tint: "tint-amber" },
      { label: "Present rate (30 days)", value: m.presentRate ?? 0, suffix: "%", icon: "trending-up", tint: "tint-blue" },
      { label: "Hours logged (30 days)", value: m.hours ?? 0, icon: "timer", tint: "tint-teal" },
    ];
    App.ui.$("#a-kpis").outerHTML = `<div class="kpis" id="a-kpis" style="grid-template-columns:repeat(4,1fr)">${cards.map((k) => `
      <div class="kpi">
        <span class="kpi__icon ${k.tint}" data-icon="${k.icon}"></span>
        <div class="kpi__label">${k.label}</div>
        <div class="kpi__value">${k.value}${k.suffix ? `<small>${k.suffix}</small>` : ""}</div>
      </div>`).join("")}</div>`;
  }

  const grid = () => getComputedStyle(document.documentElement).getPropertyValue("--border").trim() || "#E2E8F0";
  const baseOpts = () => ({ responsive: true, maintainAspectRatio: false, animation: { duration: 280 },
    plugins: { legend: { labels: { font: { family: "Plus Jakarta Sans" }, boxWidth: 12 } } },
    scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: grid() } } } });

  function drawTrend(s) {
    const host = App.ui.$("#a-trend"); host.innerHTML = "<canvas></canvas>";
    charts.push(new Chart(host.querySelector("canvas"), {
      type: "line",
      data: { labels: s.labels, datasets: [
        { label: "Present", data: s.present, borderColor: "#0D9488", backgroundColor: "rgba(13,148,136,.12)", fill: true, tension: .35, borderWidth: 2 },
        { label: "Late", data: s.late, borderColor: "#F59E0B", backgroundColor: "rgba(245,158,11,.10)", fill: true, tension: .35, borderWidth: 2 },
        { label: "Absent", data: s.absent || [], borderColor: "#EF4444", backgroundColor: "rgba(239,68,68,.08)", fill: true, tension: .35, borderWidth: 2 },
      ] }, options: baseOpts() }));
  }
  function drawDept(s) {
    const host = App.ui.$("#a-dept"); host.innerHTML = "<canvas></canvas>";
    charts.push(new Chart(host.querySelector("canvas"), {
      type: "bar",
      data: { labels: s.byDept.map((d) => d.dept), datasets: [{ label: "Present", data: s.byDept.map((d) => d.count), backgroundColor: "#14B8A6", borderRadius: 6 }] },
      options: baseOpts() }));
  }
  function drawTable(s) {
    const rows = s.labels.map((l, i) => `<tr><td data-label="Day">${App.ui.esc(l)}</td><td data-label="Present">${s.present[i]}</td><td data-label="Late">${s.late[i]}</td><td data-label="Absent">${(s.absent || [])[i] ?? 0}</td></tr>`).join("");
    App.ui.$("#a-table").innerHTML = `<table class="data"><thead><tr><th>Day</th><th>Present</th><th>Late</th><th>Absent</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
})();
