/* =========================================================================
   auth.gs — login, token sessions, password change.
   ========================================================================= */
var Auth_ = (function () {
  var SESSION_HOURS = 12;

  function login(payload, e) {
    var username = String(payload.username || '').trim();
    var password = String(payload.password || '');
    if (!username || !password) throw new Error('Username and password are required.');

    var admin = readAll_('Admin').filter(function (a) {
      return String(a.Username).toLowerCase() === username.toLowerCase() && a.Status === 'Active';
    })[0];

    var fail = function () { throw new Error('Invalid username or password.'); };
    if (!admin) { Audit_.log('LoginFailed', username, 'No such user', e); fail(); }
    if (hashPassword_(password, admin.PasswordSalt) !== admin.PasswordHash) {
      Audit_.log('LoginFailed', username, 'Bad password', e); fail();
    }

    var token = uuid_();
    var expires = new Date(Date.now() + SESSION_HOURS * 3600 * 1000);
    append_('Sessions', {
      Token: token, AdminID: admin.AdminID, CreatedAt: nowISO_(),
      ExpiresAt: Utilities.formatDate(expires, tz_(), "yyyy-MM-dd'T'HH:mm:ss"),
      UserAgent: (payload && payload.ua) || ''
    });

    Audit_.log('Login', admin.Username, 'Signed in', e);
    return {
      token: token,
      admin: { name: admin.FullName || admin.Username, role: admin.Role, email: admin.Email },
      settings: Settings_.all()
    };
  }

  function validate(token) {
    if (!token) throw new Error('Unauthorized — no session token.');
    var rows = readAll_('Sessions');
    var s = rows.filter(function (r) { return r.Token === token; })[0];
    if (!s) throw new Error('Session invalid — please sign in again.');
    if (new Date(s.ExpiresAt) < new Date()) {
      deleteRow_('Sessions', 'Token', token);
      throw new Error('Session expired — please sign in again.');
    }
    // sliding expiry
    var expires = new Date(Date.now() + SESSION_HOURS * 3600 * 1000);
    update_('Sessions', 'Token', token, { ExpiresAt: Utilities.formatDate(expires, tz_(), "yyyy-MM-dd'T'HH:mm:ss") });
    var admin = readAll_('Admin').filter(function (a) { return a.AdminID === s.AdminID; })[0] || {};
    return { adminId: s.AdminID, username: admin.Username, name: admin.FullName || admin.Username };
  }

  function logout(token) { deleteRow_('Sessions', 'Token', token); return {}; }

  function changePassword(session, payload) {
    var admin = readAll_('Admin').filter(function (a) { return a.AdminID === session.adminId; })[0];
    if (!admin) throw new Error('Account not found.');
    if (hashPassword_(String(payload.old || ''), admin.PasswordSalt) !== admin.PasswordHash)
      throw new Error('Current password is incorrect.');
    if (String(payload['new'] || '').length < 6) throw new Error('New password must be at least 6 characters.');
    var salt = newSalt_();
    update_('Admin', 'AdminID', admin.AdminID, { PasswordSalt: salt, PasswordHash: hashPassword_(payload['new'], salt) });
    Audit_.log('ChangePassword', admin.Username, 'Password changed');
    return {};
  }

  return { login: login, validate: validate, logout: logout, changePassword: changePassword };
})();
