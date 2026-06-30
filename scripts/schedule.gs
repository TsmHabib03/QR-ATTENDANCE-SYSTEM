/* =========================================================================
   schedule.gs — schedules + resolution for a member.
   Resolution priority: Employee > Section > Department > Default.
   ========================================================================= */
var Schedule_ = (function () {

  function list() { return { rows: readAll_('Schedule') }; }

  function save(payload, session) {
    var s = payload.schedule || {};
    if (s.ScheduleID) {
      var u = update_('Schedule', 'ScheduleID', s.ScheduleID, s);
      Audit_.log('ScheduleUpdate', session.username, 'Updated ' + s.ScheduleID);
      return { schedule: u };
    }
    s.ScheduleID = genId_('SC', 'Schedule');
    append_('Schedule', s);
    Audit_.log('ScheduleUpdate', session.username, 'Created ' + s.ScheduleID);
    return { schedule: s };
  }

  function resolve(member) {
    var rows = readAll_('Schedule');
    var byScope = function (type, value) {
      return rows.filter(function (r) { return r.ScopeType === type && String(r.ScopeValue) === String(value); })[0];
    };
    return byScope('Employee', member.MemberID)
        || byScope('Section', member.Section)
        || byScope('Department', member.Department)
        || rows.filter(function (r) { return r.ScopeType === 'Default'; })[0]
        || { StartTime: '08:00', GracePeriod: 10 };
  }

  return { list: list, save: save, resolve: resolve };
})();
