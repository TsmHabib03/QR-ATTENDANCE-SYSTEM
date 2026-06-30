/* ===== Members: list, add/edit, delete, schedule assignment, QR tools ===== */
(function () {
  let schedules = [], scheduleMap = {};

  App.pages.members = {
    title: "Members", crumb: "Members",
    async mount(view) {
      view.innerHTML = `
        <div class="page-head">
          <div><h1>Members</h1><p>Manage people, their schedules, and QR codes.</p></div>
          <div class="row">
            <button class="btn" id="m-qrall"><span data-icon="qr-code"></span> Print QR</button>
            <button class="btn" id="m-export"><span data-icon="download"></span> Export CSV</button>
            <button class="btn btn--primary" id="m-add"><span data-icon="user-plus"></span> Add member</button>
          </div>
        </div>
        <div id="m-table">${tableSkeleton()}</div>`;
      App.ui.icons(view);

      // Load members + schedules together (both cached); build a quick lookup.
      const [{ rows }, sched] = await Promise.all([
        App.api.call("members.list", {}),
        App.api.call("schedule.list", {}),
      ]);
      schedules = sched.rows || [];
      scheduleMap = {};
      schedules.forEach((s) => (scheduleMap[s.ScheduleID] = s));
      rows.forEach((r) => (r.name = r.FirstName + " " + r.LastName)); // for name-column sorting

      const mount = App.ui.$("#m-table");
      App.ui.dataTable(mount, {
        rows,
        pageSize: 10,
        searchKeys: ["FirstName", "LastName", "EmployeeID", "Department", "Email"],
        empty: "Add your first member to get started.",
        columns: [
          { key: "EmployeeID", label: "ID" },
          { key: "name", label: "Name", render: (r) => `<strong>${App.ui.esc(r.FirstName + " " + r.LastName)}</strong>` },
          { key: "Department", label: "Department" },
          { key: "ScheduleID", label: "Schedule", render: (r) => App.ui.esc(scheduleMap[r.ScheduleID] ? scheduleMap[r.ScheduleID].ScheduleName : "—") },
          { key: "Status", label: "Status", render: (r) => `<span class="badge ${r.Status === "Active" ? "st-present" : "badge--soft"}">${App.ui.esc(r.Status)}</span>` },
          { key: "actions", label: "", sortable: false, className: "actions", render: (r) => `
            <button class="iconbtn" data-qr="${r.MemberID}" title="QR code"><span data-icon="qr-code"></span></button>
            <button class="iconbtn" data-edit="${r.MemberID}" title="Edit"><span data-icon="pencil"></span></button>
            <button class="iconbtn" data-del="${r.MemberID}" title="Delete"><span data-icon="trash-2"></span></button>` },
        ],
      });
      App.ui.icons(mount);

      mount.addEventListener("click", async (e) => {
        const edit = e.target.closest("[data-edit]");
        const del = e.target.closest("[data-del]");
        const qr = e.target.closest("[data-qr]");
        if (edit) return openForm(rows.find((r) => r.MemberID === edit.dataset.edit));
        if (qr) return showQr(rows.find((r) => r.MemberID === qr.dataset.qr));
        if (del) {
          const m = rows.find((r) => r.MemberID === del.dataset.del);
          const ok = await App.ui.confirm({ title: "Delete member?", text: `${m.FirstName} ${m.LastName} will be removed.`, confirmButtonText: "Delete", icon: "warning" });
          if (!ok) return;
          await App.api.call("members.delete", { memberId: m.MemberID });
          App.ui.toast("Member deleted.");
          App.pages.members.mount(view);
        }
      });

      App.ui.$("#m-add").addEventListener("click", () => openForm(null));
      App.ui.$("#m-export").addEventListener("click", () => exportCsv(rows));
      App.ui.$("#m-qrall").addEventListener("click", () => printAllQr(rows));
    },
  };

  function scheduleOptions() {
    return [{ value: "", label: "— None (use scope / default) —" }].concat(
      schedules.map((s) => ({ value: s.ScheduleID, label: s.ScheduleName + (s.Status !== "Active" ? " (inactive)" : "") }))
    );
  }

  function openForm(member) {
    const m = member || {};
    const body = App.ui.el("div");
    body.innerHTML = `
      <form id="m-form">
        <div class="form-grid">
          ${App.ui.input("FirstName", "First name", m.FirstName, { req: true })}
          ${App.ui.input("LastName", "Last name", m.LastName, { req: true })}
          ${App.ui.input("EmployeeID", "Employee / Student ID", m.EmployeeID)}
          ${App.ui.select("Gender", "Gender", m.Gender, ["", "Male", "Female"])}
          ${App.ui.input("Department", "Department", m.Department)}
          ${App.ui.input("Section", "Section", m.Section)}
          ${App.ui.input("Position", "Position", m.Position)}
          ${App.ui.input("Contact", "Contact number", m.Contact)}
          ${App.ui.input("Email", "Email", m.Email, { type: "email" })}
          ${App.ui.select("ScheduleID", "Assigned schedule", m.ScheduleID, scheduleOptions())}
          ${App.ui.select("Status", "Status", m.Status || "Active", ["Active", "Inactive", "Archived"])}
        </div>
      </form>`;
    const footer = App.ui.el("div", { class: "row row--end", html: `
      <button class="btn" data-cancel>Cancel</button>
      <button class="btn btn--primary" id="m-save"><span class="btn__label">Save member</span></button>` });

    const { close, modal } = App.ui.modal({ title: member ? "Edit member" : "Add member", body, footer });
    footer.querySelector("[data-cancel]").addEventListener("click", close);

    footer.querySelector("#m-save").addEventListener("click", async () => {
      const data = Object.fromEntries(new FormData(modal.querySelector("#m-form")).entries());
      if (!data.FirstName || !data.LastName) { App.ui.toast("First and last name are required.", "error"); return; }
      const btn = footer.querySelector("#m-save"); App.ui.busy(btn, true);
      try {
        await App.api.call("members.save", { member: { ...m, ...data } });
        App.ui.toast("Member saved.");
        close();
        App.pages.members.mount(App.ui.$("#view"));
      } catch (err) {
        App.ui.toast(err.message, "error");
        App.ui.busy(btn, false);
      }
    });
  }

  // ---- QR code: preview + download (hi-res) + print + regenerate ----
  const qrText = (m) => m.QRCode || m.MemberID;

  function showQr(m) {
    const body = App.ui.el("div", { class: "stack" });
    body.innerHTML = `<p class="muted">QR encodes the member's code only — never personal data.</p><div class="qr-box" id="qrbox"></div>
      <p class="row" style="justify-content:center"><strong>${App.ui.esc(m.FirstName + " " + m.LastName)}</strong> · ${App.ui.esc(m.MemberID)}</p>`;
    const footer = App.ui.el("div", { class: "row row--end", html: `
      <button class="btn" data-cancel>Close</button>
      <button class="btn" id="qr-regen"><span data-icon="refresh-cw"></span> Regenerate</button>
      <button class="btn" id="qr-download"><span data-icon="download"></span> Download</button>
      <button class="btn btn--primary" id="qr-print"><span data-icon="printer"></span> Print</button>` });
    const { close, modal } = App.ui.modal({ title: "Member QR code", body, footer });
    App.ui.icons(modal);

    const renderBox = () => { const box = modal.querySelector("#qrbox"); box.innerHTML = ""; new QRCode(box, { text: qrText(m), width: 200, height: 200, correctLevel: QRCode.CorrectLevel.H }); };
    renderBox();

    footer.querySelector("[data-cancel]").addEventListener("click", close);
    footer.querySelector("#qr-download").addEventListener("click", () => downloadQr(m));
    footer.querySelector("#qr-print").addEventListener("click", () => printQr(m, modal.querySelector("#qrbox img, #qrbox canvas")));
    footer.querySelector("#qr-regen").addEventListener("click", async () => {
      const ok = await App.ui.confirm({ title: "Regenerate QR?", text: "A new code is issued for this member. Reprint and redistribute it.", confirmButtonText: "Regenerate" });
      if (!ok) return;
      const token = "QR" + (self.crypto && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "").slice(0, 10) : Math.random().toString(36).slice(2, 12)).toUpperCase();
      try {
        await App.api.call("members.save", { member: { ...m, QRCode: token } });
        m.QRCode = token; renderBox();
        App.ui.toast("QR regenerated.");
      } catch (err) { App.ui.toast(err.message, "error"); }
    });
  }

  // Render a QR offscreen at high resolution and return a PNG data URL.
  function qrDataUrl(text, size = 1024) {
    return new Promise((resolve) => {
      const tmp = App.ui.el("div", { style: "position:fixed;left:-9999px;top:-9999px" });
      document.body.appendChild(tmp);
      new QRCode(tmp, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.H });
      setTimeout(() => {
        const canvas = tmp.querySelector("canvas"), img = tmp.querySelector("img");
        const url = canvas ? canvas.toDataURL("image/png") : img ? img.src : "";
        tmp.remove();
        resolve(url);
      }, 60);
    });
  }

  async function downloadQr(m) {
    const url = await qrDataUrl(qrText(m), 1024);
    const a = App.ui.el("a", { href: url, download: `QR-${m.MemberID}.png` });
    a.click();
    App.ui.toast("QR downloaded.");
  }

  function printQr(m, node) {
    const src = node && node.tagName === "IMG" ? node.src : node ? node.toDataURL() : "";
    const w = window.open("", "_blank");
    if (!w) return App.ui.toast("Allow pop-ups to print.", "error");
    w.document.write(`<title>QR — ${m.MemberID}</title><body style="font-family:sans-serif;text-align:center;padding:40px">
      <img src="${src}" style="width:260px;height:260px"/><h2>${App.ui.esc(m.FirstName + " " + m.LastName)}</h2><p>${m.MemberID}</p>
      <script>onload=()=>print()<\/script></body>`);
    w.document.close();
  }

  async function printAllQr(rows) {
    if (!rows.length) return App.ui.toast("No members to print.", "info");
    const w = window.open("", "_blank");
    if (!w) return App.ui.toast("Allow pop-ups to print QR codes.", "error");
    w.document.write(`<title>QR codes</title><style>
      body{font-family:sans-serif;margin:0;padding:16px}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
      .cell{border:1px solid #ddd;border-radius:8px;padding:12px;text-align:center;page-break-inside:avoid}
      .cell img{width:180px;height:180px}.cell h4{margin:8px 0 2px;font-size:14px}.cell p{margin:0;color:#666;font-size:12px}
    </style><div class="grid" id="g"></div>`);
    App.ui.toast("Preparing QR sheet…", "info");
    for (const m of rows) {
      const url = await qrDataUrl(qrText(m), 320);
      const cell = w.document.createElement("div");
      cell.className = "cell";
      cell.innerHTML = `<img src="${url}"/><h4>${App.ui.esc(m.FirstName + " " + m.LastName)}</h4><p>${m.MemberID}</p>`;
      w.document.getElementById("g").appendChild(cell);
    }
    w.document.close(); w.focus();
    setTimeout(() => w.print(), 400);
  }

  function exportCsv(rows) {
    const cols = ["MemberID", "EmployeeID", "FirstName", "LastName", "Department", "Section", "Position", "Contact", "Email", "ScheduleID", "Status"];
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = App.ui.el("a", { href: URL.createObjectURL(blob), download: "members.csv" });
    a.click(); URL.revokeObjectURL(a.href);
    App.ui.toast("Exported members.csv");
  }

  const tableSkeleton = () => `<div class="card"><div class="card__body">${App.ui.skeletonRows(8)}</div></div>`;
})();
