/* =========================================================================
   email.gs — GmailApp notifications. All sends go through send_() which
   respects the Settings toggle, never throws into the caller, and audits
   every delivery as 'EmailSent'. Time-driven: Email_dailySummary/Monthly.

   Every email ships a branded HTML body (emailShell_) alongside the original
   plain-text body (kept as the fallback for text-only clients). The template
   is table-based with every rule inline, no CSS variables/grid/flexbox, and
   zero <img> tags (brand mark is a styled table-cell, not a remote image) —
   required for reliable rendering across Gmail/Outlook/Apple Mail. Designed
   for light mode only: real per-client dark-mode email CSS is inconsistent
   (absent in Outlook desktop, unreliable in Gmail) and not worth the added
   QA matrix for 5 short transactional notifications.
   ========================================================================= */
var Email_ = (function () {
  function enabled_() { return String(Settings_.get('EmailEnabled')) === 'true'; }
  function org_() { return Settings_.get('OrgName') || 'Attendance System'; }

  /** Escape untrusted text (member/org names, statuses, URLs) before it goes into HTML. */
  function escHtml_(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function statusColor_(status) {
    var map = {
      Present: '#16A34A', Late: '#F59E0B', Absent: '#DC2626',
      Excused: '#6366F1', Holiday: '#0EA5E9', 'Half Day': '#8B5CF6'
    };
    return map[status] || '#475569';
  }

  /** One visual system: every email wraps its bodyHtml in this shell. */
  function emailShell_(title, bodyHtml) {
    var org = org_();
    return ''
    + '<!doctype html>'
    + '<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">'
    + '<head>'
    +   '<meta charset="utf-8">'
    +   '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
    +   '<meta http-equiv="X-UA-Compatible" content="IE=edge">'
    +   '<meta name="color-scheme" content="light dark">'
    +   '<meta name="supported-color-schemes" content="light dark">'
    +   '<title>' + escHtml_(title) + '</title>'
    +   '<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->'
    +   '<style>'
    +     'body,table,td{font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;}'
    +     'a{color:#0D9488;}'
    +     '@media (max-width:620px){.email-container{width:100%!important;}.email-px{padding-left:20px!important;padding-right:20px!important;}}'
    +   '</style>'
    + '</head>'
    + '<body style="margin:0;padding:0;background-color:#F0FDFA;-webkit-text-size-adjust:100%;text-size-adjust:100%;">'
    +   '<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F0FDFA;">&nbsp;</div>'
    +   '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F0FDFA;"><tr><td align="center" style="padding:32px 16px;">'
    +     '<table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0;">'
    +       '<tr><td class="email-px" style="padding:28px 32px 20px 32px;background-color:#FFFFFF;">'
    +         '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
    +           '<td width="36" height="36" align="center" valign="middle" bgcolor="#0D9488" style="width:36px;height:36px;background-color:#0D9488;border-radius:10px;font-family:-apple-system,\'Segoe UI\',Roboto,Arial,sans-serif;font-size:16px;font-weight:700;color:#FFFFFF;line-height:36px;">' + escHtml_(org.charAt(0).toUpperCase()) + '</td>'
    +           '<td style="width:10px;font-size:10px;line-height:1;">&nbsp;</td>'
    +           '<td valign="middle" style="font-family:-apple-system,\'Segoe UI\',Roboto,Arial,sans-serif;font-size:15px;font-weight:700;color:#134E4A;">' + escHtml_(org) + '</td>'
    +         '</tr></table>'
    +       '</td></tr>'
    +       '<tr><td style="padding:0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" style="font-size:1px;line-height:1px;background-color:#E2E8F0;">&nbsp;</td></tr></table></td></tr>'
    +       '<tr><td class="email-px" style="padding:24px 32px 8px 32px;"><h1 style="margin:0;font-family:-apple-system,\'Segoe UI\',Roboto,Arial,sans-serif;font-size:20px;line-height:28px;font-weight:700;color:#134E4A;">' + escHtml_(title) + '</h1></td></tr>'
    +       '<tr><td class="email-px" style="padding:8px 32px 32px 32px;font-family:-apple-system,\'Segoe UI\',Roboto,Arial,sans-serif;font-size:14px;line-height:22px;color:#475569;">' + bodyHtml + '</td></tr>'
    +       '<tr><td style="padding:0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" style="font-size:1px;line-height:1px;background-color:#E2E8F0;">&nbsp;</td></tr></table></td></tr>'
    +       '<tr><td class="email-px" style="padding:20px 32px 28px 32px;font-family:-apple-system,\'Segoe UI\',Roboto,Arial,sans-serif;font-size:12px;line-height:18px;color:#475569;">This is an automated message from ' + escHtml_(org) + '. Please do not reply to this email.</td></tr>'
    +     '</table>'
    +   '</td></tr></table>'
    + '</body></html>';
  }

  /** Shared "stat card" cell used by welcome/dailySummary/monthlySummary. Table-based, no divs. */
  function statCell_(value, label, color) {
    return '<td width="33%" style="padding:0;">'
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;">'
      +   '<tr><td align="center" style="padding:16px 8px 2px 8px;font-size:22px;font-weight:700;color:' + color + ';">' + escHtml_(value) + '</td></tr>'
      +   '<tr><td align="center" style="padding:0 8px 14px 8px;font-size:11px;color:#475569;">' + escHtml_(label) + '</td></tr>'
      + '</table>'
      + '</td>';
  }

  /** Single choke point: gated by the toggle, audited, failure-safe. */
  function send_(to, subject, body, htmlBody, kind, who) {
    if (!enabled_() || !to) return false;
    try {
      GmailApp.sendEmail(to, subject, body, { htmlBody: htmlBody, name: org_() });
      Audit_.log('EmailSent', who || 'system', kind + ' → ' + to);
      return true;
    } catch (e) { return false; }
  }

  function welcome(member) {
    if (!member.Email) return;
    var plain = member.FirstName + ',\n\nYou have been registered.\nMember ID: ' + member.MemberID +
      '\nDate: ' + today_() + '\n\n— ' + org_();
    var body = ''
      + '<p style="margin:0 0 20px 0;">Hi ' + escHtml_(member.FirstName) + ', your account has been created. You can now use your QR code to record attendance.</p>'
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
      +   statCell_(member.MemberID, 'Member ID', '#134E4A')
      +   '<td width="12">&nbsp;</td>'
      +   statCell_(today_(), 'Date Registered', '#134E4A')
      + '</tr></table>';
    send_(member.Email, 'Welcome to ' + org_(), plain, emailShell_('Welcome to ' + org_(), body), 'Welcome', 'system');
  }

  function scanConfirm(member, rec, type) {
    if (!member.Email) return;
    var time = type === 'Time In' ? rec.TimeIn : rec.TimeOut;
    var plain = member.FirstName + ',\n\n' + type + ' recorded.\nDate: ' + rec.Date +
      '\nTime: ' + time + '\nStatus: ' + rec.Status + '\n\n— ' + org_();
    var color = statusColor_(rec.Status);
    var body = ''
      + '<p style="margin:0 0 20px 0;">Hi ' + escHtml_(member.FirstName) + ', your ' + escHtml_(type) + ' was recorded successfully.</p>'
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E2E8F0;border-radius:10px;">'
      +   '<tr>'
      +     '<td style="padding:14px 16px;font-size:13px;color:#475569;">Date</td>'
      +     '<td align="right" style="padding:14px 16px;font-size:13px;font-weight:700;color:#134E4A;">' + escHtml_(rec.Date) + '</td>'
      +   '</tr>'
      +   '<tr>'
      +     '<td style="padding:14px 16px;font-size:13px;color:#475569;border-top:1px solid #E2E8F0;">Time</td>'
      +     '<td align="right" style="padding:14px 16px;font-size:13px;font-weight:700;color:#134E4A;border-top:1px solid #E2E8F0;">' + escHtml_(time) + '</td>'
      +   '</tr>'
      +   '<tr>'
      +     '<td style="padding:14px 16px;font-size:13px;color:#475569;border-top:1px solid #E2E8F0;">Status</td>'
      +     '<td align="right" style="padding:10px 16px;border-top:1px solid #E2E8F0;">'
      +       '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right" style="display:inline-table;"><tr>'
      +         '<td bgcolor="' + color + '" style="background-color:' + color + ';color:#FFFFFF;font-size:12px;font-weight:700;padding:4px 12px;border-radius:999px;line-height:18px;">' + escHtml_(rec.Status) + '</td>'
      +       '</tr></table>'
      +     '</td>'
      +   '</tr>'
      + '</table>';
    send_(member.Email, 'Attendance recorded — ' + type, plain, emailShell_('Attendance Recorded', body), 'AttendanceConfirm', rec.RecordedBy || 'system');
  }

  function adminEmail_() {
    var a = cachedReadAll_('Admin').filter(function (x) { return x.Role === 'Administrator' && x.Email; })[0];
    return a ? a.Email : '';
  }

  function reportReady(session, type, url) {
    var to = adminEmail_();
    var plain = 'Your ' + type + ' report is ready:\n' + url + '\n\n— ' + org_();
    var safeUrl = escHtml_(url);
    var body = ''
      + '<p style="margin:0 0 20px 0;">Your ' + escHtml_(type) + ' report has been generated and is ready to view.</p>'
      + '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
      +   '<td align="center" bgcolor="#F97316" style="background-color:#F97316;border-radius:8px;">'
      +     '<a href="' + safeUrl + '" target="_blank" style="display:inline-block;padding:12px 28px;font-family:-apple-system,\'Segoe UI\',Roboto,Arial,sans-serif;font-size:14px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:8px;">Open Report</a>'
      +   '</td>'
      + '</tr></table>'
      + '<p style="margin:20px 0 0 0;font-size:12px;color:#475569;">If the button above doesn\'t work, copy and paste this link into your browser:<br><a href="' + safeUrl + '" style="color:#0D9488;word-break:break-all;">' + safeUrl + '</a></p>';
    send_(to, org_() + ' — ' + type + ' report', plain, emailShell_(type + ' Report Ready', body), 'ReportExport', session && session.username);
  }

  function dailySummary() {
    var s = Analytics_.summary().cards;
    var plain = 'Present: ' + s.present + '\nLate: ' + s.late + '\nAbsent: ' + s.absent +
      '\nAttendance: ' + s.rate + '%\n\n— ' + org_();
    var body = ''
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
      +   statCell_(s.present, 'Present', '#16A34A')
      +   '<td width="12">&nbsp;</td>'
      +   statCell_(s.late, 'Late', '#F59E0B')
      +   '<td width="12">&nbsp;</td>'
      +   statCell_(s.absent, 'Absent', '#DC2626')
      + '</tr></table>'
      + '<p style="margin:16px 0 0 0;font-size:13px;color:#475569;">Attendance rate: <strong style="color:#134E4A;">' + escHtml_(s.rate) + '%</strong></p>';
    send_(adminEmail_(), org_() + ' — Daily summary ' + today_(), plain, emailShell_('Daily Summary — ' + today_(), body), 'DailySummary', 'system');
  }

  function monthlySummary() {
    var att = cachedReadAll_('Attendance');
    var present = att.filter(function (a) { return a.Status === 'Present'; }).length;
    var late = att.filter(function (a) { return a.Status === 'Late'; }).length;
    var absent = att.filter(function (a) { return a.Status === 'Absent'; }).length;
    var hours = att.reduce(function (t, a) { return t + (Number(a.WorkingHours) || 0); }, 0);
    var plain = 'Total Present: ' + present + '\nTotal Late: ' + late + '\nTotal Absent: ' + absent +
      '\nTotal Working Hours: ' + hours + '\n\n— ' + org_();
    var body = ''
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
      +   statCell_(present, 'Present', '#16A34A')
      +   '<td width="10">&nbsp;</td>'
      +   statCell_(late, 'Late', '#F59E0B')
      +   '<td width="10">&nbsp;</td>'
      +   statCell_(absent, 'Absent', '#DC2626')
      +   '<td width="10">&nbsp;</td>'
      +   statCell_(hours, 'Hours', '#0D9488')
      + '</tr></table>';
    send_(adminEmail_(), org_() + ' — Monthly report', plain, emailShell_('Monthly Report', body), 'MonthlyReport', 'system');
  }

  return { welcome: welcome, scanConfirm: scanConfirm, reportReady: reportReady,
           dailySummary: dailySummary, monthlySummary: monthlySummary };
})();

// Trigger entry points (must be top-level functions)
function Email_dailySummary()   { resetRequestCache_(); Email_.dailySummary(); }
function Email_monthlySummary() { resetRequestCache_(); Email_.monthlySummary(); }
