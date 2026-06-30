/* ===== Analytics: charts + accessible data-table alternative ===== */
(function () {
  let charts = [];
  const destroy = () => { charts.forEach((c) => c.destroy()); charts = []; };

  App.pages.analytics = {
    title: "Analytics", crumb: "Analytics",
    async mount(view) {
      destroy();
      view.innerHTML = `
        <div class="page-head"><div><h1>Analytics</h1><p>Trends across the last 7 days.</p></div></div>
        <div class="grid-2">
          <div class="card"><div class="card__head"><span class="card__title">Attendance trend</span></div>
            <div class="card__body"><div class="chart-wrap" id="a-trend">${App.ui.skeletonChart()}</div></div></div>
          <div class="card"><div class="card__head"><span class="card__title">Most active departments</span></div>
            <div class="card__body"><div class="chart-wrap chart-wrap--sm" id="a-dept">${App.ui.skeletonChart()}</div></div></div>
        </div>
        <div class="card mt-4"><div class="card__head"><span class="card__title">Daily breakdown (table view)</span></div>
          <div class="card__body"><div class="table-wrap" id="a-table"></div></div></div>`;
      App.ui.icons(view);

      const { series } = await App.api.call("analytics.summary", {});
      drawTrend(series); drawDept(series); drawTable(series);
    },
  };

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
    const rows = s.labels.map((l, i) => `<tr><td>${App.ui.esc(l)}</td><td>${s.present[i]}</td><td>${s.late[i]}</td></tr>`).join("");
    App.ui.$("#a-table").innerHTML = `<table class="data"><thead><tr><th>Day</th><th>Present</th><th>Late</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
})();
