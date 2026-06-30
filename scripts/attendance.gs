/* =========================================================================
   attendance.gs — scan (Time In/Out), list, manual update.
   Enforces: no duplicate Time In/Out, invalid/inactive/archived detection.
   ========================================================================= */
var Attendance_ = (function () {

  function scan(payload, session) {
    var code = String(payload.qr || '').trim();
    if (!code) throw new Error('Empty QR code.');

    var member = readAll_('Members').filter(function (m) {
      return m.MemberID === code || m.QRCode === code;
    })[0];
    if (!member) throw new Error('Invalid QR — member not found.');
    if (member.Status === 'Inactive') throw new Error(member.FirstName + ' is inactive.');
    if (member.Status === 'Archived') throw new Error(member.FirstName + ' is archived.');

    var date = today_(), time = hhmm_();
    var existing = readAll_('Attendance').filter(function (a) {
      return a.MemberID === member.MemberID && String(a.Date) === date;
    })[0];

    var name = member.FirstName + ' ' + member.LastName;

    if (!existing) {
      var sched = Schedule_.resolve(member);
      var late = lateMinutes_(time, sched);
      var status = late > 0 ? 'Late' : 'Present';
      var rec = {
        AttendanceID: genId_('A', 'Attendance'), MemberID: member.MemberID, Name: name,
        Department: member.Department, Date: date, TimeIn: time, TimeOut: '',
        BreakOut: '', BreakIn: '', WorkingHours: 0, LateMinutes: late, Status: status,
        Remarks: '', RecordedBy: session.username, CreatedAt: nowISO_(), UpdatedAt: nowISO_()
      };
      append_('Attendance', rec);
      Audit_.log('Scan', session.username, 'Time In ' + member.MemberID);
      try { Email_.scanConfirm(member, rec, 'Time In'); } catch (e) {}
      return { member: member, record: rec, type: 'Time In', status: status };
    }

    if (!existing.TimeOut) {
      var hours = workHours_(existing.TimeIn, time);
      var updated = update_('Attendance', 'AttendanceID', existing.AttendanceID,
        { TimeOut: time, WorkingHours: hours, UpdatedAt: nowISO_() });
      Audit_.log('Scan', session.username, 'Time Out ' + member.MemberID);
      try { Email_.scanConfirm(member, updated, 'Time Out'); } catch (e) {}
      return { member: member, record: updated, type: 'Time Out', status: updated.Status };
    }

    throw new Error(name + ' already has Time In and Time Out today.');
  }

  function list(payload) {
    var date = (payload && payload.date) || today_();
    var rows = readAll_('Attendance').filter(function (a) { return String(a.Date) === date; });
    return { rows: rows, total: rows.length, date: date };
  }

  function update(payload, session) {
    var rec = payload.record || {};
    rec.UpdatedAt = nowISO_();
    var updated = update_('Attendance', 'AttendanceID', rec.AttendanceID, rec);
    Audit_.log('AttendanceEdit', session.username, 'Edited ' + rec.AttendanceID);
    return { record: updated };
  }

  // ---- helpers ----
  function toMin_(hhmm) { var p = String(hhmm || '').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function lateMinutes_(time, sched) {
    if (!sched || !sched.StartTime) return 0;
    var grace = Number(sched.GracePeriod || 0);
    var diff = toMin_(time) - (toMin_(sched.StartTime) + grace);
    return diff > 0 ? diff : 0;
  }
  function workHours_(inT, outT) {
    var mins = toMin_(outT) - toMin_(inT);
    return mins > 0 ? Math.round((mins / 60) * 100) / 100 : 0;
  }

  return { scan: scan, list: list, update: update };
})();
