/* =========================================================================
   gas-stubs.js — minimal fakes for the slice of the Apps Script runtime that
   utils.gs + attendance.gs need, so those .gs files can run under plain Node
   via `vm`. Not a general-purpose GAS emulator — just enough to reproduce the
   Sheets auto-date-conversion bug (see attendance.dstr.test.js).
   ========================================================================= */
'use strict';

// A fake Sheet backed by a plain array-of-arrays, matching how utils.gs reads
// (getDataRange/getRange) and writes (appendRow/setValues/deleteRow) a sheet.
function makeSheet(headers, rows) {
  return {
    getDataRange() {
      const values = [headers].concat(rows);
      return { getValues: () => values };
    },
    getRange(r, c, nr, nc) {
      return {
        getValues: () => (r === 1 ? [headers.slice(c - 1, c - 1 + nc)] : [rows[r - 2].slice(c - 1, c - 1 + nc)]),
        setValues: (v) => { if (r !== 1) rows[r - 2] = v[0]; },
        setFontWeight: () => {},
      };
    },
    getLastColumn: () => headers.length,
    appendRow: (arr) => rows.push(arr),
    deleteRow: (r) => rows.splice(r - 2, 1),
    setFrozenRows: () => {},
  };
}

// `sheets` is a { SheetName: fakeSheet } map the test populates beforehand.
function createContext(sheets) {
  const cache = {};
  const pad = (n) => String(n).padStart(2, "0");

  const sandbox = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getName: () => "stub",
        getSheetByName: (name) => sheets[name] || null,
        insertSheet: (name) => { sheets[name] = makeSheet([], []); return sheets[name]; },
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (k in cache ? cache[k] : null),
        put: (k, v) => { cache[k] = v; },
        remove: (k) => { delete cache[k]; },
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    Session: { getScriptTimeZone: () => "Asia/Manila" },
    // Real Settings_ (settings.gs) isn't loaded for this test — an empty
    // get() just forces tz_() to fall back to Session's timezone above.
    Settings_: { get: () => "" },
    Utilities: {
      formatDate: (d, tz, fmt) => {
        if (fmt === "yyyy-MM-dd") return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
        if (fmt === "HH:mm") return pad(d.getHours()) + ":" + pad(d.getMinutes());
        if (fmt === "EEE") return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
        return d.toISOString();
      },
      getUuid: () => "stub-" + Math.random().toString(36).slice(2),
      computeDigest: () => [0],
      DigestAlgorithm: { SHA_256: "SHA_256" },
    },
  };
  sandbox.global = sandbox;
  return sandbox;
}

module.exports = { makeSheet, createContext };
