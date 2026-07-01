/* =========================================================================
   reports.gs — build a report and save it to Drive, return a shareable URL.
   Produces a CSV (works everywhere). Swap to a Doc->PDF export for branded PDFs.
   ========================================================================= */
var Reports_ = (function () {

  function folder_() {
    var name = 'QR-Attendance Reports';
    var it = DriveApp.getFoldersByName(name);
    return it.hasNext() ? it.next() : DriveApp.createFolder(name);
  }

  function rowsFor_(type) {
    var att = cachedReadAll_('Attendance');
    var date = today_();
    switch (type) {
      case 'late':    return att.filter(function (a) { return a.Status === 'Late'; });
      case 'absent':  return att.filter(function (a) { return a.Status === 'Absent'; });
      case 'weekly':  return lastNDays_(att, 7);
      case 'monthly': return lastNDays_(att, 30);
      case 'department':
      case 'daily':
      default:        return att.filter(function (a) { return dstr_(a.Date) === date; });
    }
  }

  function lastNDays_(att, n) {
    var cutoff = new Date(); cutoff.setDate(cutoff.getDate() - n);
    return att.filter(function (a) { return new Date(a.Date) >= cutoff; });
  }

  function generate(payload, session) {
    var type = payload.type || 'daily';
    var rows = rowsFor_(type);
    var cols = ['Date','Name','Department','TimeIn','TimeOut','WorkingHours','LateMinutes','Status'];
    var csv = [cols.join(',')].concat(rows.map(function (r) {
      return cols.map(function (c) { return '"' + String(r[c] == null ? '' : r[c]).replace(/"/g, '""') + '"'; }).join(',');
    })).join('\n');

    var fileName = type + '-report-' + today_() + '.csv';
    var file = folder_().createFile(fileName, csv, MimeType.CSV);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    Audit_.log('ReportGenerate', session.username, type + ' (' + rows.length + ' rows)');
    try { if (Settings_.get('EmailEnabled') === 'true') Email_.reportReady(session, type, file.getUrl()); } catch (e) {}

    return { url: file.getUrl(), summary: 'Generated ' + type + ' report — ' + rows.length + ' records.' };
  }

  return { generate: generate };
})();
