/* =========================================================================
   analytics.gs — dashboard cards + 7-day series + department breakdown.
   ========================================================================= */
var Analytics_ = (function () {

  function summary() {
    var members = readAll_('Members').filter(function (m) { return m.Status === 'Active'; });
    var att = readAll_('Attendance');
    var date = today_();
    var todayRows = att.filter(function (a) { return String(a.Date) === date; });

    var present = todayRows.filter(function (r) { return r.Status === 'Present'; }).length;
    var late = todayRows.filter(function (r) { return r.Status === 'Late'; }).length;
    var marked = todayRows.length;
    var absent = Math.max(members.length - marked, 0);
    var rate = members.length ? Math.round(((present + late) / members.length) * 100) : 0;

    var labels = [], pSeries = [], lSeries = [];
    for (var d = 6; d >= 0; d--) {
      var dt = new Date(); dt.setDate(dt.getDate() - d);
      var iso = Utilities.formatDate(dt, tz_(), 'yyyy-MM-dd');
      labels.push(Utilities.formatDate(dt, tz_(), 'EEE'));
      var rows = att.filter(function (a) { return String(a.Date) === iso; });
      pSeries.push(rows.filter(function (r) { return r.Status === 'Present'; }).length);
      lSeries.push(rows.filter(function (r) { return r.Status === 'Late'; }).length);
    }

    var depts = {};
    todayRows.forEach(function (r) { depts[r.Department] = (depts[r.Department] || 0) + 1; });
    var byDept = Object.keys(depts).map(function (k) { return { dept: k, count: depts[k] }; })
      .sort(function (a, b) { return b.count - a.count; });

    return {
      cards: { total: members.length, present: present, late: late, absent: absent, rate: rate },
      series: { labels: labels, present: pSeries, late: lSeries, byDept: byDept }
    };
  }

  return { summary: summary };
})();
