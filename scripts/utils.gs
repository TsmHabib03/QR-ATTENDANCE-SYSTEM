/* =========================================================================
   utils.gs — shared helpers: sheets I/O, caching, JSON, hashing, ids, time.

   Performance model
   -----------------
   • _memo        : request-scoped cache (one doPost = one read per sheet).
                    MUST be reset at the start of every request — see
                    resetRequestCache_() called from Code.gs doPost/doGet.
   • CacheService : cross-request cache for small/stable sheets (~25s TTL).
                    Skipped for Attendance (can exceed the 100KB value limit).
   • Every write (append_/update_/deleteRow_) busts both layers for its sheet.
   ========================================================================= */

const SS = () => SpreadsheetApp.getActiveSpreadsheet();

// Sheets safe to cache across requests (small + read-heavy). Attendance is
// intentionally excluded — it grows unbounded and is written constantly.
var CACHEABLE_ = { Schedule: true, Settings: true, Admin: true, Members: true };
var CACHE_TTL_ = 25;            // seconds
var _memo = {};                 // sheetName -> rows (request scope)

/** Reset the per-request memo. Call once at the top of every entry point. */
function resetRequestCache_() { _memo = {}; }

function sheet_(name) {
  const s = SS().getSheetByName(name);
  if (!s) throw new Error('Missing sheet: ' + name + ' (run setup())');
  return s;
}

/** Raw read — always hits the spreadsheet. Prefer cachedReadAll_ in modules. */
function readAll_(name) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).map(function (row) {
    const o = {};
    headers.forEach(function (h, i) { o[h] = row[i]; });
    return o;
  }).filter(function (o) { return String(o[headers[0]]).length > 0; });
}

/** Cached read: request memo first, then CacheService, then the sheet. */
function cachedReadAll_(name) {
  if (_memo[name]) return _memo[name];

  if (CACHEABLE_[name]) {
    try {
      var hit = CacheService.getScriptCache().get('sheet:' + name);
      if (hit) { var cached = JSON.parse(hit); _memo[name] = cached; return cached; }
    } catch (e) { /* cache miss / parse error — fall through to live read */ }
  }

  var rows = readAll_(name);
  _memo[name] = rows;

  if (CACHEABLE_[name]) {
    try {
      var s = JSON.stringify(rows);
      if (s.length < 90000) CacheService.getScriptCache().put('sheet:' + name, s, CACHE_TTL_);
    } catch (e) { /* too big / quota — skip cross-request cache */ }
  }
  return rows;
}

/** Invalidate both cache layers for a sheet after a write. */
function bustCache_(name) {
  delete _memo[name];
  try { CacheService.getScriptCache().remove('sheet:' + name); } catch (e) {}
  if (name === 'Attendance') {
    var k = 'Attendance:' + today_();
    delete _memo[k];
    try { CacheService.getScriptCache().remove('sheet:' + k); } catch (e) {}
  }
}

/**
 * Cached read of TODAY's Attendance rows only (request memo -> CacheService ->
 * live read). Attendance as a whole is excluded from CACHEABLE_ because the
 * full sheet can exceed CacheService's 100KB value limit, but a single day's
 * rows are small — this is the hot path for scan()'s existing-record lookup
 * and the Attendance Records page's default ("today") view. Historical dates
 * are read live via cachedReadAll_ + dstr_ filtering (not hot, no caching).
 */
function cachedTodayAttendance_() {
  var date = today_();
  var key = 'Attendance:' + date;
  if (_memo[key]) return _memo[key];

  try {
    var hit = CacheService.getScriptCache().get('sheet:' + key);
    if (hit) { var cached = JSON.parse(hit); _memo[key] = cached; return cached; }
  } catch (e) { /* fall through to live read */ }

  var rows = readAll_('Attendance').filter(function (a) { return dstr_(a.Date) === date; });
  _memo[key] = rows;
  try {
    var s = JSON.stringify(rows);
    if (s.length < 90000) CacheService.getScriptCache().put('sheet:' + key, s, CACHE_TTL_);
  } catch (e) { /* too big / quota — skip cross-request cache */ }
  return rows;
}

/**
 * Soft per-session rate limit (CacheService increment+TTL — not atomic across
 * concurrent requests, so this is an abuse/runaway-loop guard, not a hard
 * security boundary). Threshold is tunable via Settings without a redeploy.
 */
function checkRateLimit_(token) {
  var limit = Number(Settings_.get('RateLimitPerMinute') || 120);
  if (!limit) return; // 0/blank disables the limiter
  var cache = CacheService.getScriptCache();
  var key = 'rl:' + token;
  var count = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(count), 60);
  if (count > limit) throw new Error('Too many requests — please slow down and try again shortly.');
}

/** Append an object as a new row, aligned to the header order. */
function append_(name, obj) {
  const sh = sheet_(name);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.appendRow(headers.map(function (h) { return sanitizeCell_(obj[h] !== undefined ? obj[h] : ''); }));
  bustCache_(name);
  return obj;
}

/** Find the 1-based row index where column == value (header row = 1). */
function findRowIndex_(name, col, value) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const c = headers.indexOf(col);
  if (c < 0) return -1;
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][c]) === String(value)) return r + 1;
  }
  return -1;
}

/** Update an existing row (matched by col=value) with fields from obj. */
function update_(name, col, value, obj) {
  const sh = sheet_(name);
  const rowIdx = findRowIndex_(name, col, value);
  if (rowIdx < 0) throw new Error('Record not found: ' + value);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const current = sh.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
  headers.forEach(function (h, i) { if (obj[h] !== undefined) current[i] = sanitizeCell_(obj[h]); });
  sh.getRange(rowIdx, 1, 1, headers.length).setValues([current]);
  bustCache_(name);
  const out = {};
  headers.forEach(function (h, i) { out[h] = current[i]; });
  return out;
}

function deleteRow_(name, col, value) {
  const rowIdx = findRowIndex_(name, col, value);
  if (rowIdx > 0) { sheet_(name).deleteRow(rowIdx); bustCache_(name); }
}

/** Prevent CSV/formula injection when writing user input into cells. */
function sanitizeCell_(v) {
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

/** Serialize the critical write path (scan/manual) to avoid double-records. */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(8000); }
  catch (e) { throw new Error('System busy — please scan again.'); }
  try { return fn(); }
  finally { try { lock.releaseLock(); } catch (e) {} }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function uuid_() { return Utilities.getUuid(); }

function nowISO_() {
  return Utilities.formatDate(new Date(), tz_(), "yyyy-MM-dd'T'HH:mm:ss");
}
function today_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }
function hhmm_() { return Utilities.formatDate(new Date(), tz_(), 'HH:mm'); }

/** Normalize a sheet date value (Date object OR text) to a 'yyyy-MM-dd' string. */
function dstr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  return String(v == null ? '' : v).slice(0, 10);
}
function tz_() { return Settings_.get('Timezone') || Session.getScriptTimeZone() || 'Asia/Manila'; }

/** Salted, iterated SHA-256 (poor-man's KDF; PBKDF2/scrypt = Enterprise upgrade). */
function hashPassword_(password, salt) {
  var data = salt + ':' + password;
  for (var i = 0; i < 12000; i++) {
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, data);
    data = digest.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  }
  return data;
}
function newSalt_() { return uuid_().replace(/-/g, ''); }

/**
 * Collision-safe incremental id (e.g. M001 / A0001 / SC001).
 * Uses max(existing numeric suffix) + 1 — survives deletions and, combined
 * with withLock_ on the write path, concurrent scans.
 */
function genId_(prefix, name) {
  var width = prefix === 'A' ? 4 : 3;
  var idHeader = sheet_(name).getRange(1, 1, 1, 1).getValues()[0][0]; // first column = ID
  var max = 0;
  cachedReadAll_(name).forEach(function (r) {
    var n = parseInt(String(r[idHeader] || '').replace(/\D+/g, ''), 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return prefix + ('000000' + (max + 1)).slice(-width);
}
