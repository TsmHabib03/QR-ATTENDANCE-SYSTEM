/* =========================================================================
   Demo backend. Used when App.isDemo (API_URL is empty).
   Mirrors the real API contract so the UI is identical online or offline,
   including schedules, manual attendance, audit log, and rate analytics.
   Data lives in memory (resets on refresh) — perfect for previews/sales demos.
   ========================================================================= */
(function () {
  const DEPTS = ["Operations", "Finance", "HR", "IT", "Sales"];
  const STATUSES = ["Present", "Late", "Present", "Present", "Absent", "Present", "Excused"];
  const firstNames = ["Maria", "Jose", "Anna", "Mark", "Liza", "Paolo", "Grace", "Ramon", "Karla", "Diego", "Ivy", "Noel"];
  const lastNames = ["Santos", "Reyes", "Cruz", "Garcia", "Torres", "Flores", "Ramos", "Mendoza", "Aquino", "Castro"];

  const pad = (n) => String(n).padStart(3, "0");
  const rand = (a) => a[Math.floor(Math.random() * a.length)];
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const nowISO = () => new Date().toISOString();
  const toMin = (t) => { const p = String(t || "").split(":"); return (+p[0] || 0) * 60 + (+p[1] || 0); };

  // --- Schedules (no Default on purpose, so some members are "unscheduled") ---
  let schedules = [
    { ScheduleID: "SC001", ScheduleName: "Operations 8–5", ScopeType: "Department", ScopeValue: "Operations",
      StartTime: "08:00", EndTime: "17:00", GracePeriod: 10, LateAfter: "08:10", HalfDayAfter: "12:00",
      EarliestTimeIn: "06:00", LatestTimeOut: "19:00", WorkingDays: "Mon-Fri", Status: "Active", CreatedAt: nowISO(), UpdatedAt: nowISO() },
    { ScheduleID: "SC002", ScheduleName: "Sales 9–6", ScopeType: "Department", ScopeValue: "Sales",
      StartTime: "09:00", EndTime: "18:00", GracePeriod: 15, LateAfter: "09:15", HalfDayAfter: "13:00",
      EarliestTimeIn: "07:00", LatestTimeOut: "20:00", WorkingDays: "Mon-Sat", Status: "Active", CreatedAt: nowISO(), UpdatedAt: nowISO() },
  ];

  // Seed members — assign a few directly to a schedule; others rely on scope.
  const members = Array.from({ length: 24 }).map((_, i) => {
    const fn = rand(firstNames), ln = rand(lastNames);
    return {
      MemberID: "M" + pad(i + 1),
      EmployeeID: "EMP" + pad(1000 + i),
      FirstName: fn, MiddleName: "", LastName: ln,
      Gender: i % 2 ? "Female" : "Male",
      Department: rand(DEPTS), Section: "A", Position: "Staff",
      Contact: "09" + Math.floor(100000000 + Math.random() * 899999999),
      Email: `${fn}.${ln}`.toLowerCase() + "@example.com",
      QRCode: "M" + pad(i + 1),
      ScheduleID: i % 4 === 0 ? "SC001" : "",
      Status: "Active",
      CreatedAt: "2025-01-" + pad((i % 28) + 1),
    };
  });

  function resolveSchedule(m) {
    const active = schedules.filter((s) => (s.Status || "Active") === "Active");
    if (m.ScheduleID) { const direct = active.find((s) => s.ScheduleID === m.ScheduleID); if (direct) return direct; }
    return active.find((s) => s.ScopeType === "Employee" && s.ScopeValue === m.MemberID)
        || active.find((s) => s.ScopeType === "Position" && s.ScopeValue === m.Position)
        || active.find((s) => s.ScopeType === "Section" && s.ScopeValue === m.Section)
        || active.find((s) => s.ScopeType === "Department" && s.ScopeValue === m.Department)
        || active.find((s) => s.ScopeType === "Default")
        || null;
  }

  // Seed attendance (today + last 6 days)
  let attSeq = 0;
  const attendance = [];
  for (let d = 0; d < 7; d++) {
    const date = new Date(); date.setDate(date.getDate() - d);
    const iso = date.toISOString().slice(0, 10);
    members.forEach((m) => {
      const status = rand(STATUSES);
      if (status === "Absent" && Math.random() > .5) return;
      const late = status === "Late" ? Math.floor(5 + Math.random() * 40) : 0;
      attendance.push({
        AttendanceID: "A" + pad(++attSeq),
        MemberID: m.MemberID,
        Name: `${m.FirstName} ${m.LastName}`,
        Department: m.Department,
        Date: iso,
        TimeIn: status === "Absent" ? "" : `0${7 + (late > 0 ? 0 : 0)}:${pad(30 + late).slice(0, 2)}`,
        TimeOut: status === "Absent" ? "" : "17:0" + Math.floor(Math.random() * 9),
        WorkingHours: status === "Absent" ? 0 : 8,
        LateMinutes: late,
        Status: status,
        Remarks: "",
      });
    });
  }

  // In-memory audit log
  const auditLogs = [];
  let logSeq = 0;
  const logAudit = (action, user, description) =>
    auditLogs.unshift({ LogID: "L" + (++logSeq), User: user || "admin", Action: action, Description: description || "", Browser: "", IP: "", Timestamp: nowISO() });
  logAudit("Login", "admin", "Demo session started");

  const settings = {
    OrgName: App.config.ORG_NAME, Timezone: App.config.TIMEZONE,
    GracePeriod: 10, WorkingDays: "Mon-Fri", EmailEnabled: true, Theme: App.config.THEME,
  };

  const delay = (v, ms = 220) => new Promise((res) => setTimeout(() => res(v), ms));

  const summaryFor = (rows) => {
    const present = rows.filter((r) => r.Status === "Present").length;
    const late = rows.filter((r) => r.Status === "Late").length;
    const absent = members.length - rows.filter((r) => r.Status !== "Absent").length;
    const rate = Math.round(((present + late) / members.length) * 100);
    return { present, late, absent: Math.max(absent, 0), rate };
  };

  const handlers = {
    login: ({ username }) => { logAudit("Login", username || "admin", "Signed in"); return delay({
      token: "demo-" + Math.random().toString(36).slice(2),
      admin: { name: username || "Admin", role: "Administrator", email: "admin@example.com" },
      settings,
    }); },
    logout: () => { logAudit("Logout", "admin", "Signed out"); return delay({}); },
    "auth.changePassword": () => { logAudit("ChangePassword", "admin", "Password changed"); return delay({}); },

    "members.list": ({ search } = {}) => {
      let rows = members;
      if (search) {
        const q = search.toLowerCase();
        rows = rows.filter((m) => `${m.FirstName} ${m.LastName} ${m.EmployeeID} ${m.Department}`.toLowerCase().includes(q));
      }
      return delay({ rows, total: rows.length });
    },
    "members.save": ({ member }) => {
      if (member.MemberID) {
        const i = members.findIndex((m) => m.MemberID === member.MemberID);
        members[i] = { ...members[i], ...member };
        logAudit("MemberUpdate", "admin", "Updated " + member.MemberID);
        return delay({ member: members[i] });
      }
      const m = { ...member, MemberID: "M" + pad(members.length + 1), QRCode: "M" + pad(members.length + 1), CreatedAt: todayISO(), Status: member.Status || "Active" };
      members.push(m);
      logAudit("MemberCreate", "admin", "Created " + m.MemberID);
      return delay({ member: m });
    },
    "members.delete": ({ memberId }) => {
      const i = members.findIndex((m) => m.MemberID === memberId);
      if (i >= 0) members.splice(i, 1);
      logAudit("MemberDelete", "admin", "Deleted " + memberId);
      return delay({});
    },

    "schedule.list": () => delay({ rows: schedules }),
    "schedule.save": ({ schedule }) => {
      if (schedule.ScheduleID) {
        const i = schedules.findIndex((s) => s.ScheduleID === schedule.ScheduleID);
        schedules[i] = { ...schedules[i], ...schedule, UpdatedAt: nowISO() };
        logAudit("ScheduleChange", "admin", "Updated " + schedule.ScheduleID);
        return delay({ schedule: schedules[i] });
      }
      const s = { ...schedule, ScheduleID: "SC" + pad(schedules.length + 1), ScopeType: schedule.ScopeType || "Default", Status: schedule.Status || "Active", CreatedAt: nowISO(), UpdatedAt: nowISO() };
      schedules.push(s);
      logAudit("ScheduleChange", "admin", "Created " + s.ScheduleID);
      return delay({ schedule: s });
    },
    "schedule.delete": ({ scheduleId }) => {
      const i = schedules.findIndex((s) => s.ScheduleID === scheduleId);
      if (i >= 0) schedules.splice(i, 1);
      logAudit("ScheduleChange", "admin", "Deleted " + scheduleId);
      return delay({});
    },
    "schedule.toggle": ({ scheduleId }) => {
      const s = schedules.find((x) => x.ScheduleID === scheduleId);
      if (s) s.Status = s.Status === "Active" ? "Inactive" : "Active";
      logAudit("ScheduleChange", "admin", scheduleId + " → " + (s ? s.Status : ""));
      return delay({ schedule: s });
    },

    "attendance.scan": ({ qr }) => {
      const m = members.find((x) => x.MemberID === qr || x.QRCode === qr) || rand(members);
      const sched = resolveSchedule(m);
      const existing = attendance.find((a) => a.MemberID === m.MemberID && a.Date === todayISO());
      const now = new Date();
      const hhmm = `${pad(now.getHours()).slice(-2)}:${pad(now.getMinutes()).slice(-2)}`;
      let record, type, status;
      if (!existing) {
        let late = 0; status = "Present";
        if (sched) { late = Math.max(0, toMin(hhmm) - toMin(sched.LateAfter || sched.StartTime)); status = late > 0 ? "Late" : "Present"; }
        record = {
          AttendanceID: "A" + pad(++attSeq), MemberID: m.MemberID, Name: `${m.FirstName} ${m.LastName}`,
          Department: m.Department, Date: todayISO(), TimeIn: hhmm, TimeOut: "", WorkingHours: 0,
          LateMinutes: late, Status: status, Remarks: sched ? "" : "No schedule assigned",
        };
        attendance.unshift(record); type = "Time In";
      } else if (!existing.TimeOut) {
        existing.TimeOut = hhmm; existing.WorkingHours = 8; record = existing; type = "Time Out"; status = existing.Status;
      } else {
        return Promise.reject(new Error(`${m.FirstName} ${m.LastName} already timed in and out today.`));
      }
      logAudit("Scan", "admin", type + " " + m.MemberID);
      return delay({ member: m, record, type, status, noSchedule: !sched }, 200);
    },
    "attendance.manual": ({ record }) => {
      const m = members.find((x) => x.MemberID === record.MemberID);
      if (!m) return Promise.reject(new Error("Select a member first."));
      const date = record.Date || todayISO();
      const sched = resolveSchedule(m);
      let status = record.Status, late = 0;
      if (!status) {
        if (sched && record.TimeIn) { late = Math.max(0, toMin(record.TimeIn) - toMin(sched.LateAfter || sched.StartTime)); status = late > 0 ? "Late" : "Present"; }
        else status = "Present";
      }
      const hours = (record.TimeIn && record.TimeOut) ? Math.max(0, Math.round((toMin(record.TimeOut) - toMin(record.TimeIn)) / 60 * 100) / 100) : 0;
      const fields = { MemberID: m.MemberID, Name: `${m.FirstName} ${m.LastName}`, Department: m.Department, Date: date,
        TimeIn: record.TimeIn || "", TimeOut: record.TimeOut || "", WorkingHours: hours, LateMinutes: late,
        Status: status, Remarks: record.Remarks || (sched ? "" : "No schedule assigned") };
      let rec = attendance.find((a) => a.MemberID === m.MemberID && a.Date === date);
      if (rec) Object.assign(rec, fields); else { rec = { AttendanceID: "A" + pad(++attSeq), ...fields }; attendance.unshift(rec); }
      logAudit("ManualAttendance", "admin", m.MemberID + " " + date);
      return delay({ record: rec, noSchedule: !sched });
    },
    "attendance.list": ({ date } = {}) => {
      const d = date || todayISO();
      const rows = attendance.filter((a) => a.Date === d);
      return delay({ rows, total: rows.length, date: d });
    },
    "attendance.update": ({ record }) => {
      const i = attendance.findIndex((a) => a.AttendanceID === record.AttendanceID);
      if (i >= 0) attendance[i] = { ...attendance[i], ...record };
      logAudit("AttendanceEdit", "admin", "Edited " + record.AttendanceID);
      return delay({ record: attendance[i] });
    },
    "attendance.delete": ({ attendanceId }) => {
      const i = attendance.findIndex((a) => a.AttendanceID === attendanceId);
      if (i >= 0) attendance.splice(i, 1);
      logAudit("AttendanceDelete", "admin", "Deleted " + attendanceId);
      return delay({});
    },

    "analytics.summary": () => {
      const labels = [], present = [], late = [], absent = [];
      for (let d = 6; d >= 0; d--) {
        const date = new Date(); date.setDate(date.getDate() - d);
        const iso = date.toISOString().slice(0, 10);
        labels.push(date.toLocaleDateString(undefined, { weekday: "short" }));
        const rows = attendance.filter((a) => a.Date === iso);
        present.push(rows.filter((r) => r.Status === "Present").length);
        late.push(rows.filter((r) => r.Status === "Late").length);
        absent.push(Math.max(members.length - rows.length, 0));
      }
      const today = attendance.filter((a) => a.Date === todayISO());
      const byDept = DEPTS.map((dpt) => ({ dept: dpt, count: today.filter((r) => r.Department === dpt).length }));
      const s = summaryFor(today);
      const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
      const range = (n) => {
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - (n - 1));
        const iso = cutoff.toISOString().slice(0, 10);
        const rows = attendance.filter((a) => a.Date >= iso);
        const p = rows.filter((r) => r.Status === "Present").length;
        const l = rows.filter((r) => r.Status === "Late").length;
        const ab = rows.filter((r) => r.Status === "Absent").length;
        const hours = rows.reduce((t, a) => t + (Number(a.WorkingHours) || 0), 0);
        return { days: n, present: p, late: l, absent: ab, hours: Math.round(hours * 10) / 10, presentRate: pct(p, members.length * n), lateRate: pct(l, members.length * n) };
      };
      return delay({
        cards: { total: members.length, ...s, presentRate: pct(s.present, members.length), lateRate: pct(s.late, members.length), absentRate: pct(s.absent, members.length) },
        week: range(7), month: range(30),
        series: { labels, present, late, absent, byDept },
      });
    },

    "audit.list": ({ action, limit } = {}) => {
      let rows = auditLogs;
      if (action) rows = rows.filter((r) => r.Action === action);
      return delay({ rows: rows.slice(0, limit || 200), total: rows.length });
    },

    "settings.save": ({ settings: s }) => { Object.assign(settings, s); logAudit("SettingsUpdate", "admin", Object.keys(s || {}).join(", ")); return delay({ settings }); },
    "settings.get": () => delay({ settings }),

    "reports.generate": ({ type, range }) => {
      logAudit("ReportGenerate", "admin", type + " (" + (range || "today") + ")");
      return delay({ url: "#demo-report", summary: `Generated ${type} report (${range || "today"}). In production this is a Drive PDF/CSV link.` });
    },
  };

  App.mock = {
    handle: (action, payload) => {
      const h = handlers[action];
      if (!h) return Promise.reject(new Error("Unknown demo action: " + action));
      return h(payload || {});
    },
  };
})();
