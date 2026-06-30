/* =========================================================================
   utils.gs — shared helpers: sheets I/O, JSON output, hashing, ids, time.
   ========================================================================= */

const SS = () => SpreadsheetApp.getActiveSpreadsheet();

function sheet_(name) {
  const s = SS().getSheetByName(name);
  if (!s) throw new Error('Missing sheet: ' + name + ' (run setup())');
  return s;
}

/** Read all rows of a sheet as objects keyed by the header row. */
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

/** Append an object as a new row, aligned to the header order. */
function append_(name, obj) {
  const sh = sheet_(name);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.appendRow(headers.map(function (h) { return sanitizeCell_(obj[h] !== undefined ? obj[h] : ''); }));
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
  const out = {};
  headers.forEach(function (h, i) { out[h] = current[i]; });
  return out;
}

function deleteRow_(name, col, value) {
  const rowIdx = findRowIndex_(name, col, value);
  if (rowIdx > 0) sheet_(name).deleteRow(rowIdx);
}

/** Prevent CSV/formula injection when writing user input into cells. */
function sanitizeCell_(v) {
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
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

function genId_(prefix, name, col) {
  // simple incremental id like M001 / A0001 based on existing count
  const count = readAll_(name).length + 1;
  const width = prefix === 'A' ? 4 : 3;
  return prefix + ('000000' + count).slice(-width);
}
