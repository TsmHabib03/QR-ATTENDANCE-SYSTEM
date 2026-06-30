/* =========================================================================
   UI helpers: DOM, icons, toasts, skeletons, status badges, and a reusable
   client-side data table (search + sort + pagination) — no DataTables/jQuery.
   ========================================================================= */
(function () {
  const ui = {};

  // ---- DOM ----
  ui.$  = (sel, root = document) => root.querySelector(sel);
  ui.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  ui.el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) node.setAttribute(k, v);
    }
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  };

  // Escape untrusted text before injecting into innerHTML.
  ui.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Render lucide icons inside [data-icon] placeholders.
  ui.icons = (root = document) => {
    if (window.lucide && lucide.createIcons) {
      ui.$$("[data-icon]", root).forEach((n) => {
        if (n.dataset.iconDone) return;
        const name = n.getAttribute("data-icon");
        n.innerHTML = "";
        const i = document.createElement("i");
        i.setAttribute("data-lucide", name);
        n.appendChild(i);
        n.dataset.iconDone = "1";
      });
      lucide.createIcons({ attrs: { width: 20, height: 20 } });
    }
  };

  // ---- Toasts (SweetAlert2) ----
  const Toast = () => Swal.mixin({
    toast: true, position: "bottom-end", showConfirmButton: false,
    timer: 2600, timerProgressBar: true,
  });
  ui.toast = (text, icon = "success") => Toast().fire({ icon, title: text });
  ui.confirm = async (opts) => {
    const r = await Swal.fire({
      icon: "warning", showCancelButton: true,
      confirmButtonText: "Confirm", cancelButtonText: "Cancel",
      confirmButtonColor: "#0D9488", cancelButtonColor: "#94A3B8",
      ...opts,
    });
    return r.isConfirmed;
  };

  // ---- Skeletons ----
  ui.skeletonKpis = (n = 5) =>
    `<div class="kpis">${Array.from({ length: n }).map(() => `<div class="skeleton skeleton--kpi"></div>`).join("")}</div>`;
  ui.skeletonChart = () => `<div class="skeleton skeleton--chart"></div>`;
  ui.skeletonRows = (rows = 6) =>
    Array.from({ length: rows }).map(() =>
      `<div class="skeleton skeleton--text" style="width:${60 + Math.random() * 35}%"></div>`).join("");

  // ---- Status badge ----
  ui.statusBadge = (status) => {
    const map = {
      Present: "st-present", Late: "st-late", Absent: "st-absent",
      Excused: "st-excused", Holiday: "st-holiday", "Half Day": "st-halfday",
    };
    const cls = map[status] || "badge--soft";
    return `<span class="badge ${cls}">${ui.esc(status)}</span>`;
  };

  ui.initials = (name) =>
    (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  // ---- Timing ----
  ui.debounce = (fn, ms = 250) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  // ---- Button busy state (disable + spinner; preserves the label) ----
  ui.busy = (btn, on) => {
    if (!btn) return;
    if (on) {
      btn.disabled = true;
      if (!btn.querySelector(".spinner")) {
        const sp = document.createElement("span");
        sp.className = "spinner";
        btn.appendChild(sp);
      }
      const label = btn.querySelector(".btn__label"); if (label) label.style.opacity = ".6";
    } else {
      btn.disabled = false;
      const sp = btn.querySelector(".spinner"); if (sp && !sp.hasAttribute("data-keep")) sp.remove();
      const label = btn.querySelector(".btn__label"); if (label) label.style.opacity = "";
    }
  };

  // ---- Global top progress bar (driven by api.js around every request) ----
  let pending = 0, bar;
  ui.progress = (on) => {
    if (!bar) {
      bar = ui.el("div", { id: "app-progress" });
      document.body.appendChild(bar);
    }
    pending = Math.max(0, pending + (on ? 1 : -1));
    if (pending > 0) { bar.classList.add("is-active"); }
    else { bar.classList.remove("is-active"); }
  };

  // ---- Shared form-field builders (used by every page form) ----
  ui.input = (name, label, val = "", { req = false, type = "text", attrs = "" } = {}) =>
    `<div class="field"><label class="field__label" for="f-${name}">${ui.esc(label)}${req ? " *" : ""}</label>
     <input class="input" id="f-${name}" name="${name}" type="${type}" value="${ui.esc(val)}" ${req ? "required" : ""} ${attrs} /></div>`;
  ui.select = (name, label, val, opts) =>
    `<div class="field"><label class="field__label" for="f-${name}">${ui.esc(label)}</label>
     <select class="input" id="f-${name}" name="${name}">${opts.map((o) => {
       const value = typeof o === "object" ? o.value : o;
       const text = typeof o === "object" ? o.label : (o || "—");
       return `<option value="${ui.esc(value)}" ${String(value) === String(val ?? "") ? "selected" : ""}>${ui.esc(text)}</option>`;
     }).join("")}</select></div>`;

  // ---- Modal ----
  ui.modal = ({ title, body, footer }) => {
    const scrim = ui.el("div", { class: "modal-scrim" });
    const modal = ui.el("div", { class: "modal", role: "dialog", "aria-modal": "true" });
    modal.innerHTML = `
      <div class="modal__head">
        <h3 class="card__title">${ui.esc(title)}</h3>
        <button class="iconbtn" data-close aria-label="Close"><span data-icon="x"></span></button>
      </div>
      <div class="modal__body"></div>
      <div class="modal__foot"></div>`;
    modal.querySelector(".modal__body").append(body);
    if (footer) modal.querySelector(".modal__foot").append(footer);
    scrim.append(modal);
    document.body.append(scrim);
    ui.icons(scrim);
    const close = () => scrim.remove();
    scrim.addEventListener("click", (e) => { if (e.target === scrim) close(); });
    modal.querySelector("[data-close]").addEventListener("click", close);
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
    });
    return { close, modal };
  };

  /* ---------------------------------------------------------------------
     Reusable data table: search + click-to-sort + pagination.
     columns: [{ key, label, render?(row), sortable?, className? }]
     --------------------------------------------------------------------- */
  ui.dataTable = (mount, { columns, rows, pageSize = 10, searchKeys, empty }) => {
    let state = { q: "", sort: null, dir: 1, page: 1 };
    const keys = searchKeys || columns.map((c) => c.key);

    const wrap = ui.el("div");
    const toolbar = ui.el("div", { class: "toolbar", html: `
      <div class="search">
        <span data-icon="search"></span>
        <input class="input" type="search" placeholder="Search…" aria-label="Search table" />
      </div>` });
    const tableWrap = ui.el("div", { class: "table-wrap" });
    const pager = ui.el("div", { class: "pager" });
    wrap.append(toolbar, tableWrap, pager);
    mount.innerHTML = "";
    mount.append(wrap);

    const filtered = () => {
      let r = rows;
      if (state.q) {
        const q = state.q.toLowerCase();
        r = r.filter((row) => keys.some((k) => String(row[k] ?? "").toLowerCase().includes(q)));
      }
      if (state.sort) {
        r = [...r].sort((a, b) => {
          const x = a[state.sort], y = b[state.sort];
          if (x == null) return 1; if (y == null) return -1;
          return (x > y ? 1 : x < y ? -1 : 0) * state.dir;
        });
      }
      return r;
    };

    const render = () => {
      const all = filtered();
      const pages = Math.max(1, Math.ceil(all.length / pageSize));
      state.page = Math.min(state.page, pages);
      const start = (state.page - 1) * pageSize;
      const slice = all.slice(start, start + pageSize);

      if (!all.length) {
        tableWrap.innerHTML = `<div class="empty"><span data-icon="inbox"></span><h3>Nothing here yet</h3><p>${ui.esc(empty || "No records match your search.")}</p></div>`;
        pager.innerHTML = ""; ui.icons(tableWrap); return;
      }

      tableWrap.innerHTML = `
        <table class="data">
          <thead><tr>${columns.map((c) => {
            const sorted = state.sort === c.key;
            const arrow = sorted ? (state.dir === 1 ? "▲" : "▼") : "↕";
            return `<th data-key="${c.key}" class="${sorted ? "sorted" : ""} ${c.className || ""}">
              ${ui.esc(c.label)} ${c.sortable === false ? "" : `<span class="sort">${arrow}</span>`}</th>`;
          }).join("")}</tr></thead>
          <tbody>${slice.map((row) => `<tr>${columns.map((c) =>
            `<td class="${c.className || ""}" data-label="${ui.esc(c.label || "")}">${c.render ? c.render(row) : ui.esc(row[c.key])}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>`;

      pager.innerHTML = `
        <span class="pager__info">Showing ${start + 1}–${Math.min(start + pageSize, all.length)} of ${all.length}</span>
        <div class="pager__btns">
          <button class="btn btn--sm" data-pg="prev" ${state.page === 1 ? "disabled" : ""}>Prev</button>
          <button class="btn btn--sm" data-pg="next" ${state.page === pages ? "disabled" : ""}>Next</button>
        </div>`;
      ui.icons(tableWrap);
    };

    toolbar.querySelector("input").addEventListener("input", (e) => { state.q = e.target.value; state.page = 1; render(); });
    tableWrap.addEventListener("click", (e) => {
      const th = e.target.closest("th[data-key]"); if (!th) return;
      const col = columns.find((c) => c.key === th.dataset.key);
      if (col && col.sortable === false) return;
      const key = th.dataset.key;
      if (state.sort === key) state.dir *= -1; else { state.sort = key; state.dir = 1; }
      render();
    });
    pager.addEventListener("click", (e) => {
      const b = e.target.closest("[data-pg]"); if (!b) return;
      state.page += b.dataset.pg === "next" ? 1 : -1; render();
    });

    render();
    return { refresh: (newRows) => { rows = newRows; render(); } };
  };

  App.ui = ui;
})();
