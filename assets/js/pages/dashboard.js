/* ===== Dashboard: KPI cards + charts, live-refreshing on new attendance ===== */
(function () {
  let charts = [], unsub = null, alive = false;
  const destroy = () => { charts.forEach((c) => c.destroy()); charts = []; };

  App.pages.dashboard = {
    title: "Dashboard", crumb: "Dashboard",
    async mount(view) {
      alive = true;
      destroy();
      view.innerHTML = `
        <div class="page-head">
          <div><h1>Dashboard</h1><p>Today at a glance — ${new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p></div>
          <div class="row">
            <button class="btn" id="dash-manual"><span data-icon="clipboard-pen"></span> Manual entry</button>
            <a class="btn btn--cta" href="#/scanner"><span data-icon="scan-line"></span> Scan attendance</a>
          </div>
        </div>
        <div id="kpis">${App.ui.skeletonKpis()}</div>
        <div class="grid-2 mt-4">
          <div class="card"><div class="card__head"><span class="card__title">Attendance — last 7 days</span></div>
            <div class="card__body"><div class="chart-wrap" id="c-trend">${App.ui.skeletonChart()}</div></div></div>
          <div class="card"><div class="card__head"><span class="card__title">By department (today)</span></div>
            <div class="card__body"><div class="chart-wrap chart-wrap--sm" id="c-dept">${App.ui.skeletonChart()}</div></div></div>
        </div>`;
      App.ui.icons(view);

      App.ui.$("#dash-manual").addEventListener("click", () => App.manualAttendance && App.manualAttendance());
      await load();

      // Live-refresh KPIs/charts whenever a scan or manual entry happens.
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
    renderKpis(data.cards);
    renderTrend(data.series);
    renderDept(data.series);
    App.ui.icons(App.ui.$("#view"));
  }

  function renderKpis(c) {
    const cards = [
      { label: "Total Members", value: c.total, icon: "users", tint: "tint-teal" },
      { label: "Present Today", value: c.present, icon: "user-check", tint: "tint-green" },
      { label: "Late Today", value: c.late, icon: "clock", tint: "tint-amber" },
      { label: "Absent Today", value: c.absent, icon: "user-x", tint: "tint-red" },
      { label: "Attendance Rate", value: c.rate, suffix: "%", icon: "trending-up", tint: "tint-blue" },
    ];
    App.ui.$("#kpis").outerHTML = `<div class="kpis" id="kpis">${cards.map((k) => `
      <div class="kpi">
        <span class="kpi__icon ${k.tint}" data-icon="${k.icon}"></span>
        <div class="kpi__label">${k.label}</div>
        <div class="kpi__value">${k.value}${k.suffix ? `<small>${k.suffix}</small>` : ""}</div>
      </div>`).join("")}</div>`;
  }

  const gridColor = () => getComputedStyle(document.documentElement).getPropertyValue("--border").trim() || "#E2E8F0";

  function renderTrend(s) {
    const host = App.ui.$("#c-trend"); host.innerHTML = `<canvas></canvas>`;
    charts.push(new Chart(host.querySelector("canvas"), {
      type: "line",
      data: {
        labels: s.labels,
        datasets: [
          { label: "Present", data: s.present, borderColor: "#0D9488", backgroundColor: "rgba(13,148,136,.12)", fill: true, tension: .35, borderWidth: 2 },
          { label: "Late", data: s.late, borderColor: "#F59E0B", backgroundColor: "rgba(245,158,11,.10)", fill: true, tension: .35, borderWidth: 2 },
        ],
      },
      options: chartOpts(),
    }));
  }

  function renderDept(s) {
    const host = App.ui.$("#c-dept"); host.innerHTML = `<canvas></canvas>`;
    charts.push(new Chart(host.querySelector("canvas"), {
      type: "bar",
      data: { labels: s.byDept.map((d) => d.dept), datasets: [{ label: "Present", data: s.byDept.map((d) => d.count), backgroundColor: "#14B8A6", borderRadius: 6 }] },
      options: chartOpts(),
    }));
  }

  function chartOpts() {
    return {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { boxWidth: 12, font: { family: "Plus Jakarta Sans" } } } },
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: gridColor() } } },
      animation: { duration: 280 },
    };
  }
})();
