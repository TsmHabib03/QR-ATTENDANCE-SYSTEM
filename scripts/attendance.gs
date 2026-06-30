/* =========================================================================
   attendance.gs — QR scan (Time In/Out), manual entry, list, edit, delete.

   Every successful scan ALWAYS writes a record. Classification is driven by the
   member's resolved schedule (see schedule.gs) — never hardcoded times.
   The critical write path is serialized with withLock_ so rapid/duplicate
   frames or two devices can't create double records.
   ========================================================================= */
var Attendance_ = (function () {

  /* ---------------- QR scan: toggles Time In then Time Out ---------------- */
  function scan(payload, session) {
    return withLock_(function () {
      var code = String(payload.qr || '').trim();
      if (!code) throw new Error('Empty QR code.');

      var member = cachedReadAll_('Members').filter(function (m) {
        return m.MemberID === code || m.QRCode === code;
      })[0];
      if (!member) throw new Error('Invalid QR — member not found.');
      if (member.Status === 'Inactive') throw new Error(displayName_(member) + ' is inactive.');
      if (member.Status === 'Archived') throw new Error(displayName_(member) + ' is archived.');

      var date = today_(), time = hhmm_(), name = displayName_(member);
      var sched = Schedule_.resolve(member);
      var noSchedule = !sched;

      var existing = cachedReadAll_('Attendance').filter(function (a) {
        return a.MemberID === member.MemberID && String(a.Date) === date;
      })[0];

      // First scan today -> Time In
      if (!existing) {
        var c = classify_(sched, time, date);
        var rec = {
          AttendanceID: genId_('A', 'Attendance'), MemberID: member.MemberID, Name: name,
          Department: member.Department, Date: date, TimeIn: time, TimeOut: '',
          BreakOut: '', BreakIn: '', WorkingHours: 0, LateMinutes: c.late, Status: c.status,
          Remarks: c.note || '', RecordedBy: session.username, CreatedAt: nowISO_(), UpdatedAt: nowISO_()
        };
        append_('Attendance', rec);
        Audit_.log('Scan', session.username, 'Time In ' + member.MemberID + ' (' + c.status + ')');
        try { Email_.scanConfirm(member, rec, 'Time In'); } catch (e) {}
        return { member: member, record: rec, type: 'Time In', status: c.status, noSchedule: noSchedule };
      }

      // Second scan today -> Time Out
      if (!existing.TimeOut) {
        var hours = workHours_(existing.TimeIn, time, sched);
        var updated = update_('Attendance', 'AttendanceID', existing.AttendanceID,
          { TimeOut: time, WorkingHours: hours, UpdatedAt: nowISO_() });
        Audit_.log('Scan', session.username, 'Time Out ' + member.MemberID);
        try { Email_.scanConfirm(member, updated, 'Time Out'); } catch (e) {}
        return { member: member, record: updated, type: 'Time Out', status: updated.Status, noSchedule: noSchedule };
      }

      throw new Error(name + ' already timed in and out today.');
    });
  }

  /* ---------------- Manual entry (admin) — same rules as scan ------------- */
  function manual(payload, session) {
    return withLock_(function () {
      var p = payload.record || {};
      var member = cachedReadAll_('Members').filter(function (m) { return m.MemberID === p.MemberID; })[0];
      if (!member) throw new Error('Select a member first.');

      var date = p.Date || today_();
      var sched = Schedule_.resolve(member);
      var timeIn = p.TimeIn || '';

      var status = p.Status, late = 0;
      if (!status) { var c = classify_(sched, timeIn || hhmm_(), date); status = c.status; late = c.late; }
      else if (timeIn) { late = lateMin_(sched, toMin_(timeIn)); }

      var hours = (timeIn && p.TimeOut) ? workHours_(timeIn, p.TimeOut, sched) : 0;

      var fields = {
        MemberID: member.MemberID, Name: displayName_(member), Department: member.Department,
        Date: date, TimeIn: timeIn, TimeOut: p.TimeOut || '', WorkingHours: hours,
        LateMinutes: late, Status: status, Remarks: p.Remarks || (sched ? '' : 'No schedule assigned'),
        RecordedBy: session.username, UpdatedAt: nowISO_()
      };

      var existing = cachedReadAll_('Attendance').filter(function (a) {
        return a.MemberID === member.MemberID && String(a.Date) === date;
      })[0];

      var saved;
      if (existing) {
        saved = update_('Attendance', 'AttendanceID', existing.AttendanceID, fields);
      } else {
        fields.AttendanceID = genId_('A', 'Attendance');
        fields.CreatedAt = nowISO_();
        append_('Attendance', fields);
        saved = fields;
      }
      Audit_.log('ManualAttendance', session.username,
        (existing ? 'Updated ' : 'Created ') + member.MemberID + ' ' + date + ' (' + status + ')');
      return { record: saved, noSchedule: !sched };
    });
  }

  function list(payload) {
    var date = (payload && payload.date) || today_();
    var rows = cachedReadAll_('Attendance').filter(function (a) { return String(a.Date) === date; });
    return { rows: rows, total: rows.length, date: date };
  }

  function update(payload, session) {
    var rec = payload.record || {};
    rec.UpdatedAt = nowISO_();
    var updated = update_('Attendance', 'AttendanceID', rec.AttendanceID, rec);
    Audit_.log('AttendanceEdit', session.username, 'Edited ' + rec.AttendanceID);
    return { record: updated };
  }

  function remove(payload, session) {
    deleteRow_('Attendance', 'AttendanceID', payload.attendanceId);
    Audit_.log('AttendanceDelete', session.username, 'Deleted ' + payload.attendanceId);
    return {};
  }

  /* ------------------------------ helpers -------------------------------- */
  function displayName_(m) { return String((m.FirstName || '') + ' ' + (m.LastName || '')).trim() || m.MemberID; }
  function toMin_(hhmm) { var p = String(hhmm || '').split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); }

  // threshold = LateAfter, else StartTime + GracePeriod. 0 when no schedule.
  function lateMin_(sched, t) {
    if (!sched || (!sched.StartTime && !sched.LateAfter)) return 0;
    var threshold = sched.LateAfter ? toMin_(sched.LateAfter)
                                    : toMin_(sched.StartTime) + Number(sched.GracePeriod || 0);
    var diff = t - threshold;
    return diff > 0 ? diff : 0;
  }

  // Returns { status, late, note }. No schedule -> Present + note, never Absent.
  function classify_(sched, time, date) {
    if (!sched) return { status: 'Present', late: 0, note: 'No schedule assigned' };
    if (!isWorkingDay_(sched.WorkingDays, date)) return { status: 'Holiday', late: 0, note: '' };
    var t = toMin_(time);
    if (sched.HalfDayAfter && t >= toMin_(sched.HalfDayAfter)) return { status: 'Half Day', late: lateMin_(sched, t), note: '' };
    var late = lateMin_(sched, t);
    return { status: late > 0 ? 'Late' : 'Present', late: late, note: '' };
  }

  function workHours_(inT, outT, sched) {
    var inMin = toMin_(inT), outMin = toMin_(outT);
    if (sched && sched.EarliestTimeIn) inMin = Math.max(inMin, toMin_(sched.EarliestTimeIn));
    if (sched && sched.LatestTimeOut) outMin = Math.min(outMin, toMin_(sched.LatestTimeOut));
    var mins = outMin - inMin;
    return mins > 0 ? Math.round((mins / 60) * 100) / 100 : 0;
  }

  var DOW_ = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function cap_(s) { s = String(s || '').trim(); return s.slice(0, 1).toUpperCase() + s.slice(1, 3).toLowerCase(); }

  // Parse "Mon-Fri", "Mon,Wed,Fri", "Sat-Sun" -> {Mon:true,...}; null = every day.
  function workingDaySet_(spec) {
    spec = String(spec || '').trim();
    if (!spec) return null;
    var set = {};
    spec.split(',').forEach(function (part) {
      part = part.replace(/[–—]/g, '-').trim();
      var seg = part.split('-');
      if (seg.length === 2) {
        var a = DOW_.indexOf(cap_(seg[0])), b = DOW_.indexOf(cap_(seg[1]));
        if (a >= 0 && b >= 0) {
          if (a <= b) { for (var i = a; i <= b; i++) set[DOW_[i]] = true; }
          else { for (var j = a; j <= 6; j++) set[DOW_[j]] = true; for (var k = 0; k <= b; k++) set[DOW_[k]] = true; }
        }
      } else {
        var d = DOW_.indexOf(cap_(part));
        if (d >= 0) set[DOW_[d]] = true;
      }
    });
    return set;
  }

  function isWorkingDay_(spec, dateStr) {
    var set = workingDaySet_(spec);
    if (!set) return true;
    var p = String(dateStr).split('-');
    var d = new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1);
    return !!set[Utilities.formatDate(d, tz_(), 'EEE')];
  }

  return { scan: scan, manual: manual, list: list, update: update, remove: remove };
})();
