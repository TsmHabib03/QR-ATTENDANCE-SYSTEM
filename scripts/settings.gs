/* =========================================================================
   settings.gs — key/value settings store.
   ========================================================================= */
var Settings_ = (function () {

  function all() {
    var o = {};
    readAll_('Settings').forEach(function (r) { o[r.Key] = r.Value; });
    // normalize types the frontend expects
    if (o.EmailEnabled !== undefined) o.EmailEnabled = (String(o.EmailEnabled) === 'true');
    if (o.GracePeriod !== undefined) o.GracePeriod = Number(o.GracePeriod);
    return o;
  }

  function get(key) {
    var r = readAll_('Settings').filter(function (x) { return x.Key === key; })[0];
    return r ? r.Value : '';
  }

  function set(key, value) {
    var idx = findRowIndex_('Settings', 'Key', key);
    if (idx > 0) update_('Settings', 'Key', key, { Value: value });
    else append_('Settings', { Key: key, Value: value });
  }

  function save(payload, session) {
    var s = payload.settings || {};
    Object.keys(s).forEach(function (k) { set(k, String(s[k])); });
    Audit_.log('SettingsUpdate', session.username, Object.keys(s).join(', '));
    return { settings: all() };
  }

  return { all: all, get: get, set: set, save: save };
})();
