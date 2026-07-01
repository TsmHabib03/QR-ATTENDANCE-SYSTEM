/* =========================================================================
   attendance.dstr.test.js — regression test for the Sheets auto-date bug.

   Google Sheets silently converts an ISO date string ("2026-07-01") written
   via setValues/appendRow into a real JS Date object. attendance.gs's list()
   (and scan()/manual()'s existing-record lookups) must normalize with
   dstr_(a.Date) — comparing String(a.Date) directly breaks the instant a
   Date cell stops being a plain string.

   Run:  node scripts/_test/attendance.dstr.test.js   (no deps, no package.json)
   ========================================================================= */
'use strict';
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { makeSheet, createContext } = require("./gas-stubs.js");

const root = path.join(__dirname, "..");
const src = ["utils.gs", "attendance.gs"]
  .map((f) => fs.readFileSync(path.join(root, f), "utf8"))
  .join("\n;\n");

const sheets = {};
const ctx = createContext(sheets);
vm.createContext(ctx);

// Build the Date value using the VM CONTEXT's own Date constructor — `vm`
// gives each context its own realm, so a `new Date()` built in the outer
// Node process would fail `instanceof Date` checks made by code running
// inside this context. This is exactly what makes the bug reproducible:
// a real Date object, indistinguishable from what Sheets hands back.
const today = vm.runInContext("new Date()", ctx);
sheets.Attendance = makeSheet(
  ["AttendanceID", "MemberID", "Name", "Department", "Date", "TimeIn", "TimeOut", "WorkingHours", "LateMinutes", "Status", "Remarks"],
  [["A0001", "M001", "Jane Cruz", "Ops", today, "08:03", "", 0, 0, "Present", ""]]
);

vm.runInContext(src, ctx);

const dateStr = ctx.today_();
const result = ctx.Attendance_.list({ date: dateStr });

if (result.rows.length !== 1) {
  console.error(`FAIL: expected 1 row for ${dateStr}, got ${result.rows.length}`);
  console.error("A date filter is comparing String(a.Date) directly instead of dstr_(a.Date).");
  process.exit(1);
}
console.log(`PASS: Attendance_.list() matched a real Date-object cell against '${dateStr}'`);
