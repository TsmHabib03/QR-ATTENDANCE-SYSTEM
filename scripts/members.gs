/* =========================================================================
   members.gs — member CRUD + CSV import.
   ========================================================================= */
var Members_ = (function () {

  function list(payload) {
    var rows = readAll_('Members');
    var q = String((payload && payload.search) || '').toLowerCase();
    if (q) {
      rows = rows.filter(function (m) {
        return (m.FirstName + ' ' + m.LastName + ' ' + m.EmployeeID + ' ' + m.Department + ' ' + m.Email)
          .toLowerCase().indexOf(q) >= 0;
      });
    }
    if (payload && payload.dept) rows = rows.filter(function (m) { return m.Department === payload.dept; });
    return { rows: rows, total: rows.length };
  }

  function save(payload, session) {
    var m = payload.member || {};
    if (!m.FirstName || !m.LastName) throw new Error('First and last name are required.');

    if (m.MemberID) {
      m.UpdatedAt = nowISO_();
      var updated = update_('Members', 'MemberID', m.MemberID, m);
      Audit_.log('MemberUpdate', session.username, 'Updated ' + m.MemberID);
      return { member: updated };
    }
    m.MemberID = genId_('M', 'Members');
    m.QRCode = m.MemberID;            // QR encodes the ID only — never PII
    m.Status = m.Status || 'Active';
    m.CreatedAt = nowISO_();
    m.UpdatedAt = nowISO_();
    append_('Members', m);
    Audit_.log('MemberCreate', session.username, 'Created ' + m.MemberID);
    try { Email_.welcome(m); } catch (e) {}
    return { member: m };
  }

  function remove(payload, session) {
    deleteRow_('Members', 'MemberID', payload.memberId);
    Audit_.log('MemberDelete', session.username, 'Deleted ' + payload.memberId);
    return {};
  }

  function importCsv(payload, session) {
    var rows = Utilities.parseCsv(String(payload.csv || ''));
    if (!rows.length) return { imported: 0, errors: ['Empty CSV'] };
    var headers = rows[0];
    var imported = 0, errors = [];
    rows.slice(1).forEach(function (r, i) {
      try {
        var obj = {};
        headers.forEach(function (h, c) { obj[h] = r[c]; });
        if (!obj.FirstName || !obj.LastName) throw new Error('row ' + (i + 2) + ': missing name');
        save({ member: obj }, session);
        imported++;
      } catch (e) { errors.push(String(e.message || e)); }
    });
    return { imported: imported, errors: errors };
  }

  return { list: list, save: save, remove: remove, importCsv: importCsv };
})();
