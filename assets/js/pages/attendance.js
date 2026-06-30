/* ===== Attendance records: date filter, table, inline edit ===== */
(function () {
  App.pages.attendance = {
    title: "Attendance", crumb: "Attendance",
    async mount(view) {
      const today = new Date().toISOString().slice(0, 10);
      view.innerHTML = `
        <div class="page-head">
          <div><h1>Attendance records</h1><p>View and correct attendance.</p></div>
          <div class="row">
            <label class="field__label" for="att-date" style="margin:0">Date</label>
            <input class="input" id="att-date" type="date" value="${today}" style="width:auto" />
          </div>
        </div>
        <div id="att-table">${`<div class="card"><div class="card__body">${App.ui.skeletonRows(8)}</div></div>`}</div>`;
      App.ui.icons(view);

      const load = async (date) => {
        const mount = App.ui.$("#att-table");
        mount.innerHTML = `<div class="card"><div class="card__body">${App.ui.skeletonRows(8)}</div></div>`;
        const { rows } = await App.api.call("attendance.list", { date });
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
            { key: "actions", label: "", sortable: false, className: "actions", render: (r) => `<button class="iconbtn" data-edit="${r.AttendanceID}" title="Edit"><span data-icon="pencil"></span></button>` },
          ],
        });
        App.ui.icons(mount);
        mount.addEventListener("click", (e) => {
          const b = e.target.closest("[data-edit]"); if (!b) return;
          openEdit(rows.find((r) => r.AttendanceID === b.dataset.edit), () => load(date));
        });
      };

      App.ui.$("#att-date").addEventListener("change", (e) => load(e.target.value));
      load(today);
    },
  };

  function openEdit(rec, reload) {
    const body = App.ui.el("div");
    body.innerHTML = `<form id="att-form" class="form-grid">
      ${field("TimeIn", "Time In", rec.TimeIn, "time")}
      ${field("TimeOut", "Time Out", rec.TimeOut, "time")}
      ${statusField(rec.Status)}
      ${field("Remarks", "Remarks", rec.Remarks || "", "text")}
    </form>`;
    const footer = App.ui.el("div", { class: "row row--end", html: `<button class="btn" data-cancel>Cancel</button><button class="btn btn--primary" id="att-save">Save changes</button>` });
    const { close, modal } = App.ui.modal({ title: `Edit — ${rec.Name}`, body, footer });
    footer.querySelector("[data-cancel]").addEventListener("click", close);
    footer.querySelector("#att-save").addEventListener("click", async () => {
      const data = Object.fromEntries(new FormData(modal.querySelector("#att-form")).entries());
      try {
        await App.api.call("attendance.update", { record: { ...rec, ...data } });
        App.ui.toast("Attendance updated.");
        close(); reload();
      } catch (err) { App.ui.toast(err.message, "error"); }
    });
  }

  const field = (name, label, val = "", type = "text") =>
    `<div class="field"><label class="field__label" for="a-${name}">${label}</label><input class="input" id="a-${name}" name="${name}" type="${type}" value="${App.ui.esc(val)}" /></div>`;
  const statusField = (val) => {
    const opts = ["Present", "Late", "Half Day", "Absent", "Excused", "Holiday"];
    return `<div class="field"><label class="field__label" for="a-Status">Status</label><select class="input" id="a-Status" name="Status">${opts.map((o) => `<option ${o === val ? "selected" : ""}>${o}</option>`).join("")}</select></div>`;
  };
})();
