/* ===== Attendance records: date filter, table, inline edit, delete, manual ===== */
(function () {
  App.pages.attendance = {
    title: "Attendance", crumb: "Attendance",
    async mount(view) {
      const today = new Date().toISOString().slice(0, 10);
      view.innerHTML = `
        <div class="page-head">
          <div><h1>Attendance records</h1><p>View, correct, or manually record attendance.</p></div>
          <div class="row">
            <label class="field__label" for="att-date" style="margin:0">Date</label>
            <input class="input" id="att-date" type="date" value="${today}" style="width:auto" />
            <button class="btn btn--primary" id="att-manual"><span data-icon="clipboard-pen"></span> Manual entry</button>
          </div>
        </div>
        <div id="att-table">${cardSkeleton()}</div>`;
      App.ui.icons(view);

      const load = async (date) => {
        const mount = App.ui.$("#att-table");
        mount.innerHTML = cardSkeleton();
        const { rows } = await App.api.call("attendance.list", { date }, { fresh: true });
        App.ui.dataTable(mount, {
          rows,
          pageSize: 12,
          searchKeys: ["Name", "Department", "Status"],
          empty: "No attendance recorded for this date.",
          columns: [
            { key: "Name", label: "Name", render: (r) => `<strong>${App.ui.esc(r.Name)}</strong>` },
            { key: "Department", label: "Dept" },
            { key: "TimeIn", label: "Time In", render: (r) => r.TimeIn || "—" },
            { key: "TimeOut", label: "Time Out", render: (r) => r.TimeOut || "—" },
            { key: "LateMinutes", label: "Late (min)", render: (r) => r.LateMinutes || 0 },
            { key: "WorkingHours", label: "Hours", render: (r) => r.WorkingHours || 0 },
            { key: "Status", label: "Status", render: (r) => App.ui.statusBadge(r.Status) },
            { key: "actions", label: "", sortable: false, className: "actions", render: (r) => `
              <button class="iconbtn" data-edit="${r.AttendanceID}" title="Edit"><span data-icon="pencil"></span></button>
              <button class="iconbtn" data-del="${r.AttendanceID}" title="Delete"><span data-icon="trash-2"></span></button>` },
          ],
        });
        App.ui.icons(mount);
        mount.onclick = async (e) => {
          const edit = e.target.closest("[data-edit]");
          const del = e.target.closest("[data-del]");
          if (edit) return openEdit(rows.find((r) => r.AttendanceID === edit.dataset.edit), () => load(date));
          if (del) {
            const rec = rows.find((r) => r.AttendanceID === del.dataset.del);
            const ok = await App.ui.confirm({ title: "Delete record?", text: `${rec.Name} — ${rec.Date} will be removed.`, confirmButtonText: "Delete" });
            if (!ok) return;
            await App.api.call("attendance.delete", { attendanceId: rec.AttendanceID });
            App.ui.toast("Record deleted."); App.bus.emit("attendance:changed");
            load(date);
          }
        };
      };

      App.ui.$("#att-date").addEventListener("change", (e) => load(e.target.value));
      App.ui.$("#att-manual").addEventListener("click", () => openManual(() => load(App.ui.$("#att-date").value)));
      load(today);
    },
  };

  function openEdit(rec, reload) {
    const body = App.ui.el("div");
    body.innerHTML = `<form id="att-form" class="form-grid">
      ${App.ui.input("TimeIn", "Time In", rec.TimeIn, { type: "time" })}
      ${App.ui.input("TimeOut", "Time Out", rec.TimeOut, { type: "time" })}
      ${App.ui.select("Status", "Status", rec.Status, ["Present", "Late", "Half Day", "Absent", "Excused", "Holiday"])}
      ${App.ui.input("Remarks", "Remarks", rec.Remarks || "")}
    </form>`;
    const footer = App.ui.el("div", { class: "row row--end", html: `<button class="btn" data-cancel>Cancel</button><button class="btn btn--primary" id="att-save"><span class="btn__label">Save changes</span></button>` });
    const { close, modal } = App.ui.modal({ title: `Edit — ${rec.Name}`, body, footer });
    footer.querySelector("[data-cancel]").addEventListener("click", close);
    footer.querySelector("#att-save").addEventListener("click", async () => {
      const data = Object.fromEntries(new FormData(modal.querySelector("#att-form")).entries());
      const btn = footer.querySelector("#att-save"); App.ui.busy(btn, true);
      try {
        await App.api.call("attendance.update", { record: { ...rec, ...data } });
        App.ui.toast("Attendance updated."); App.bus.emit("attendance:changed");
        close(); reload();
      } catch (err) { App.ui.toast(err.message, "error"); App.ui.busy(btn, false); }
    });
  }

  // Manual entry — reused by the scanner page via App.manualAttendance().
  async function openManual(onSaved) {
    let members = [];
    try { members = (await App.api.call("members.list", {})).rows || []; }
    catch (err) { return App.ui.toast(err.message, "error"); }

    const disp = (m) => `${m.FirstName} ${m.LastName} · ${m.MemberID}`;
    const dmap = {}; members.forEach((m) => (dmap[disp(m)] = m.MemberID));

    const body = App.ui.el("div");
    body.innerHTML = `<form id="man-form" class="form-grid">
      <div class="field" style="grid-column:1/-1">
        <label class="field__label" for="man-member">Member *</label>
        <input class="input" id="man-member" name="_member" list="man-list" placeholder="Search name or ID" autocomplete="off" required />
        <datalist id="man-list">${members.map((m) => `<option value="${App.ui.esc(disp(m))}"></option>`).join("")}</datalist>
      </div>
      ${App.ui.input("Date", "Date", new Date().toISOString().slice(0, 10), { type: "date" })}
      ${App.ui.select("Status", "Status (auto if blank)", "", ["", "Present", "Late", "Half Day", "Absent", "Excused", "Holiday"])}
      ${App.ui.input("TimeIn", "Time In", "", { type: "time" })}
      ${App.ui.input("TimeOut", "Time Out", "", { type: "time" })}
      <div class="field" style="grid-column:1/-1">
        <label class="field__label" for="man-remarks">Remarks</label>
        <input class="input" id="man-remarks" name="Remarks" type="text" />
      </div>
    </form>`;
    const footer = App.ui.el("div", { class: "row row--end", html: `<button class="btn" data-cancel>Cancel</button><button class="btn btn--primary" id="man-save"><span class="btn__label">Save attendance</span></button>` });
    const { close, modal } = App.ui.modal({ title: "Manual attendance", body, footer });
    footer.querySelector("[data-cancel]").addEventListener("click", close);

    footer.querySelector("#man-save").addEventListener("click", async () => {
      const form = modal.querySelector("#man-form");
      const val = form._member.value.trim();
      let memberId = dmap[val];
      if (!memberId) { const mm = val.match(/·\s*([A-Za-z0-9]+)\s*$/); if (mm) memberId = mm[1]; }
      if (!memberId) return App.ui.toast("Pick a member from the list.", "error");

      const data = Object.fromEntries(new FormData(form).entries());
      const btn = footer.querySelector("#man-save"); App.ui.busy(btn, true);
      try {
        await App.api.call("attendance.manual", { record: {
          MemberID: memberId, Date: data.Date, Status: data.Status,
          TimeIn: data.TimeIn, TimeOut: data.TimeOut, Remarks: data.Remarks,
        } });
        App.ui.toast("Attendance recorded."); App.bus.emit("attendance:changed");
        close(); onSaved && onSaved();
      } catch (err) { App.ui.toast(err.message, "error"); App.ui.busy(btn, false); }
    });
  }

  // Expose for the scanner page's "Manual entry" button.
  App.manualAttendance = openManual;

  const cardSkeleton = () => `<div class="card"><div class="card__body">${App.ui.skeletonRows(8)}</div></div>`;
})();
