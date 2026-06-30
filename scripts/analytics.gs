/* =========================================================================
   analytics.gs — dashboard cards, rates, 7-day trend, weekly/monthly rollups,
   department breakdown. Reads are cached (cachedReadAll_) and date-robust
   (dstr_ normalizes Sheet Date objects or text alike).
   ========================================================================= */
var Analytics_ = (function () {

  function countStatus_(rows, s) { return rows.filter(function (r) { return r.Status === s; }).length; }
  function pct_(n, d) { return d ? Math.round((n / d) * 100) : 0; }

  function rangeStats_(att, memberCount, n) {
    var cutoff = new Date(); cutoff.setDate(cutoff.getDate() - (n - 1));
    var iso = Utilities.formatDate(cutoff, tz_(), 'yyyy-MM-dd');
    var rows = att.filter(function (a) { return dstr_(a.Date) >= iso; });
    var present = countStatus_(rows, 'Present');
    var late = countStatus_(rows, 'Late');
    var absent = countStatus_(rows, 'Absent');
    var hours = rows.reduce(function (t, a) { return t + (Number(a.WorkingHours) || 0); }, 0);
    var possible = memberCount * n;
    return {
      days: n, present: present, late: late, absent: absent,
      hours: Math.round(hours * 10) / 10,
      presentRate: pct_(present, possible), lateRate: pct_(late, possible)
    };
  }

  function summary() {
    var members = cachedReadAll_('Members').filter(function (m) { return m.Status === 'Active'; });
    var att = cachedReadAll_('Attendance');
    var date = today_();
    var todayRows = att.filter(function (a) { return dstr_(a.Date) === date; });

    var present = countStatus_(todayRows, 'Present');
    var late = countStatus_(todayRows, 'Late');
    var halfday = countStatus_(todayRows, 'Half Day');
    var marked = todayRows.length;
    var absent = Math.max(members.length - marked, 0);
    var attended = present + late + halfday;
    var rate = pct_(attended, members.length);

    // 7-day trend
    var labels = [], pSeries = [], lSeries = [], aSeries = [];
    for (var d = 6; d >= 0; d--) {
      var dt = new Date(); dt.setDate(dt.getDate() - d);
      var iso = Utilities.formatDate(dt, tz_(), 'yyyy-MM-dd');
      labels.push(Utilities.formatDate(dt, tz_(), 'EEE'));
      var rows = att.filter(function (a) { return dstr_(a.Date) === iso; });
      pSeries.push(countStatus_(rows, 'Present'));
      lSeries.push(countStatus_(rows, 'Late'));
      aSeries.push(Math.max(members.length - rows.length, 0));
    }

    var depts = {};
    todayRows.forEach(function (r) { depts[r.Department || '—'] = (depts[r.Department || '—'] || 0) + 1; });
    var byDept = Object.keys(depts).map(function (k) { return { dept: k, count: depts[k] }; })
      .sort(function (a, b) { return b.count - a.count; });

    return {
      cards: {
        total: members.length, present: present, late: late, absent: absent, rate: rate,
        presentRate: pct_(present, members.length),
        lateRate: pct_(late, members.length),
        absentRate: pct_(absent, members.length)
      },
      week: rangeStats_(att, members.length, 7),
      month: rangeStats_(att, members.length, 30),
      series: { labels: labels, present: pSeries, late: lSeries, absent: aSeries, byDept: byDept }
    };
  }

  return { summary: summary };
})();
