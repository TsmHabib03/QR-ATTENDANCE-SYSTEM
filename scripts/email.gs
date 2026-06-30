/* =========================================================================
   email.gs — GmailApp notifications. All wrapped so failures never block scans.
   Time-driven entry points: Email_dailySummary / Email_monthlySummary.
   ========================================================================= */
var Email_ = (function () {
  function enabled_() { return Settings_.get('EmailEnabled') === 'true'; }
  function org_() { return Settings_.get('OrgName') || 'Attendance System'; }

  function welcome(member) {
    if (!enabled_() || !member.Email) return;
    GmailApp.sendEmail(member.Email, 'Welcome to ' + org_(),
      member.FirstName + ',\n\nYou have been registered.\nMember ID: ' + member.MemberID +
      '\nDate: ' + today_() + '\n\n— ' + org_());
  }

  function scanConfirm(member, rec, type) {
    if (!enabled_() || !member.Email) return;
    GmailApp.sendEmail(member.Email, 'Attendance recorded — ' + type,
      member.FirstName + ',\n\n' + type + ' recorded.\nDate: ' + rec.Date +
      '\nTime: ' + (type === 'Time In' ? rec.TimeIn : rec.TimeOut) +
      '\nStatus: ' + rec.Status + '\n\n— ' + org_());
  }

  function adminEmail_() {
    var a = readAll_('Admin').filter(function (x) { return x.Role === 'Administrator' && x.Email; })[0];
    return a ? a.Email : '';
  }

  function reportReady(session, type, url) {
    var to = adminEmail_(); if (!to) return;
    GmailApp.sendEmail(to, org_() + ' — ' + type + ' report',
      'Your ' + type + ' report is ready:\n' + url + '\n\n— ' + org_());
  }

  function dailySummary() {
    if (!enabled_()) return;
    var to = adminEmail_(); if (!to) return;
    var s = Analytics_.summary().cards;
    GmailApp.sendEmail(to, org_() + ' — Daily summary ' + today_(),
      'Present: ' + s.present + '\nLate: ' + s.late + '\nAbsent: ' + s.absent +
      '\nAttendance: ' + s.rate + '%\n\n— ' + org_());
  }

  function monthlySummary() {
    if (!enabled_()) return;
    var to = adminEmail_(); if (!to) return;
    var att = readAll_('Attendance');
    var present = att.filter(function (a) { return a.Status === 'Present'; }).length;
    var late = att.filter(function (a) { return a.Status === 'Late'; }).length;
    var absent = att.filter(function (a) { return a.Status === 'Absent'; }).length;
    var hours = att.reduce(function (t, a) { return t + (Number(a.WorkingHours) || 0); }, 0);
    GmailApp.sendEmail(to, org_() + ' — Monthly report',
      'Total Present: ' + present + '\nTotal Late: ' + late + '\nTotal Absent: ' + absent +
      '\nTotal Working Hours: ' + hours + '\n\n— ' + org_());
  }

  return { welcome: welcome, scanConfirm: scanConfirm, reportReady: reportReady,
           dailySummary: dailySummary, monthlySummary: monthlySummary };
})();

// Trigger entry points (must be top-level functions)
function Email_dailySummary()   { Email_.dailySummary(); }
function Email_monthlySummary() { Email_.monthlySummary(); }
