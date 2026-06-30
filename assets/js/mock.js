/* =========================================================================
   Demo backend. Used when App.isDemo (API_URL is empty).
   Mirrors the real API contract so the UI is identical online or offline.
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

  // Seed members
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
      Status: "Active",
      CreatedAt: "2025-01-" + pad((i % 28) + 1),
    };
  });

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

  const settings = {
    OrgName: App.config.ORG_NAME, Timezone: App.config.TIMEZONE,
    GracePeriod: 10, WorkingDays: "Mon–Fri", EmailEnabled: true, Theme: App.config.THEME,
  };

  const delay = (v, ms = 280) => new Promise((res) => setTimeout(() => res(v), ms));

  const summaryFor = (rows) => {
    const present = rows.filter((r) => r.Status === "Present").length;
    const late = rows.filter((r) => r.Status === "Late").length;
    const absent = members.length - rows.filter((r) => r.Status !== "Absent").length;
    const rate = Math.round(((present + late) / members.length) * 100);
    return { present, late, absent: Math.max(absent, 0), rate };
  };

  const handlers = {
    login: ({ username }) => delay({
      token: "demo-" + Math.random().toString(36).slice(2),
      admin: { name: username || "Admin", role: "Administrator", email: "admin@example.com" },
      settings,
    }),
    logout: () => delay({}),
    "auth.changePassword": () => delay({}),

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
        return delay({ member: members[i] });
      }
      const m = { ...member, MemberID: "M" + pad(members.length + 1), CreatedAt: todayISO(), Status: member.Status || "Active" };
      members.push(m);
      return delay({ member: m });
    },
    "members.delete": ({ memberId }) => {
      const i = members.findIndex((m) => m.MemberID === memberId);
      if (i >= 0) members.splice(i, 1);
      return delay({});
    },

    "attendance.scan": ({ qr }) => {
      const m = members.find((x) => x.MemberID === qr) || rand(members);
      const existing = attendance.find((a) => a.MemberID === m.MemberID && a.Date === todayISO() && a.TimeIn);
      const now = new Date();
      const hhmm = `${pad(now.getHours()).slice(-2)}:${pad(now.getMinutes()).slice(-2)}`;
      let record, type, status;
      if (!existing) {
        const late = now.getHours() >= 8 ? 12 : 0;
        status = late ? "Late" : "Present";
        record = {
          AttendanceID: "A" + pad(++attSeq), MemberID: m.MemberID, Name: `${m.FirstName} ${m.LastName}`,
          Department: m.Department, Date: todayISO(), TimeIn: hhmm, TimeOut: "", WorkingHours: 0,
          LateMinutes: late, Status: status, Remarks: "",
        };
        attendance.unshift(record); type = "Time In";
      } else {
        existing.TimeOut = hhmm; existing.WorkingHours = 8; record = existing; type = "Time Out"; status = existing.Status;
      }
      return delay({ member: m, record, type, status }, 350);
    },
    "attendance.list": ({ date } = {}) => {
      const d = date || todayISO();
      const rows = attendance.filter((a) => a.Date === d);
      return delay({ rows, total: rows.length, date: d });
    },
    "attendance.update": ({ record }) => {
      const i = attendance.findIndex((a) => a.AttendanceID === record.AttendanceID);
      if (i >= 0) attendance[i] = { ...attendance[i], ...record };
      return delay({ record: attendance[i] });
    },

    "analytics.summary": () => {
      const labels = [], present = [], late = [];
      for (let d = 6; d >= 0; d--) {
        const date = new Date(); date.setDate(date.getDate() - d);
        const iso = date.toISOString().slice(0, 10);
        labels.push(date.toLocaleDateString(undefined, { weekday: "short" }));
        const rows = attendance.filter((a) => a.Date === iso);
        present.push(rows.filter((r) => r.Status === "Present").length);
        late.push(rows.filter((r) => r.Status === "Late").length);
      }
      const today = attendance.filter((a) => a.Date === todayISO());
      const byDept = DEPTS.map((dpt) => ({ dept: dpt, count: today.filter((r) => r.Department === dpt).length }));
      return delay({
        cards: { total: members.length, ...summaryFor(today) },
        series: { labels, present, late, byDept },
      });
    },

    "settings.save": ({ settings: s }) => { Object.assign(settings, s); return delay({ settings }); },
    "settings.get": () => delay({ settings }),

    "reports.generate": ({ type, range }) =>
      delay({ url: "#demo-report", summary: `Generated ${type} report (${range || "today"}). In production this is a Drive PDF link.` }),
  };

  App.mock = {
    handle: (action, payload) => {
      const h = handlers[action];
      if (!h) return Promise.reject(new Error("Unknown demo action: " + action));
      return h(payload || {});
    },
  };
})();
