/* =========================================================================
   audit.gs — append-only activity log.
   ========================================================================= */
var Audit_ = (function () {
  function log(action, user, description, e) {
    try {
      var ua = '', ip = '';
      if (e && e.parameter) { ua = e.parameter.ua || ''; }
      append_('AuditLogs', {
        LogID: uuid_(), User: user || 'system', Action: action,
        Description: description || '', Browser: ua, IP: ip, Timestamp: nowISO_()
      });
    } catch (err) { /* logging must never throw */ }
  }

  function list(payload) {
    var rows = cachedReadAll_('AuditLogs');
    if (payload && payload.action) rows = rows.filter(function (r) { return r.Action === payload.action; });
    rows.sort(function (a, b) { return new Date(b.Timestamp) - new Date(a.Timestamp); });
    return { rows: rows.slice(0, (payload && payload.limit) || 200), total: rows.length };
  }

  return { log: log, list: list };
})();
