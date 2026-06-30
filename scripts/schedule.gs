/* =========================================================================
   schedule.gs — schedule CRUD + per-member resolution.

   Columns: ScheduleID, ScheduleName, ScopeType, ScopeValue, StartTime, EndTime,
            GracePeriod, LateAfter, HalfDayAfter, EarliestTimeIn, LatestTimeOut,
            WorkingDays, Status, CreatedAt, UpdatedAt

   ScopeType: Employee | Department | Section | Position | Default
   Resolution priority for a member (Active schedules only):
     direct member.ScheduleID  >  Position  >  Section  >  Department  >  Default
   Returns null when nothing matches — callers must NOT invent a schedule.
   ========================================================================= */
var Schedule_ = (function () {

  function list() { return { rows: cachedReadAll_('Schedule') }; }

  function save(payload, session) {
    var s = payload.schedule || {};
    if (!s.ScheduleName) throw new Error('Schedule name is required.');
    if (!s.StartTime || !s.EndTime) throw new Error('Start and end time are required.');

    if (s.ScheduleID) {
      s.UpdatedAt = nowISO_();
      var u = update_('Schedule', 'ScheduleID', s.ScheduleID, s);
      Audit_.log('ScheduleChange', session.username, 'Updated ' + s.ScheduleID + ' — ' + s.ScheduleName);
      return { schedule: u };
    }

    s.ScheduleID = genId_('SC', 'Schedule');
    s.ScopeType = s.ScopeType || 'Default';
    s.Status = s.Status || 'Active';
    s.CreatedAt = nowISO_();
    s.UpdatedAt = nowISO_();
    append_('Schedule', s);
    Audit_.log('ScheduleChange', session.username, 'Created ' + s.ScheduleID + ' — ' + s.ScheduleName);
    return { schedule: s };
  }

  function remove(payload, session) {
    var id = payload.scheduleId;
    if (!id) throw new Error('No schedule selected.');
    deleteRow_('Schedule', 'ScheduleID', id);
    Audit_.log('ScheduleChange', session.username, 'Deleted ' + id);
    return {};
  }

  function toggle(payload, session) {
    var row = cachedReadAll_('Schedule').filter(function (r) { return r.ScheduleID === payload.scheduleId; })[0];
    if (!row) throw new Error('Schedule not found.');
    var next = String(row.Status) === 'Active' ? 'Inactive' : 'Active';
    var u = update_('Schedule', 'ScheduleID', payload.scheduleId, { Status: next, UpdatedAt: nowISO_() });
    Audit_.log('ScheduleChange', session.username, payload.scheduleId + ' → ' + next);
    return { schedule: u };
  }

  /** Resolve the active schedule that applies to a member, or null. */
  function resolve(member) {
    var rows = cachedReadAll_('Schedule').filter(function (r) {
      return String(r.Status || 'Active') === 'Active';
    });
    var find = function (pred) { return rows.filter(pred)[0]; };
    var byScope = function (type, value) {
      if (!value) return null;
      return find(function (r) { return r.ScopeType === type && String(r.ScopeValue) === String(value); });
    };

    if (member.ScheduleID) {
      var direct = find(function (r) { return String(r.ScheduleID) === String(member.ScheduleID); });
      if (direct) return direct;
    }
    return byScope('Employee', member.MemberID)
        || byScope('Position', member.Position)
        || byScope('Section', member.Section)
        || byScope('Department', member.Department)
        || find(function (r) { return r.ScopeType === 'Default'; })
        || null;
  }

  return { list: list, save: save, remove: remove, toggle: toggle, resolve: resolve };
})();
