/* =========================================================================
   Code.gs — Web App entry + action router + one-time setup.
   Deploy: Deploy > New deployment > Web app
           Execute as: Me   |   Who has access: Anyone
   Request body (CORS-safe): { action, token, payload }  (Content-Type text/plain)
   ========================================================================= */

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) {}
  return route_(body.action, body.token, body.payload || {}, e);
}

function doGet(e) {
  // health check / simple readiness probe
  return json_({ ok: true, result: { status: 'alive', time: nowISO_() } });
}

function route_(action, token, payload, e) {
  try {
    // ---- public actions ----
    if (action === 'ping')  return json_({ ok: true, result: 'pong' });
    if (action === 'login') return json_({ ok: true, result: Auth_.login(payload, e) });

    // ---- authenticated actions ----
    var session = Auth_.validate(token); // throws on invalid/expired

    var handlers = {
      'logout':              function () { return Auth_.logout(token); },
      'auth.changePassword': function () { return Auth_.changePassword(session, payload); },

      'members.list':        function () { return Members_.list(payload); },
      'members.save':        function () { return Members_.save(payload, session); },
      'members.delete':      function () { return Members_.remove(payload, session); },
      'members.importCsv':   function () { return Members_.importCsv(payload, session); },

      'attendance.scan':     function () { return Attendance_.scan(payload, session); },
      'attendance.list':     function () { return Attendance_.list(payload); },
      'attendance.update':   function () { return Attendance_.update(payload, session); },

      'schedule.list':       function () { return Schedule_.list(payload); },
      'schedule.save':       function () { return Schedule_.save(payload, session); },

      'analytics.summary':   function () { return Analytics_.summary(payload); },
      'reports.generate':    function () { return Reports_.generate(payload, session); },

      'settings.get':        function () { return { settings: Settings_.all() }; },
      'settings.save':       function () { return Settings_.save(payload, session); },

      'audit.list':          function () { return Audit_.list(payload); }
    };

    var fn = handlers[action];
    if (!fn) throw new Error('Unknown action: ' + action);
    return json_({ ok: true, result: fn() });

  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/* -------------------------------------------------------------------------
   ONE-TIME SETUP — run once from the Apps Script editor.
   Creates all sheets with headers and a default admin (admin / admin123).
   CHANGE THE DEFAULT PASSWORD IMMEDIATELY after first login.
   ------------------------------------------------------------------------- */
function setup() {
  var schema = {
    Admin:     ['AdminID','Username','PasswordHash','PasswordSalt','FullName','Email','Role','Status','CreatedAt'],
    Members:   ['MemberID','EmployeeID','FirstName','MiddleName','LastName','Gender','Birthdate','Department','Course','Section','Position','Contact','Email','Address','QRCode','PhotoFileId','Status','CreatedAt','UpdatedAt'],
    Attendance:['AttendanceID','MemberID','Name','Department','Date','TimeIn','TimeOut','BreakOut','BreakIn','WorkingHours','LateMinutes','Status','Remarks','RecordedBy','CreatedAt','UpdatedAt'],
    Schedule:  ['ScheduleID','ScopeType','ScopeValue','StartTime','EndTime','GracePeriod','LateThreshold'],
    Sessions:  ['Token','AdminID','CreatedAt','ExpiresAt','UserAgent'],
    AuditLogs: ['LogID','User','Action','Description','Browser','IP','Timestamp'],
    Settings:  ['Key','Value']
  };

  var ss = SS();
  Object.keys(schema).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.clear();
    sh.getRange(1, 1, 1, schema[name].length).setValues([schema[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });

  // default settings
  var defaults = { OrgName: 'QR Attendance', Timezone: 'Asia/Manila', GracePeriod: '10',
                   WorkingDays: 'Mon-Fri', EmailEnabled: 'true', Theme: 'light' };
  Object.keys(defaults).forEach(function (k) { Settings_.set(k, defaults[k]); });

  // default admin
  var salt = newSalt_();
  append_('Admin', {
    AdminID: 'AD001', Username: 'admin', PasswordHash: hashPassword_('admin123', salt),
    PasswordSalt: salt, FullName: 'Administrator', Email: '', Role: 'Administrator',
    Status: 'Active', CreatedAt: nowISO_()
  });

  // default schedule
  append_('Schedule', { ScheduleID: 'SC001', ScopeType: 'Default', ScopeValue: '*',
    StartTime: '08:00', EndTime: '17:00', GracePeriod: 10, LateThreshold: '08:10' });

  SpreadsheetApp.getUi && SpreadsheetApp.flush();
}

/** Install daily/monthly email triggers (run once if email is desired). */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('Email_dailySummary').timeBased().atHour(18).everyDays(1).create();
  ScriptApp.newTrigger('Email_monthlySummary').timeBased().onMonthDay(1).atHour(7).create();
}
