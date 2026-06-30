/* =========================================================================
   email.gs — GmailApp notifications. All sends go through send_() which
   respects the Settings toggle, never throws into the caller, and audits
   every delivery as 'EmailSent'. Time-driven: Email_dailySummary/Monthly.
   ========================================================================= */
var Email_ = (function () {
  function enabled_() { return String(Settings_.get('EmailEnabled')) === 'true'; }
  function org_() { return Settings_.get('OrgName') || 'Attendance System'; }

  /** Single choke point: gated by the toggle, audited, failure-safe. */
  function send_(to, subject, body, kind, who) {
    if (!enabled_() || !to) return false;
    try {
      GmailApp.sendEmail(to, subject, body);
      Audit_.log('EmailSent', who || 'system', kind + ' → ' + to);
      return true;
    } catch (e) { return false; }
  }

  function welcome(member) {
    if (!member.Email) return;
    send_(member.Email, 'Welcome to ' + org_(),
      member.FirstName + ',\n\nYou have been registered.\nMember ID: ' + member.MemberID +
      '\nDate: ' + today_() + '\n\n— ' + org_(), 'Welcome', 'system');
  }

  function scanConfirm(member, rec, type) {
    if (!member.Email) return;
    send_(member.Email, 'Attendance recorded — ' + type,
      member.FirstName + ',\n\n' + type + ' recorded.\nDate: ' + rec.Date +
      '\nTime: ' + (type === 'Time In' ? rec.TimeIn : rec.TimeOut) +
      '\nStatus: ' + rec.Status + '\n\n— ' + org_(), 'AttendanceConfirm', rec.RecordedBy || 'system');
  }

  function adminEmail_() {
    var a = cachedReadAll_('Admin').filter(function (x) { return x.Role === 'Administrator' && x.Email; })[0];
    return a ? a.Email : '';
  }

  function reportReady(session, type, url) {
    send_(adminEmail_(), org_() + ' — ' + type + ' report',
      'Your ' + type + ' report is ready:\n' + url + '\n\n— ' + org_(),
      'ReportExport', session && session.username);
  }

  function dailySummary() {
    var s = Analytics_.summary().cards;
    send_(adminEmail_(), org_() + ' — Daily summary ' + today_(),
      'Present: ' + s.present + '\nLate: ' + s.late + '\nAbsent: ' + s.absent +
      '\nAttendance: ' + s.rate + '%\n\n— ' + org_(), 'DailySummary', 'system');
  }

  function monthlySummary() {
    var att = cachedReadAll_('Attendance');
    var present = att.filter(function (a) { return a.Status === 'Present'; }).length;
    var late = att.filter(function (a) { return a.Status === 'Late'; }).length;
    var absent = att.filter(function (a) { return a.Status === 'Absent'; }).length;
    var hours = att.reduce(function (t, a) { return t + (Number(a.WorkingHours) || 0); }, 0);
    send_(adminEmail_(), org_() + ' — Monthly report',
      'Total Present: ' + present + '\nTotal Late: ' + late + '\nTotal Absent: ' + absent +
      '\nTotal Working Hours: ' + hours + '\n\n— ' + org_(), 'MonthlyReport', 'system');
  }

  return { welcome: welcome, scanConfirm: scanConfirm, reportReady: reportReady,
           dailySummary: dailySummary, monthlySummary: monthlySummary };
})();

// Trigger entry points (must be top-level functions)
function Email_dailySummary()   { resetRequestCache_(); Email_.dailySummary(); }
function Email_monthlySummary() { resetRequestCache_(); Email_.monthlySummary(); }
