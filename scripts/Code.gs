/* =========================================================================
   Code.gs — Web App entry + action router + one-time setup.
   Deploy: Deploy > New deployment > Web app
           Execute as: Me   |   Who has access: Anyone
   Request body (CORS-safe): { action, token, payload }  (Content-Type text/plain)
   ========================================================================= */

function doPost(e) {
  resetRequestCache_();                 // fresh read cache per request
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) {}
  return route_(body.action, body.token, body.payload || {}, e);
}

function doGet(e) {
  resetRequestCache_();
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
    checkRateLimit_(token); // soft abuse guard — see utils.gs

    var handlers = {
      'logout':              function () { return Auth_.logout(token); },
      'auth.changePassword': function () { return Auth_.changePassword(session, payload); },

      'members.list':        function () { return Members_.list(payload); },
      'members.save':        function () { return Members_.save(payload, session); },
      'members.delete':      function () { return Members_.remove(payload, session); },
      'members.importCsv':   function () { return Members_.importCsv(payload, session); },

      'attendance.scan':     function () { return Attendance_.scan(payload, session); },
      'attendance.manual':   function () { return Attendance_.manual(payload, session); },
      'attendance.list':     function () { return Attendance_.list(payload); },
      'attendance.update':   function () { return Attendance_.update(payload, session); },
      'attendance.delete':   function () { return Attendance_.remove(payload, session); },

      'schedule.list':       function () { return Schedule_.list(payload); },
      'schedule.save':       function () { return Schedule_.save(payload, session); },
      'schedule.delete':     function () { return Schedule_.remove(payload, session); },
      'schedule.toggle':     function () { return Schedule_.toggle(payload, session); },

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
   ONE-TIME / RE-RUNNABLE SETUP — run once from the Apps Script editor.
   Idempotent & non-destructive: ensures every sheet + header exists WITHOUT
   wiping existing data rows, so it doubles as a schema migration. Seeds the
   default admin (admin / admin123), settings, and a default schedule only
   when they are missing. CHANGE THE DEFAULT PASSWORD after first login.
   ------------------------------------------------------------------------- */
function setup() {
  try {
    resetRequestCache_();
    var ss = SS();
    Logger.log('Setup for: ' + ss.getName());

    var schema = {
      Admin:     ['AdminID','Username','PasswordHash','PasswordSalt','FullName','Email','Role','Status','CreatedAt'],
      Members:   ['MemberID','EmployeeID','FirstName','MiddleName','LastName','Gender','Birthdate','Department','Course','Section','Position','Contact','Email','Address','QRCode','PhotoFileId','Status','CreatedAt','UpdatedAt','ScheduleID'],
      Attendance:['AttendanceID','MemberID','Name','Department','Date','TimeIn','TimeOut','BreakOut','BreakIn','WorkingHours','LateMinutes','Status','Remarks','RecordedBy','CreatedAt','UpdatedAt'],
      Schedule:  ['ScheduleID','ScheduleName','ScopeType','ScopeValue','StartTime','EndTime','GracePeriod','LateAfter','HalfDayAfter','EarliestTimeIn','LatestTimeOut','WorkingDays','Status','CreatedAt','UpdatedAt'],
      Sessions:  ['Token','AdminID','CreatedAt','ExpiresAt','UserAgent'],
      AuditLogs: ['LogID','User','Action','Description','Browser','IP','Timestamp'],
      Settings:  ['Key','Value']
    };

    // Ensure sheets + header rows (row 1 only) — data rows are preserved.
    Object.keys(schema).forEach(function (name) {
      var sh = ss.getSheetByName(name) || ss.insertSheet(name);
      sh.getRange(1, 1, 1, schema[name].length).setValues([schema[name]]).setFontWeight('bold');
      sh.setFrozenRows(1);
      Logger.log('  • ' + name + ' ready');
    });

    // Default settings — add only missing keys (never clobber customizations).
    var defaults = { OrgName: 'QR Attendance', Timezone: 'Asia/Manila', GracePeriod: '10',
                     WorkingDays: 'Mon-Fri', EmailEnabled: 'true', Theme: 'light', RateLimitPerMinute: '120' };
    var have = {};
    readAll_('Settings').forEach(function (r) { have[r.Key] = true; });
    var setSheet = ss.getSheetByName('Settings');
    Object.keys(defaults).forEach(function (k) { if (!have[k]) setSheet.appendRow([k, defaults[k]]); });

    // Default admin — only if none exists.
    if (readAll_('Admin').length === 0) {
      var salt = newSalt_();
      ss.getSheetByName('Admin').appendRow([
        'AD001', 'admin', hashPassword_('admin123', salt), salt,
        'Administrator', '', 'Administrator', 'Active', nowISO_()
      ]);
      Logger.log('  • default admin created (admin / admin123)');
    }

    // Default schedule — only if none exists.
    if (readAll_('Schedule').length === 0) {
      ss.getSheetByName('Schedule').appendRow([
        'SC001', 'Standard 8–5', 'Default', '*', '08:00', '17:00', 10,
        '08:10', '12:00', '06:00', '19:00', 'Mon-Fri', 'Active', nowISO_(), nowISO_()
      ]);
      Logger.log('  • default schedule created (SC001)');
    }

    SpreadsheetApp.flush();
    Logger.log('✅ Setup complete. Log in with admin / admin123 and change the password.');
  } catch (err) {
    Logger.log('❌ Setup error: ' + err + ' — make sure a Google Sheet is open.');
    throw err;
  }
}

/** Install daily/monthly email triggers (run once if email is desired). */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('Email_dailySummary').timeBased().atHour(18).everyDays(1).create();
  ScriptApp.newTrigger('Email_monthlySummary').timeBased().onMonthDay(1).atHour(7).create();
}
