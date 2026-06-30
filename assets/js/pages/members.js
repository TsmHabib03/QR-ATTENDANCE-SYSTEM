/* ===== Members: list, add/edit, delete, QR ===== */
(function () {
  let table;

  App.pages.members = {
    title: "Members", crumb: "Members",
    async mount(view) {
      view.innerHTML = `
        <div class="page-head">
          <div><h1>Members</h1><p>Manage people and their QR codes.</p></div>
          <div class="row">
            <button class="btn" id="m-export"><span data-icon="download"></span> Export CSV</button>
            <button class="btn btn--primary" id="m-add"><span data-icon="user-plus"></span> Add member</button>
          </div>
        </div>
        <div id="m-table">${tableSkeleton()}</div>`;
      App.ui.icons(view);

      const { rows } = await App.api.call("members.list", {});
      rows.forEach((r) => (r.name = r.FirstName + " " + r.LastName)); // for name-column sorting
      const mount = App.ui.$("#m-table");
      table = App.ui.dataTable(mount, {
        rows,
        pageSize: 10,
        searchKeys: ["FirstName", "LastName", "EmployeeID", "Department", "Email"],
        empty: "Add your first member to get started.",
        columns: [
          { key: "EmployeeID", label: "ID" },
          { key: "name", label: "Name", render: (r) => `<strong>${App.ui.esc(r.FirstName + " " + r.LastName)}</strong>` },
          { key: "Department", label: "Department" },
          { key: "Email", label: "Email" },
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
    },
  };

  function openForm(member) {
    const m = member || {};
    const body = App.ui.el("div");
    body.innerHTML = `
      <form id="m-form">
        <div class="form-grid">
          ${input("FirstName", "First name", m.FirstName, true)}
          ${input("LastName", "Last name", m.LastName, true)}
          ${input("EmployeeID", "Employee / Student ID", m.EmployeeID)}
          ${select("Gender", "Gender", m.Gender, ["", "Male", "Female"])}
          ${input("Department", "Department", m.Department)}
          ${input("Section", "Section", m.Section)}
          ${input("Position", "Position", m.Position)}
          ${input("Contact", "Contact number", m.Contact)}
          ${input("Email", "Email", m.Email, false, "email")}
          ${select("Status", "Status", m.Status || "Active", ["Active", "Inactive", "Archived"])}
        </div>
      </form>`;
    const footer = App.ui.el("div", { class: "row row--end", html: `
      <button class="btn" data-cancel>Cancel</button>
      <button class="btn btn--primary" id="m-save"><span class="btn__label">Save member</span><span class="spinner" hidden></span></button>` });

    const { close, modal } = App.ui.modal({ title: member ? "Edit member" : "Add member", body, footer });
    footer.querySelector("[data-cancel]").addEventListener("click", close);

    footer.querySelector("#m-save").addEventListener("click", async () => {
      const form = modal.querySelector("#m-form");
      const data = Object.fromEntries(new FormData(form).entries());
      if (!data.FirstName || !data.LastName) { App.ui.toast("First and last name are required.", "error"); return; }
      const btn = footer.querySelector("#m-save"); btn.disabled = true; btn.querySelector(".spinner").hidden = false;
      try {
        await App.api.call("members.save", { member: { ...m, ...data } });
        App.ui.toast("Member saved.");
        close();
        App.pages.members.mount(App.ui.$("#view"));
      } catch (err) {
        App.ui.toast(err.message, "error");
        btn.disabled = false; btn.querySelector(".spinner").hidden = true;
      }
    });
  }

  function showQr(m) {
    const body = App.ui.el("div", { class: "stack" });
    body.innerHTML = `<p class="muted">QR encodes the Member ID only — never personal data.</p><div class="qr-box" id="qrbox"></div>
      <p class="row" style="justify-content:center"><strong>${App.ui.esc(m.FirstName + " " + m.LastName)}</strong> · ${App.ui.esc(m.MemberID)}</p>`;
    const footer = App.ui.el("div", { class: "row row--end", html: `<button class="btn" data-cancel>Close</button><button class="btn btn--primary" id="qr-print"><span data-icon="printer"></span> Print</button>` });
    const { close, modal } = App.ui.modal({ title: "Member QR code", body, footer });
    App.ui.icons(modal);
    new QRCode(modal.querySelector("#qrbox"), { text: m.MemberID, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.H });
    footer.querySelector("[data-cancel]").addEventListener("click", close);
    footer.querySelector("#qr-print").addEventListener("click", () => printQr(m, modal.querySelector("#qrbox img, #qrbox canvas")));
  }

  function printQr(m, node) {
    const src = node.tagName === "IMG" ? node.src : node.toDataURL();
    const w = window.open("", "_blank");
    w.document.write(`<title>QR — ${m.MemberID}</title><body style="font-family:sans-serif;text-align:center;padding:40px">
      <img src="${src}" style="width:260px;height:260px"/><h2>${App.ui.esc(m.FirstName + " " + m.LastName)}</h2><p>${m.MemberID}</p>
      <script>onload=()=>print()<\/script></body>`);
    w.document.close();
  }

  function exportCsv(rows) {
    const cols = ["MemberID", "EmployeeID", "FirstName", "LastName", "Department", "Section", "Position", "Contact", "Email", "Status"];
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = App.ui.el("a", { href: URL.createObjectURL(blob), download: "members.csv" });
    a.click(); URL.revokeObjectURL(a.href);
    App.ui.toast("Exported members.csv");
  }

  // helpers
  const input = (name, label, val = "", req = false, type = "text") =>
    `<div class="field"><label class="field__label" for="f-${name}">${label}${req ? " *" : ""}</label>
     <input class="input" id="f-${name}" name="${name}" type="${type}" value="${App.ui.esc(val)}" ${req ? "required" : ""} /></div>`;
  const select = (name, label, val, opts) =>
    `<div class="field"><label class="field__label" for="f-${name}">${label}</label>
     <select class="input" id="f-${name}" name="${name}">${opts.map((o) => `<option ${o === val ? "selected" : ""} value="${App.ui.esc(o)}">${App.ui.esc(o || "—")}</option>`).join("")}</select></div>`;
  const tableSkeleton = () => `<div class="card"><div class="card__body">${App.ui.skeletonRows(8)}</div></div>`;
})();
