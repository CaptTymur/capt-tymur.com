/* ──────────────────────────────────────────────────────────────────────────
   МАСТЕРСКАЯ МЕТОДИСТА

   Среда, где методист строит курс: дерево корпуса → курсы → разделы → стенды,
   создание и правка на любом уровне, перетаскивание стендов между разделами,
   связи между стендами и разделами и карта этих связей. Представление для
   слушателя — павильон (index.html): он читает то, что сохранено здесь.

   Всё хранится в браузере методиста (см. model.js). Кнопка «ДАННЫЕ» выгружает
   академию одним файлом — это и резерв, и материал для публикации.
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";
  const M = window.SKIPI_MODEL;
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  let toastTimer = 0;
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 2400); }
  const nowTime = () => new Date().toTimeString().slice(0, 8);
  function setStatus(txt, busy) { const s = $("status"); s.textContent = txt; s.classList.toggle("busy", !!busy); }

  /* ═══ состояние ═══════════════════════════════════════════════════════ */
  const FILE_ACADEMY = window.SKIPI_ACADEMY || { title: "Академия", buildings: [] };
  const S = {
    buildings: [],            // структура (см. model.cloneStructure)
    sections: {},             // id → {id, title, subtitle, stands[], hasFile, fileFp, fileStands[], fileTitle}
    links: [],
    guests: {},               // ключ ссылки → {name, role, note, local}
    trash: [],
    sel: { type: "academy" },
    expanded: new Set(),
    pick: null,               // режим указания цели связи в дереве
    q: ""
  };
  try { JSON.parse(localStorage.getItem("skipi-studio/expanded") || "[]").forEach((k) => S.expanded.add(k)); } catch (e) { /* пусто */ }
  function rememberExpanded() { try { localStorage.setItem("skipi-studio/expanded", JSON.stringify([...S.expanded])); } catch (e) { /* пусто */ } }

  function loadScript(src) {
    return new Promise((res) => {
      const s = document.createElement("script");
      s.src = src; s.onload = () => res(true); s.onerror = () => res(false);
      document.head.appendChild(s);
    });
  }

  /* ─── ключ преподавателя ────────────────────────────────────────────────
     Засов, а не замок: страница статическая, отпечаток лежит открыто. Он
     отделяет рабочее место от слушателя, а не защищает материал. Пока
     отпечаток не задан, мастерская открыта и говорит об этом вслух. */
  const KEY_HASH = String(((window.SKIPI_STUDIO || {}).keyHash) || "").trim().toLowerCase();
  const KEY_STORE = "skipi-studio/key";
  async function sha256(text) {
    if (!(crypto && crypto.subtle)) return "";
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  async function keyAccepted(word) { return !!word && (await sha256(word)) === KEY_HASH; }
  async function passGate() {
    if (!KEY_HASH) return true;
    let saved = ""; try { saved = localStorage.getItem(KEY_STORE) || ""; } catch (e) { saved = ""; }
    return await keyAccepted(saved);
  }
  function showGate() {
    const g = $("gate"); g.hidden = false;
    setTimeout(() => $("gate-key").focus(), 50);
    const tryKey = async () => {
      const w = $("gate-key").value;
      if (await keyAccepted(w)) {
        try { localStorage.setItem(KEY_STORE, w); } catch (e) { /* не страшно */ }
        g.hidden = true; start();
      } else { $("gate-err").hidden = false; $("gate-key").select(); }
    };
    $("gate-ok").addEventListener("click", tryKey);
    $("gate-key").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); tryKey(); } });
  }

  const allDoors = () => { const out = []; S.buildings.forEach((b) => b.courses.forEach((c) => c.doors.forEach((d) => out.push({ b, c, d })))); return out; };
  const findDoor = (sec) => allDoors().find((x) => x.d.pavilion === sec) || null;
  const secName = (id) => (S.sections[id] && S.sections[id].title) || (findDoor(id) || { d: { label: id } }).d.label || id;
  const standOf = (sec, id) => (S.sections[sec] ? S.sections[sec].stands.find((s) => s.id === id) : null) || null;
  const standName = (s) => s ? (s.title || s.short) : "стенд не найден";

  /* ═══ загрузка ════════════════════════════════════════════════════════ */
  async function loadSection(id, door) {
    try { delete window.SKIPI_PAVILION; } catch (e) { window.SKIPI_PAVILION = undefined; }
    const ok = await loadScript("content/" + id + ".js");
    const p = (ok && window.SKIPI_PAVILION && Array.isArray(window.SKIPI_PAVILION.stands)) ? window.SKIPI_PAVILION : null;
    const fileRaw = p ? p.stands : [];
    const sec = {
      id, hasFile: !!p, fileFp: M.fingerprint(fileRaw), fileRaw,
      fileTitle: (p && p.title) || "", fileSub: (p && p.subtitle) || "",
      title: (p && p.title) || (door ? door.label : id), subtitle: (p && p.subtitle) || "",
      stands: [], notice: ""
    };
    const saved = await M.storeGet(id);
    if (saved && Array.isArray(saved.stands) && saved.seedFingerprint === sec.fileFp) {
      sec.stands = saved.stands.map(M.normalizeStand);
      if (saved.title) { sec.title = String(saved.title); sec.subtitle = String(saved.subtitle || ""); }
    } else {
      sec.stands = fileRaw.map(M.normalizeStand);
      if (saved && Array.isArray(saved.stands) && saved.stands.length) {
        // файл содержания обновился после правок в браузере: как и павильон, прячем прежний набор в резерв
        await M.storeSet(id + "/backup", { backedUpAt: new Date().toISOString(), seedFingerprint: saved.seedFingerprint || "", stands: saved.stands, title: saved.title || "", subtitle: saved.subtitle || "" });
        sec.notice = "Файл содержания обновлён разработчиком; ваш прежний набор отложен в резерв (" + saved.stands.length + " стендов).";
      }
    }
    S.sections[id] = sec;
    return sec;
  }

  async function load() {
    setStatus("загрузка…", true);
    const ov = await M.storeGet(M.KEY_ACADEMY);
    if (ov && Array.isArray(ov.buildings)) {
      const m = M.mergeStructure(FILE_ACADEMY.buildings || [], ov.buildings);
      S.buildings = m.buildings;
      if (m.added) { await saveStructure(); toast("Из файла добавлено в структуру: " + m.added); }
    } else S.buildings = M.cloneStructure(FILE_ACADEMY.buildings || []);
    for (const { d } of allDoors()) if (d.pavilion && !S.sections[d.pavilion]) await loadSection(d.pavilion, d);
    const ovL = await M.storeGet(M.KEY_LINKS);
    const raw = (ovL && Array.isArray(ovL.links)) ? ovL.links : (((window.SKIPI_LINKS || {}).links) || []);
    S.links = raw.map(M.normalizeLink).filter(Boolean);
    // Слушатели: опубликованные из файла плюс заведённые в этом браузере.
    const fileG = window.SKIPI_GUESTS || {};
    const savedG = await M.storeGet("__guests");
    S.guests = {};
    for (const [k, v] of Object.entries(fileG)) S.guests[k] = { name: v.name || k, role: v.role || "cadet", note: v.note || "", local: false };
    if (savedG && savedG.guests) for (const [k, v] of Object.entries(savedG.guests)) {
      const was = S.guests[k];
      S.guests[k] = { name: v.name || k, role: v.role || "cadet", note: v.note || "", local: !was || was.name !== v.name };
    }
    const tr = await M.storeGet(M.KEY_TRASH);
    S.trash = (tr && Array.isArray(tr.items)) ? tr.items : [];
    if (!S.expanded.size) S.buildings.forEach((b) => { S.expanded.add("b:" + b.id); b.courses.forEach((c) => S.expanded.add("c:" + c.id)); });
    // Куда смотреть при входе: место, переданное павильоном адресом #sel=…,
    // иначе то, что было выбрано в прошлый раз.
    const fromPavilion = selFromAddress();
    if (fromPavilion) S.sel = fromPavilion;
    else { try { const last = JSON.parse(localStorage.getItem("skipi-studio/sel") || "null"); if (last && validSel(last)) S.sel = last; } catch (e) { /* пусто */ } }
    if (S.sel.type === "stand" || S.sel.type === "section") {
      const w = findDoor(S.sel.sec);
      if (w) { S.expanded.add("b:" + w.b.id); S.expanded.add("c:" + w.c.id); if (S.sel.type === "stand") S.expanded.add("s:" + S.sel.sec); }
    }
    setStatus("готово " + nowTime());
    renderAll();
  }
  // Обратный адрес из павильона: #sel=<раздел>[/<стенд>] | c:<корпус>:<курс> | b:<корпус>
  function selFromAddress() {
    const m = /(?:^|[#&])sel=([^&]*)/.exec(location.hash || "");
    if (!m || !m[1]) return null;
    const spec = m[1];
    let sel = null;
    if (spec.indexOf("b:") === 0) sel = { type: "building", b: decodeURIComponent(spec.slice(2)) };
    else if (spec.indexOf("c:") === 0) {
      const p = spec.slice(2).split(":");
      sel = { type: "course", b: decodeURIComponent(p[0] || ""), c: decodeURIComponent(p[1] || "") };
    } else {
      const p = spec.split("/");
      sel = p[1] ? { type: "stand", sec: decodeURIComponent(p[0]), stand: decodeURIComponent(p[1]) }
                 : { type: "section", sec: decodeURIComponent(p[0]) };
    }
    return validSel(sel) ? sel : null;
  }
  function validSel(sel) {
    if (!sel || !sel.type) return false;
    if (sel.type === "academy") return true;
    if (sel.type === "building") return S.buildings.some((b) => b.id === sel.b);
    if (sel.type === "course") return S.buildings.some((b) => b.id === sel.b && b.courses.some((c) => c.id === sel.c));
    if (sel.type === "section") return !!S.sections[sel.sec];
    if (sel.type === "stand") return !!standOf(sel.sec, sel.stand);
    return false;
  }

  /* ═══ сохранение ══════════════════════════════════════════════════════ */
  async function saveStructure() {
    setStatus("сохраняю…", true);
    await M.storeSet(M.KEY_ACADEMY, { version: 1, savedAt: new Date().toISOString(), buildings: M.cloneStructure(S.buildings) });
    setStatus("сохранено " + nowTime());
  }
  async function saveSection(id) {
    const sec = S.sections[id]; if (!sec) return;
    setStatus("сохраняю…", true);
    const ok = await M.storeSet(id, {
      version: 2, savedAt: new Date().toISOString(), seedFingerprint: sec.fileFp,
      stands: sec.stands.map(M.plainStand), title: sec.title, subtitle: sec.subtitle
    });
    setStatus(ok ? "сохранено " + nowTime() : "НЕ СОХРАНЕНО: нет места", !ok);
    if (!ok) toast("Не удалось сохранить: в браузере кончилось место");
  }
  async function saveLinks() {
    setStatus("сохраняю…", true);
    await M.storeSet(M.KEY_LINKS, { version: 1, savedAt: new Date().toISOString(), links: S.links });
    setStatus("сохранено " + nowTime());
  }
  async function saveGuests() {
    const out = {};
    for (const [k, v] of Object.entries(S.guests)) out[k] = { name: v.name, role: v.role, note: v.note };
    await M.storeSet("__guests", { version: 1, savedAt: new Date().toISOString(), guests: out });
  }
  async function saveTrash() { await M.storeSet(M.KEY_TRASH, { version: 1, savedAt: new Date().toISOString(), items: S.trash }); }
  const timers = {};
  function later(key, fn) { clearTimeout(timers[key]); setStatus("правка…", true); timers[key] = setTimeout(fn, 350); }

  /* ═══ выбор ═══════════════════════════════════════════════════════════ */
  function select(sel) {
    S.sel = sel;
    try { localStorage.setItem("skipi-studio/sel", JSON.stringify(sel)); } catch (e) { /* пусто */ }
    if (sel.type === "stand" || sel.type === "section") {
      const w = findDoor(sel.sec);
      if (w) { S.expanded.add("b:" + w.b.id); S.expanded.add("c:" + w.c.id); if (sel.type === "stand") S.expanded.add("s:" + sel.sec); }
    }
    if (sel.type === "course") S.expanded.add("b:" + sel.b);
    rememberExpanded();
    renderAll();
    const row = document.querySelector("#tree .row.sel");
    if (row) row.scrollIntoView({ block: "nearest" });
  }
  const isSel = (sel) => JSON.stringify(sel) === JSON.stringify(S.sel);
  function syncStatusSel() {
    const st = $("status-sel"), sel = S.sel; if (!st) return;
    const w = (sel.sec && findDoor(sel.sec)) || null;
    st.textContent = sel.type === "academy" ? "Академия"
      : sel.type === "building" ? (S.buildings.find((b) => b.id === sel.b) || {}).label || ""
      : sel.type === "course" ? ((S.buildings.find((b) => b.id === sel.b) || { courses: [] }).courses.find((c) => c.id === sel.c) || {}).label || ""
      : (w ? w.c.label + " \\ " : "") + secName(sel.sec) + (sel.type === "stand" ? " \\ " + standName(standOf(sel.sec, sel.stand)) : "");
  }
  function renderAll() { renderTree(); renderInspector(); renderLinks(); syncStatusSel(); }

  /* ═══ дерево ══════════════════════════════════════════════════════════ */
  const linkCount = (sec, stand) => S.links.filter((l) =>
    (l.from.sec === sec && (stand ? l.from.stand === stand : !l.from.stand)) ||
    (l.to.sec === sec && (stand ? l.to.stand === stand : !l.to.stand))).length;
  const hit = (txt) => S.q && String(txt || "").toLowerCase().indexOf(S.q) >= 0;

  function renderTree() {
    const tree = $("tree");
    tree.innerHTML = "";
    tree.classList.toggle("picking", !!S.pick);
    const q = S.q;
    if (!S.buildings.length) { tree.appendChild(el("li", "tree-empty", "Корпусов нет. Нажмите «+ корпус».")); return; }
    for (const b of S.buildings) {
      const liB = el("li");
      const anyHitB = q && (hit(b.label) || b.courses.some((c) => hit(c.label) || c.doors.some((d) => hit(secName(d.pavilion) || d.label) || (S.sections[d.pavilion] || { stands: [] }).stands.some((s) => hit(s.title) || hit(s.short)))));
      if (q && !anyHitB) continue;
      const openB = q ? true : S.expanded.has("b:" + b.id);
      const rb = treeRow({ lvl: "building", kind: "корпус", name: b.label, closed: !b.open, sel: { type: "building", b: b.id }, tw: openB ? "▾" : "▸", key: "b:" + b.id, plus: "+ курс", onPlus: () => newCourse(b), hit: hit(b.label) });
      liB.appendChild(rb);
      if (openB) {
        const ulC = el("ul");
        for (const c of b.courses) {
          const anyHitC = q && (hit(c.label) || c.doors.some((d) => hit(secName(d.pavilion) || d.label) || (S.sections[d.pavilion] || { stands: [] }).stands.some((s) => hit(s.title) || hit(s.short))));
          if (q && !anyHitC) continue;
          const liC = el("li");
          const openC = q ? true : S.expanded.has("c:" + c.id);
          liC.appendChild(treeRow({ lvl: "course", kind: c.sub || "курс", name: c.label, closed: !c.open, sel: { type: "course", b: b.id, c: c.id }, tw: openC ? "▾" : "▸", key: "c:" + c.id, plus: "+ раздел", onPlus: () => newSection(b, c), marks: c.doors.length ? "разделов " + c.doors.length : "пусто", hit: hit(c.label) }));
          if (openC) {
            const ulS = el("ul");
            c.doors.forEach((d, di) => {
              const id = d.pavilion;
              const sec = id ? S.sections[id] : null;
              const name = sec ? sec.title : d.label;
              const stands = sec ? sec.stands : [];
              const anyHitS = q && (hit(name) || stands.some((s) => hit(s.title) || hit(s.short)));
              if (q && !anyHitS) return;
              const liS = el("li");
              const openS = q ? true : S.expanded.has("s:" + id);
              const local = sec && (M.fingerprint(sec.stands) !== sec.fileFp || !sec.hasFile);
              const marks = [sec ? (stands.length ? "стендов " + stands.length : "пусто") : "не создан", sec && !d.open ? "закрыт" : ""].filter(Boolean).join(" · ");
              const row = treeRow({ lvl: "section", kind: "раздел", name, closed: !d.open || !sec, sel: sec ? { type: "section", sec: id } : { type: "course", b: b.id, c: c.id }, tw: sec ? (openS ? "▾" : "▸") : "", key: "s:" + id, plus: sec ? "+ стенд" : "создать", onPlus: sec ? () => newStand(id) : () => createForDoor(c, d), marks, local: !!local, links: sec ? linkCount(id, "") : 0, hit: hit(name), pickable: !!sec, node: sec ? { sec: id } : null, dropSec: sec ? id : "" });
              liS.appendChild(row);
              if (sec && openS) {
                const ulT = el("ul");
                stands.forEach((s, i) => {
                  if (q && !(hit(s.title) || hit(s.short) || hit(name))) return;
                  const liT = el("li");
                  liT.appendChild(treeRow({ lvl: "stand", num: String(i + 1).padStart(2, "0"), shrt: s.short, accent: s.accent, name: s.title || s.short, sel: { type: "stand", sec: id, stand: s.id }, draft: s.draft, links: linkCount(id, s.id), hit: hit(s.title) || hit(s.short), pickable: true, node: { sec: id, stand: s.id }, drag: { sec: id, stand: s.id, i }, marks: [(s.images && s.images.length > 1) ? "слайдов " + s.images.length : (s.image ? "слайд" : ""), (s.videos && s.videos.length) ? "видео" : "", (s.downloads && s.downloads.length) ? "файл" : ""].filter(Boolean).join(" · ") }));
                  ulT.appendChild(liT);
                });
                if (!stands.length) { const e = el("li"); const r = el("div", "row closed"); r.appendChild(el("span", "tw", "")); r.appendChild(el("span", "name", "стендов нет — «+ стенд»")); r.dataset.dropSec = id; bindDrop(r, id, stands.length); e.appendChild(r); ulT.appendChild(e); }
                liS.appendChild(ulT);
              }
              ulS.appendChild(liS);
            });
            if (!c.doors.length) { const e = el("li"); const r = el("div", "row closed"); r.appendChild(el("span", "tw", "")); r.appendChild(el("span", "name", "разделов нет — «+ раздел»")); e.appendChild(r); ulS.appendChild(e); }
            liC.appendChild(ulS);
          }
          ulC.appendChild(liC);
        }
        liB.appendChild(ulC);
      }
      tree.appendChild(liB);
    }
    if (q && !tree.children.length) tree.appendChild(el("li", "tree-empty", "Ничего не найдено: «" + q + "»"));
  }

  function treeRow(o) {
    const row = el("div", "row lvl-" + o.lvl + (o.closed ? " closed" : "") + (o.sel && isSel(o.sel) ? " sel" : "") + (o.draft ? " draft" : "") + (o.hit ? " hit" : "") + (o.pickable ? " pickable" : ""));
    if (o.lvl !== "stand") {
      const tw = el("span", "tw", o.tw || "");
      if (o.tw) tw.dataset.o = o.tw === "▾" ? "−" : "+";
      if (o.key && o.tw) tw.addEventListener("click", (e) => { e.stopPropagation(); if (S.expanded.has(o.key)) S.expanded.delete(o.key); else S.expanded.add(o.key); rememberExpanded(); renderTree(); });
      row.appendChild(tw);
      row.appendChild(el("span", "ic"));
      row.appendChild(el("span", "kind", o.kind));
    } else {
      row.appendChild(el("span", "num", o.num));
      const sh = el("span", "shrt", o.shrt); sh.style.background = o.accent; row.appendChild(sh);
    }
    row.appendChild(el("span", "name", o.name));
    const marks = el("span", "marks");
    const parts = [];
    if (o.marks) parts.push(document.createTextNode(o.marks));
    if (o.links) { const l = el("span", "ln", "⇄" + o.links); parts.push(l); }
    if (o.local) parts.push(el("span", "local", "в браузере"));
    parts.forEach((p, i) => { if (i) marks.appendChild(document.createTextNode(" · ")); marks.appendChild(p); });
    row.appendChild(marks);
    if (o.plus && o.onPlus) {
      const p = el("button", "plus", o.plus); p.type = "button";
      p.addEventListener("click", (e) => { e.stopPropagation(); o.onPlus(); });
      row.appendChild(p);
    }
    row.addEventListener("click", () => {
      if (S.pick) { if (o.pickable && o.node) pickTarget(o.node); return; }
      if (o.sel) select(o.sel);
    });
    row.addEventListener("dblclick", () => { if (o.key && o.tw) { if (S.expanded.has(o.key)) S.expanded.delete(o.key); else S.expanded.add(o.key); rememberExpanded(); renderTree(); } });
    if (o.drag) bindDrag(row, o.drag);
    if (o.dropSec) bindDrop(row, o.dropSec, null);
    if (o.node) bindFileDrop(row, o.node.stand ? { type: "stand", sec: o.node.sec, stand: o.node.stand } : { type: "section", sec: o.node.sec });
    return row;
  }

  /* ─── перетаскивание стендов: внутри раздела и между разделами ──────── */
  let dragging = null;
  function bindDrag(row, d) {
    row.draggable = true;
    row.addEventListener("dragstart", (e) => { dragging = d; row.classList.add("drag"); try { e.dataTransfer.setData("text/plain", d.sec + "/" + d.stand); e.dataTransfer.effectAllowed = "move"; } catch (err) { /* пусто */ } });
    row.addEventListener("dragend", () => { dragging = null; row.classList.remove("drag"); document.querySelectorAll("#tree .row").forEach((r) => r.classList.remove("over-top", "over-bot", "over-in")); });
    row.addEventListener("dragover", (e) => {
      if (!dragging) return; e.preventDefault();
      const r = row.getBoundingClientRect(); const top = e.clientY < r.top + r.height / 2;
      row.classList.toggle("over-top", top); row.classList.toggle("over-bot", !top);
    });
    row.addEventListener("dragleave", () => row.classList.remove("over-top", "over-bot"));
    row.addEventListener("drop", (e) => {
      if (!dragging) return; e.preventDefault();
      const r = row.getBoundingClientRect(); const top = e.clientY < r.top + r.height / 2;
      moveStand(dragging, d.sec, d.i + (top ? 0 : 1));
    });
  }
  // Картинка, бро́шенная из системы прямо на строку дерева: на стенд или в раздел.
  function bindFileDrop(row, sel) {
    const isFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].indexOf("Files") >= 0;
    row.addEventListener("dragover", (e) => { if (dragging || !isFiles(e)) return; e.preventDefault(); row.classList.add("over-in"); });
    row.addEventListener("dragleave", () => { if (!dragging) row.classList.remove("over-in"); });
    row.addEventListener("drop", async (e) => {
      if (dragging || !isFiles(e)) return;
      e.preventDefault(); e.stopPropagation(); row.classList.remove("over-in");
      const srcs = await imagesFrom(e.dataTransfer);
      if (!srcs.length) { toast("Это не картинка"); return; }
      await absorbImages(sel, srcs);
    });
  }
  function bindDrop(row, sec, atEnd) {
    row.addEventListener("dragover", (e) => { if (!dragging) return; e.preventDefault(); row.classList.add("over-in"); });
    row.addEventListener("dragleave", () => row.classList.remove("over-in"));
    row.addEventListener("drop", (e) => { if (!dragging) return; e.preventDefault(); row.classList.remove("over-in"); moveStand(dragging, sec, atEnd == null ? S.sections[sec].stands.length : atEnd); });
  }
  async function moveStand(from, toSec, toIndex) {
    const a = S.sections[from.sec], b = S.sections[toSec]; if (!a || !b) return;
    const i = a.stands.findIndex((s) => s.id === from.stand); if (i < 0) return;
    const [s] = a.stands.splice(i, 1);
    if (a === b && i < toIndex) toIndex--;
    toIndex = Math.max(0, Math.min(toIndex, b.stands.length));
    if (a !== b && b.stands.some((x) => x.id === s.id)) s.id = M.newId("s");
    b.stands.splice(toIndex, 0, s);
    if (a !== b) {
      S.links.forEach((l) => { if (l.from.sec === from.sec && l.from.stand === from.stand) { l.from.sec = toSec; l.from.stand = s.id; } if (l.to.sec === from.sec && l.to.stand === from.stand) { l.to.sec = toSec; l.to.stand = s.id; } });
      await saveLinks(); await saveSection(from.sec);
    }
    await saveSection(toSec);
    dragging = null;
    select({ type: "stand", sec: toSec, stand: s.id });
    toast(a === b ? "Порядок изменён" : "Стенд перенесён в «" + b.title + "»");
  }

  /* ═══ создание ════════════════════════════════════════════════════════ */
  const TR = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya", і: "i", ї: "yi", є: "ye", ґ: "g" };
  function slug(t) {
    let s = String(t || "").toLowerCase().split("").map((ch) => TR[ch] != null ? TR[ch] : ch).join("");
    s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
    return s || "x";
  }
  async function uniqueSecId(base) {
    const used = new Set(Object.keys(S.sections));
    (await M.storeKeys()).forEach((k) => used.add(k.split("/")[0]));
    let id = base, n = 2;
    while (used.has(id) || id.startsWith("__")) id = base + "-" + (n++);
    return id;
  }
  function newBuilding() {
    const b = { id: M.newId("b"), label: "Новый корпус", address: "", style: "corpus", open: true, courses: [] };
    S.buildings.push(b); S.expanded.add("b:" + b.id);
    saveStructure().then(() => select({ type: "building", b: b.id }));
  }
  function newCourse(b) {
    const c = { id: M.newId("c"), label: "Новый курс", sub: "Курс", open: true, doors: [] };
    b.courses.push(c); S.expanded.add("b:" + b.id); S.expanded.add("c:" + c.id);
    saveStructure().then(() => select({ type: "course", b: b.id, c: c.id }));
  }
  async function newSection(b, c, title) {
    const label = title || ("Раздел " + (c.doors.length + 1));
    const id = await uniqueSecId(slug(label));
    c.doors.push({ label, open: true, pavilion: id });
    S.sections[id] = { id, hasFile: false, fileFp: M.fingerprint([]), fileRaw: [], fileTitle: "", fileSub: "", title: label, subtitle: c.label, stands: [], notice: "" };
    await saveSection(id); await saveStructure();
    S.expanded.add("c:" + c.id); S.expanded.add("s:" + id);
    select({ type: "section", sec: id });
    toast("Раздел создан: «" + label + "»");
  }
  // Дверь, нарисованная в файле «СКОРО» без содержания: становится настоящим разделом.
  async function createForDoor(c, d) {
    const id = await uniqueSecId(slug(d.label));
    d.pavilion = id; d.open = true;
    S.sections[id] = { id, hasFile: false, fileFp: M.fingerprint([]), fileRaw: [], fileTitle: "", fileSub: "", title: d.label, subtitle: c.label, stands: [], notice: "" };
    await saveSection(id); await saveStructure();
    S.expanded.add("c:" + c.id); S.expanded.add("s:" + id);
    select({ type: "section", sec: id });
    toast("Раздел создан: «" + d.label + "» — теперь в него можно класть стенды");
  }
  async function newStand(sec, after) {
    const s = S.sections[sec]; if (!s) return;
    const st = M.normalizeStand({ short: "НОВЫЙ", title: "", custom: true }, s.stands.length);
    const at = after == null ? s.stands.length : after + 1;
    s.stands.splice(at, 0, st);
    await saveSection(sec);
    S.expanded.add("s:" + sec);
    select({ type: "stand", sec, stand: st.id });
    setTimeout(() => { const f = document.querySelector("#insp [data-f=short]"); if (f) { f.focus(); f.select(); } }, 50);
  }
  $("btn-add-building").addEventListener("click", newBuilding);
  // «Вставить картинку» в панели: кладёт в то, что сейчас выбрано в дереве.
  $("btn-paste").addEventListener("click", () => pasteFromClipboard((srcs) => absorbImages(S.sel, srcs)));

  /* ═══ инспектор ═══════════════════════════════════════════════════════ */
  function field(label, value, opts) {
    opts = opts || {};
    const w = el("div", "f");
    const l = el("label", null, label);
    if (opts.hint) l.appendChild(el("i", null, opts.hint));
    w.appendChild(l);
    const inp = opts.multi ? el("textarea") : el("input");
    if (!opts.multi) inp.type = opts.type || "text";
    if (opts.multi && opts.tall) inp.classList.add("tall");
    if (opts.mono) inp.classList.add("mono");
    inp.value = value == null ? "" : value;
    if (opts.placeholder) inp.placeholder = opts.placeholder;
    if (opts.f) inp.dataset.f = opts.f;
    if (opts.readonly) inp.readOnly = true;
    if (opts.on) inp.addEventListener("input", () => opts.on(inp.value, inp));
    if (opts.onEnter) inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !opts.multi) { e.preventDefault(); opts.onEnter(inp.value); } });
    w.appendChild(inp);
    if (opts.below) w.appendChild(el("div", "hint", opts.below));
    return w;
  }
  function check(label, value, on) {
    const l = el("label", "chk"); const i = el("input"); i.type = "checkbox"; i.checked = !!value;
    i.addEventListener("change", () => on(i.checked));
    l.appendChild(i); l.appendChild(document.createTextNode(label)); return l;
  }
  const cap = (t) => t && /^[a-zа-яё]/.test(t) ? t[0].toUpperCase() + t.slice(1) : t;
  function btn(txt, cls, on) { const b = el("button", "tool " + (cls || ""), cap(txt)); b.type = "button"; b.addEventListener("click", on); return b; }
  function crumbs(parts) {
    const c = el("div", "crumbs");
    parts.forEach((p, i) => { if (i) c.appendChild(document.createTextNode("  ›  ")); const b = el("b", null, p.label); if (p.sel) { b.style.cursor = "pointer"; b.addEventListener("click", () => select(p.sel)); } c.appendChild(b); });
    return c;
  }
  function kv(rows) {
    const d = el("dl", "kv");
    rows.forEach(([k, v]) => { d.appendChild(el("dt", null, k)); const dd = el("dd"); if (typeof v === "string") dd.innerHTML = v; else dd.appendChild(v); d.appendChild(dd); });
    return d;
  }

  function renderInspector() {
    const box = $("insp"); box.innerHTML = "";
    const sel = S.sel;
    if (!validSel(sel)) { S.sel = { type: "academy" }; }
    if (S.sel.type === "academy") return inspAcademy(box);
    if (S.sel.type === "building") return inspBuilding(box, S.buildings.find((b) => b.id === S.sel.b));
    if (S.sel.type === "course") { const b = S.buildings.find((x) => x.id === S.sel.b); return inspCourse(box, b, b.courses.find((c) => c.id === S.sel.c)); }
    if (S.sel.type === "section") return inspSection(box, S.sections[S.sel.sec]);
    if (S.sel.type === "stand") return inspStand(box, S.sections[S.sel.sec], standOf(S.sel.sec, S.sel.stand));
  }

  function inspAcademy(box) {
    const nC = S.buildings.reduce((n, b) => n + b.courses.length, 0);
    const secs = Object.values(S.sections);
    const nSt = secs.reduce((n, s) => n + s.stands.length, 0);
    box.appendChild(crumbs([{ label: "академия" }]));
    box.appendChild(el("h1", null, FILE_ACADEMY.title || "Академия"));
    box.appendChild(el("p", "sub", "Корпусов " + S.buildings.length + ", курсов " + nC + ", разделов " + secs.length + ", стендов " + nSt + ", связей " + S.links.length + "."));
    const bar = el("div", "bar");
    bar.appendChild(btn("+ корпус", "add", newBuilding));
    bar.appendChild(btn("карта связей", "", () => openMap(null)));
    bar.appendChild(btn("выгрузить всё", "", exportAll));
    box.appendChild(bar);
    box.appendChild(el("div", "sec-h", "Как это устроено"));
    const p = el("div"); p.style.cssText = "color:var(--muted); font-size:13px; max-width:620px";
    p.innerHTML = "Слева дерево: <b>корпус → курс → раздел → стенд</b>. Нажмите на любую строку — здесь откроется её карточка, справа связи. " +
      "Наведите на строку: кнопка «+» создаёт вложенный уровень. Стенды перетаскиваются мышью внутри раздела и в другой раздел. " +
      "Всё сохраняется само, в этот браузер; переключатель <b>ИГРА</b> наверху показывает павильон так, как его видит слушатель. " +
      "Чтобы сделанное увидели слушатели, нажмите «данные» → «выгрузить всё» и пришлите файл разработчику.";
    box.appendChild(p);
    const notices = secs.filter((s) => s.notice);
    if (notices.length) { box.appendChild(el("div", "sec-h", "Обратите внимание")); notices.forEach((s) => box.appendChild(el("p", "warn-t", "«" + s.title + "»: " + s.notice))); }
  }

  function inspBuilding(box, b) {
    box.appendChild(crumbs([{ label: "академия", sel: { type: "academy" } }, { label: "корпус" }]));
    box.appendChild(el("h1", null, b.label));
    box.appendChild(el("p", "sub", "Курсов " + b.courses.length + "."));
    const bar = el("div", "bar");
    bar.appendChild(btn("+ курс", "add", () => newCourse(b)));
    bar.appendChild(btn("удалить корпус", "warn", async () => {
      if (b.courses.some((c) => c.doors.length)) { toast("Сначала уберите курсы с разделами"); return; }
      if (!confirm("Удалить корпус «" + b.label + "»?")) return;
      S.buildings = S.buildings.filter((x) => x !== b); await saveStructure(); select({ type: "academy" });
    }));
    box.appendChild(bar);
    box.appendChild(field("Название", b.label, { on: (v) => { b.label = v || "Корпус"; later("st", () => { saveStructure(); renderTree(); }); } }));
    box.appendChild(field("Адрес на вывеске", b.address, { on: (v) => { b.address = v; later("st", saveStructure); } }));
    box.appendChild(check("Корпус открыт для слушателей", b.open, (v) => { b.open = v; saveStructure(); renderTree(); }));
    box.appendChild(el("div", "sec-h", "Курсы"));
    box.appendChild(orderList(b.courses, (c) => c.label, (c) => c.doors.length ? "разделов " + c.doors.length : "пусто", (c) => select({ type: "course", b: b.id, c: c.id }), () => saveStructure()));
  }

  function inspCourse(box, b, c) {
    box.appendChild(crumbs([{ label: "академия", sel: { type: "academy" } }, { label: b.label, sel: { type: "building", b: b.id } }, { label: "курс" }]));
    box.appendChild(el("h1", null, c.label));
    const nSt = c.doors.reduce((n, d) => n + ((S.sections[d.pavilion] || { stands: [] }).stands.length), 0);
    box.appendChild(el("p", "sub", "Разделов " + c.doors.length + ", стендов " + nSt + "."));
    const bar = el("div", "bar");
    bar.appendChild(btn("+ раздел", "add", () => newSection(b, c)));
    bar.appendChild(btn("карта связей курса", "", () => openMap(c)));
    const pv = el("a", "tool", "открыть в павильоне ↗"); pv.href = "index.html"; pv.target = "pavilion"; pv.addEventListener("click", setBuildMode); bar.appendChild(pv);
    bar.appendChild(btn("удалить курс", "warn", async () => {
      if (c.doors.length) { toast("Сначала удалите разделы курса"); return; }
      if (!confirm("Удалить курс «" + c.label + "»?")) return;
      b.courses = b.courses.filter((x) => x !== c); await saveStructure(); select({ type: "building", b: b.id });
    }));
    box.appendChild(bar);
    const g = el("div", "grid2");
    g.appendChild(field("Название курса", c.label, { on: (v) => { c.label = v || "Курс"; later("st", () => { saveStructure(); renderTree(); }); } }));
    g.appendChild(field("Подпись на двери", c.sub, { hint: "например «Курс»", on: (v) => { c.sub = v; later("st", saveStructure); } }));
    box.appendChild(g);
    box.appendChild(check("Курс открыт для слушателей", c.open, (v) => { c.open = v; saveStructure(); renderTree(); }));
    box.appendChild(el("div", "sec-h", "Разделы по порядку"));
    const f = el("div", "f");
    const inp = el("input"); inp.type = "text"; inp.placeholder = "название нового раздела — Enter";
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && inp.value.trim()) { e.preventDefault(); newSection(b, c, inp.value.trim()); } });
    f.appendChild(inp); box.appendChild(f);
    box.appendChild(orderList(c.doors, (d) => secName(d.pavilion) || d.label, (d) => { const s = S.sections[d.pavilion]; return [s ? (s.stands.length ? "стендов " + s.stands.length : "пусто") : "не создан — нажмите, чтобы создать", s && !d.open ? "закрыт" : ""].filter(Boolean).join(" · "); }, (d) => { if (S.sections[d.pavilion]) select({ type: "section", sec: d.pavilion }); else createForDoor(c, d); }, () => saveStructure()));
  }

  // Список с перестановкой стрелками: курсы корпуса, разделы курса.
  function orderList(arr, name, marks, onOpen, onChange) {
    const w = el("div", "tbl");
    if (!arr.length) { w.appendChild(el("div", "empty", "Пока пусто.")); return w; }
    arr.forEach((x, i) => {
      const r = el("div", "trow");
      r.appendChild(el("span", "n", String(i + 1).padStart(2, "0")));
      r.appendChild(el("span", "t", name(x)));
      r.appendChild(el("span", "m", marks(x)));
      const up = el("button", "mv", "▲"), dn = el("button", "mv", "▼");
      up.disabled = i === 0; dn.disabled = i === arr.length - 1;
      up.addEventListener("click", async (e) => { e.stopPropagation(); arr.splice(i - 1, 0, arr.splice(i, 1)[0]); await onChange(); renderAll(); });
      dn.addEventListener("click", async (e) => { e.stopPropagation(); arr.splice(i + 1, 0, arr.splice(i, 1)[0]); await onChange(); renderAll(); });
      r.appendChild(up); r.appendChild(dn);
      r.addEventListener("click", () => onOpen(x));
      w.appendChild(r);
    });
    return w;
  }

  function inspSection(box, sec) {
    const w = findDoor(sec.id);
    box.appendChild(crumbs([{ label: "академия", sel: { type: "academy" } }, w ? { label: w.b.label, sel: { type: "building", b: w.b.id } } : null, w ? { label: w.c.label, sel: { type: "course", b: w.b.id, c: w.c.id } } : null, { label: "раздел" }].filter(Boolean)));
    box.appendChild(el("h1", null, sec.title));
    box.appendChild(el("p", "sub", "Стендов " + sec.stands.length + ", связей " + S.links.filter((l) => l.from.sec === sec.id || l.to.sec === sec.id).length + "."));
    const bar = el("div", "bar");
    bar.appendChild(btn("+ стенд", "add", () => newStand(sec.id)));
    const pv = el("a", "tool", "открыть в павильоне ↗"); pv.href = "index.html#go=" + encodeURIComponent(sec.id); pv.target = "pavilion"; pv.addEventListener("click", setBuildMode); bar.appendChild(pv);
    bar.appendChild(btn("выгрузить раздел", "", () => exportSection(sec.id)));
    bar.appendChild(btn("загрузить в раздел…", "", () => importJson((parsed) => importSection(sec.id, parsed))));
    if (sec.hasFile) bar.appendChild(btn("вернуть стенды из файла", "", async () => {
      if (!confirm("Вернуть исходные стенды раздела «" + sec.title + "» из файла? Сделанное здесь в этом разделе пропадёт.")) return;
      sec.stands = sec.fileRaw.map(M.normalizeStand); await saveSection(sec.id); renderAll(); toast("Возвращены стенды из файла");
    }));
    bar.appendChild(btn("удалить раздел", "warn", async () => {
      if (!w) return;
      if (!confirm("Удалить раздел «" + sec.title + "»" + (sec.stands.length ? " вместе с " + sec.stands.length + " стендами (они лягут в корзину)" : "") + "?")) return;
      for (const s of sec.stands.slice()) await trashStand(sec.id, s.id, true);
      w.c.doors = w.c.doors.filter((d) => d !== w.d);
      delete S.sections[sec.id];
      await M.storeDel(sec.id);
      S.links = S.links.filter((l) => l.from.sec !== sec.id && l.to.sec !== sec.id);
      await saveLinks(); await saveStructure(); await saveTrash();
      select({ type: "course", b: w.b.id, c: w.c.id }); toast("Раздел удалён");
    }));
    box.appendChild(bar);
    if (sec.notice) box.appendChild(el("p", "warn-t", sec.notice));
    const g = el("div", "grid2");
    g.appendChild(field("Название раздела", sec.title, { on: (v) => { if (!v.trim()) return; sec.title = v.trim(); if (w) w.d.label = sec.title; later("sec", () => { saveSection(sec.id); saveStructure(); renderTree(); }); } }));
    g.appendChild(field("Подзаголовок", sec.subtitle, { hint: "вывеска под названием", on: (v) => { sec.subtitle = v; later("sec", () => saveSection(sec.id)); } }));
    box.appendChild(g);
    if (w) box.appendChild(check("Раздел открыт для слушателей", w.d.open, (v) => { w.d.open = v; saveStructure(); renderTree(); }));
    const local = M.fingerprint(sec.stands) !== sec.fileFp;
    box.appendChild(kv([
      ["код раздела", "<code>" + esc(sec.id) + "</code>"],
      ["файл содержания", sec.hasFile ? "<span class='ok'>content/" + esc(sec.id) + ".js</span>" + (local ? " — <span class='warn-t'>набор в браузере отличается от файла</span>" : " — совпадает с набором") : "<span class='warn-t'>только в браузере</span> — для публикации выгрузите «данные»"]
    ]));
    box.appendChild(el("div", "sec-h", "Стенды по порядку"));
    const tbl = el("div", "tbl");
    if (!sec.stands.length) tbl.appendChild(el("div", "empty", "Стендов нет. «+ стенд» — первый появится здесь."));
    sec.stands.forEach((s, i) => {
      const r = el("div", "trow");
      r.appendChild(el("span", "n", String(i + 1).padStart(2, "0")));
      const sh = el("span", "shrt", s.short); sh.style.cssText = "font-family:var(--mono); font-size:9px; letter-spacing:.08em; color:#07101a; padding:2px 5px; background:" + s.accent + "; max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap";
      r.appendChild(sh);
      r.appendChild(el("span", "t", s.title || "(без заголовка)"));
      r.appendChild(el("span", "m", [s.draft ? "черновик" : "", linkCount(sec.id, s.id) ? "⇄" + linkCount(sec.id, s.id) : ""].filter(Boolean).join(" · ")));
      const up = el("button", "mv", "▲"), dn = el("button", "mv", "▼");
      up.disabled = i === 0; dn.disabled = i === sec.stands.length - 1;
      up.addEventListener("click", async (e) => { e.stopPropagation(); sec.stands.splice(i - 1, 0, sec.stands.splice(i, 1)[0]); await saveSection(sec.id); renderAll(); });
      dn.addEventListener("click", async (e) => { e.stopPropagation(); sec.stands.splice(i + 1, 0, sec.stands.splice(i, 1)[0]); await saveSection(sec.id); renderAll(); });
      r.appendChild(up); r.appendChild(dn);
      r.addEventListener("click", () => select({ type: "stand", sec: sec.id, stand: s.id }));
      tbl.appendChild(r);
    });
    box.appendChild(tbl);
    box.appendChild(el("div", "sec-h", "Картинки в стенды"));
    box.appendChild(dropZone((srcs) => absorbImages({ type: "section", sec: sec.id }, srcs),
      "Перетащите сюда картинки или нажмите, чтобы выбрать файлы — каждая станет новым стендом. "
      + "То же делает вставка из буфера, когда в дереве выбран этот раздел."));
  }

  /* ─── стенд ─────────────────────────────────────────────────────────── */
  function inspStand(box, sec, s) {
    const w = findDoor(sec.id);
    const i = sec.stands.indexOf(s);
    const save = () => later("sec:" + sec.id, () => { saveSection(sec.id); renderTree(); syncStatusSel(); });
    box.appendChild(crumbs([{ label: "академия", sel: { type: "academy" } }, w ? { label: w.c.label, sel: { type: "course", b: w.b.id, c: w.c.id } } : null, { label: sec.title, sel: { type: "section", sec: sec.id } }, { label: "стенд " + String(i + 1).padStart(2, "0") }].filter(Boolean)));
    const h = el("h1", null, s.title || s.short); box.appendChild(h);
    const shield = el("div", "shield"); shield.style.borderLeftColor = s.accent;
    const sh = el("span", "sh", s.short); sh.style.background = s.accent; shield.appendChild(sh);
    shield.appendChild(el("span", "st", "так щит подписан в коридоре · стенд " + (i + 1) + " из " + sec.stands.length));
    box.appendChild(shield);

    const bar = el("div", "bar");
    bar.appendChild(btn("+ стенд после", "add", () => newStand(sec.id, i)));
    const pv = el("a", "tool", "открыть в павильоне ↗"); pv.href = "index.html#go=" + encodeURIComponent(sec.id) + "/" + encodeURIComponent(s.id); pv.target = "pavilion"; pv.addEventListener("click", setBuildMode); bar.appendChild(pv);
    bar.appendChild(btn("▲", "", async () => { if (i === 0) return; sec.stands.splice(i - 1, 0, sec.stands.splice(i, 1)[0]); await saveSection(sec.id); renderAll(); }));
    bar.appendChild(btn("▼", "", async () => { if (i >= sec.stands.length - 1) return; sec.stands.splice(i + 1, 0, sec.stands.splice(i, 1)[0]); await saveSection(sec.id); renderAll(); }));
    bar.appendChild(btn("дублировать", "", async () => {
      const c = M.normalizeStand(JSON.parse(JSON.stringify(M.plainStand(s))), sec.stands.length); c.id = M.newId("s"); c.custom = true;
      sec.stands.splice(i + 1, 0, c); await saveSection(sec.id); select({ type: "stand", sec: sec.id, stand: c.id });
    }));
    const mv = el("select"); mv.className = "tool"; mv.style.cssText = "padding:6px 8px";
    mv.appendChild(new Option("перенести в раздел…", ""));
    allDoors().forEach(({ c, d }) => { if (d.pavilion && S.sections[d.pavilion] && d.pavilion !== sec.id) mv.appendChild(new Option(c.label + " › " + secName(d.pavilion), d.pavilion)); });
    mv.addEventListener("change", () => { if (mv.value) moveStand({ sec: sec.id, stand: s.id, i }, mv.value, S.sections[mv.value].stands.length); });
    bar.appendChild(mv);
    bar.appendChild(btn("в корзину", "warn", () => trashStand(sec.id, s.id)));
    box.appendChild(bar);

    box.appendChild(el("div", "sec-h", "Щит и карточка"));
    const g = el("div", "grid3");
    g.appendChild(field("Надпись на щите", s.short, { f: "short", hint: "видна в коридоре", on: (v) => { s.short = v.trim() || "СТЕНД"; sh.textContent = s.short; if (!s.title) h.textContent = s.short; save(); } }));
    const acc = el("div", "f"); acc.appendChild(el("label", null, "Цвет"));
    const sw = el("div", "sw");
    M.ACCENTS.forEach((c) => { const b = el("button", c === s.accent ? "on" : ""); b.type = "button"; b.style.background = c; b.title = c; b.addEventListener("click", () => { s.accent = c; [...sw.children].forEach((x) => x.classList.toggle("on", x === b)); sh.style.background = c; shield.style.borderLeftColor = c; save(); }); sw.appendChild(b); });
    acc.appendChild(sw); g.appendChild(acc);
    const ic = el("div", "f"); ic.appendChild(el("label", null, "Пиктограмма"));
    const icons = el("div", "icons");
    M.ICON_NAMES.forEach((n) => { const b = el("button", n === s.icon ? "on" : ""); b.type = "button"; b.title = n; b.appendChild(iconCanvas(n)); b.addEventListener("click", () => { s.icon = n; [...icons.children].forEach((x) => x.classList.toggle("on", x === b)); save(); }); icons.appendChild(b); });
    ic.appendChild(icons); g.appendChild(ic);
    box.appendChild(g);
    box.appendChild(field("Заголовок карточки", s.title, { on: (v) => { s.title = v; h.textContent = v || s.short; save(); } }));
    box.appendChild(field("Вводка", s.lead, { multi: true, hint: "одно-два предложения под заголовком", on: (v) => { s.lead = v; save(); } }));
    box.appendChild(field("Текст", s.body.join("\n\n"), { multi: true, tall: true, hint: "абзацы через пустую строку", on: (v) => { s.body = v.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean); save(); } }));
    const g2 = el("div", "grid2");
    g2.appendChild(field("Заголовок списка", s.pointsTitle, { hint: "по умолчанию «Коротко»", on: (v) => { s.pointsTitle = v; save(); } }));
    g2.appendChild(field("Список", s.points.join("\n"), { multi: true, hint: "по пункту на строку", on: (v) => { s.points = v.split("\n").map((x) => x.trim()).filter(Boolean); save(); } }));
    box.appendChild(g2);
    box.appendChild(field("Примечание внизу карточки", s.note, { on: (v) => { s.note = v; save(); } }));
    box.appendChild(check("Черновик содержания (пометка в углу карточки)", s.draft, (v) => { s.draft = v; save(); renderTree(); }));

    box.appendChild(el("div", "sec-h", "Изображение"));
    box.appendChild(imageBlock(s, save));
    box.appendChild(el("div", "sec-h", "Слайды (карусель)"));
    box.appendChild(slidesBlock(s, save));
    box.appendChild(el("div", "sec-h", "Видео к занятию"));
    box.appendChild(rowsBlock(s.videos, [["label", "подпись"], ["url", "адрес видео (не YouTube)"]], () => ({ label: "Видео к занятию", url: "" }), save, (v) => !!v.url));
    box.appendChild(el("div", "sec-h", "Файлы для скачивания"));
    box.appendChild(filesBlock(s, save));
  }

  function iconCanvas(name) {
    const g = M.ICONS[name] || M.ICONS.book;
    const c = document.createElement("canvas"); c.width = 24; c.height = 24;
    const ctx = c.getContext("2d"); ctx.fillStyle = "#000";
    for (let r = 0; r < g.length; r++) for (let k = 0; k < g[r].length; k++) if (g[r][k] === "#") ctx.fillRect(k * 3, r * 3, 3, 3);
    return c;
  }

  /* ─── файлы и артефакты на стенде ───────────────────────────────────────
     Книга, конспект, таблица грузятся прямо сюда и живут в этом браузере, пока
     не уедут в публикацию. Путь к уже опубликованному файлу тоже принимается —
     так заведены материалы, положенные в репозиторий руками. */
  const MAX_FILE = 90 * 1024 * 1024;          // предел GitHub Pages на один файл — 100 МБ
  const WARN_FILE = 25 * 1024 * 1024;
  async function addFiles(stand, fileList, save) {
    let added = 0;
    for (const f of fileList) {
      if (f.size > MAX_FILE) { toast("«" + f.name + "» больше 90 МБ — столько не публикуется"); continue; }
      if (f.size > WARN_FILE && !confirm("«" + f.name + "» весит " + M.niceSize(f.size)
        + ". Такой файл уедет в репозиторий и останется в его истории навсегда. Загрузить?")) continue;
      const rec = await M.putFile(f);
      if (!rec) { toast("Не удалось сохранить «" + f.name + "»: в браузере кончилось место"); continue; }
      stand.downloads.push({ label: rec.name.replace(/\.[^.]+$/, ""), file: "", fileId: rec.id,
        name: rec.name, size: rec.size, type: rec.type, hold: false, holdWhy: "" });
      added++;
    }
    if (added) { await save(); renderInspector(); toast(added === 1 ? "Файл загружен" : "Загружено файлов: " + added); }
  }
  function filesBlock(s, save) {
    const w = el("div");
    const list = el("div", "list");
    (s.downloads || []).forEach((d, i) => {
      const r = el("div", "item");
      const kind = el("span", "fkind", ((d.name || d.file || "").split(".").pop() || "файл").toUpperCase().slice(0, 5));
      r.appendChild(kind);
      const lab = el("input"); lab.type = "text"; lab.placeholder = "подпись на стенде"; lab.value = d.label;
      lab.addEventListener("input", () => { d.label = lab.value; save(); });
      r.appendChild(lab);
      const state = el("span", "fstate");
      state.textContent = d.file ? "опубликован" : (d.fileId ? M.niceSize(d.size || 0) + " · в браузере" : "нет файла");
      if (!d.file && d.fileId) state.classList.add("local");
      r.appendChild(state);
      r.appendChild(check("не выкладывать", d.hold, (v) => { d.hold = v; save(); renderInspector(); }));
      const open = el("button", "mv", "открыть");
      open.addEventListener("click", async () => {
        if (d.file) { window.open(d.file, "_blank", "noopener"); return; }
        const rec = await M.getFile(d.fileId);
        if (!rec || !rec.blob) { toast("Файла нет в этом браузере"); return; }
        const u = URL.createObjectURL(rec.blob);
        window.open(u, "_blank", "noopener");
        setTimeout(() => URL.revokeObjectURL(u), 20000);
      });
      r.appendChild(open);
      const del = el("button", "x", "×");
      del.addEventListener("click", async () => {
        if (!confirm("Убрать «" + (d.label || d.name) + "» со стенда?" + (d.fileId ? " Загруженный файл будет удалён из браузера." : ""))) return;
        if (d.fileId) await M.delFile(d.fileId);
        s.downloads.splice(i, 1); await save(); renderInspector();
      });
      r.appendChild(del);
      list.appendChild(r);
    });
    w.appendChild(list);
    const z = el("div", "drop");
    z.tabIndex = 0;
    z.appendChild(el("div", "drop-t", "Перетащите сюда книгу, конспект или таблицу — файл ляжет к нам, а не останется ссылкой"));
    const bar = el("div", "drop-bar");
    bar.appendChild(btn("загрузить файлы…", "sm add", () => { fileSink = (fs) => addFiles(s, fs, save); $("file-any").click(); }));
    bar.appendChild(btn("указать путь вручную", "sm", () => {
      const p = prompt("Путь к уже опубликованному файлу, например content/files/book.pdf");
      if (!p) return;
      s.downloads.push({ label: p.split("/").pop(), file: p.trim(), fileId: "", name: p.split("/").pop(), size: 0, type: "", hold: false, holdWhy: "" });
      save(); renderInspector();
    }));
    z.appendChild(bar);
    z.addEventListener("dragover", (e) => { e.preventDefault(); z.classList.add("over"); });
    z.addEventListener("dragleave", () => z.classList.remove("over"));
    z.addEventListener("drop", async (e) => {
      e.preventDefault(); z.classList.remove("over");
      const fs = [...((e.dataTransfer && e.dataTransfer.files) || [])];
      if (!fs.length) { toast("Файлов в броске нет"); return; }
      await addFiles(s, fs, save);
    });
    w.appendChild(z);
    const note = el("div", "hint");
    note.style.marginTop = "6px";
    note.textContent = "Загруженный файл уедет в публикацию и станет доступен по прямой ссылке всякому, кто её знает: "
      + "репозиторий сайта публичный. Для чужих материалов ставьте «не выкладывать» — запись останется, файл наружу не уйдёт.";
    w.appendChild(note);
    return w;
  }

  /* ─── изображения ───────────────────────────────────────────────────── */
  const MAX_SIDE = 1400, MAX_BYTES = 420 * 1024;
  function fileToDataUrl(file) { return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(fr.error); fr.readAsDataURL(file); }); }
  function loadImage(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("bad image")); im.src = src; }); }
  async function ingestImage(file) {
    try {
      if (!file || !/^image\//.test(file.type)) { toast("Это не изображение"); return null; }
      let url = await fileToDataUrl(file);
      const im = await loadImage(url);
      const big = Math.max(im.naturalWidth, im.naturalHeight) > MAX_SIDE;
      if (big || url.length > MAX_BYTES * 1.37) {
        const k = Math.min(1, MAX_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
        const w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k));
        const oc = document.createElement("canvas"); oc.width = w; oc.height = h;
        oc.getContext("2d").drawImage(im, 0, 0, w, h);
        let out = oc.toDataURL("image/webp", 0.86);
        if (out.length > url.length || out.indexOf("data:image/webp") !== 0) out = oc.toDataURL("image/jpeg", 0.86);
        if (out.length < url.length) url = out;
      }
      return url;
    } catch (e) { toast("Не удалось прочитать изображение"); return null; }
  }
  let fileSink = null;     // (files: File[]) => куда класть выбранные файлы любого вида
  $("file-any").addEventListener("change", async () => {
    const fs = [...(($("file-any").files) || [])]; $("file-any").value = "";
    if (fs.length && fileSink) await fileSink(fs);
  });
  let imgSink = null;      // (srcs: string[]) => куда класть выбранные картинки
  $("file-img").addEventListener("change", async () => {
    const fs = [...(($("file-img").files) || [])]; $("file-img").value = "";
    if (!fs.length || !imgSink) return;
    const srcs = []; for (const f of fs) { const src = await ingestImage(f); if (src) srcs.push(src); }
    if (srcs.length) await imgSink(srcs);
  });

  // Картинки из буфера обмена или из броска: файлы, а если их нет — ссылка на картинку.
  async function imagesFrom(dt) {
    if (!dt) return [];
    const out = [];
    const files = [...(dt.files || [])].filter((f) => /^image\//.test(f.type));
    const items = files.length ? [] : [...(dt.items || [])]
      .filter((it) => it.kind === "file" && /^image\//.test(it.type)).map((it) => it.getAsFile()).filter(Boolean);
    for (const f of (files.length ? files : items)) { const src = await ingestImage(f); if (src) out.push(src); }
    if (!out.length) {
      let t = ""; try { t = (dt.getData("text/plain") || "").trim(); } catch (e) { t = ""; }
      if (/^(https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S*)?|data:image\/)/i.test(t)) out.push(t);
    }
    return out;
  }

  /* Куда ложится картинка. Стенд — её место: первая на щит, остальные в слайды.
     Выбран раздел — каждая картинка становится новым стендом (стенд = базовая
     единица). Выбран курс или корпус — места нет, и об этом надо сказать вслух:
     молчание здесь читается как «не работает». */
  async function absorbImages(sel, srcs) {
    if (!srcs || !srcs.length) return false;
    if (sel.type === "stand") {
      const st = standOf(sel.sec, sel.stand); if (!st) return false;
      let board = 0, slides = 0;
      srcs.forEach((src) => { if (!st.image) { st.image = src; board++; } else { st.images.push({ src, caption: "" }); slides++; } });
      await saveSection(sel.sec); renderAll();
      toast(slides ? (board ? "Картинка на щите, в слайды добавлено " + slides : "В слайды добавлено " + slides)
        : "Картинка на стенде «" + st.short + "»");
      return true;
    }
    if (sel.type === "section") {
      const sec = S.sections[sel.sec]; if (!sec) return false;
      let last = null;
      srcs.forEach((src) => { const st = M.normalizeStand({ short: "НОВЫЙ", title: "", image: src, custom: true }, sec.stands.length); sec.stands.push(st); last = st; });
      await saveSection(sel.sec);
      if (srcs.length === 1) select({ type: "stand", sec: sel.sec, stand: last.id });
      else renderAll();
      toast(srcs.length === 1 ? "Создан стенд с этой картинкой — подпишите его" : "Создано стендов: " + srcs.length);
      return true;
    }
    toast("Картинке нужно место: выберите в дереве раздел или стенд");
    return false;
  }

  addEventListener("paste", async (e) => {
    const dt = e.clipboardData;
    const inField = /^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || "");
    const hasImage = [...((dt && dt.items) || [])].some((it) => it.kind === "file" && /^image\//.test(it.type));
    if (inField && !hasImage) return;            // обычная вставка текста в поле
    if (hasImage) e.preventDefault();            // синхронно, до чтения файла
    const srcs = await imagesFrom(dt);
    if (!srcs.length) { if (!inField) toast("В буфере обмена нет картинки"); return; }
    await absorbImages(S.sel, srcs);
  });

  /* Прямое чтение буфера по нажатию кнопки. Нужно потому, что Ctrl+V доходит
     до страницы не всегда: если перед этим открылся системный диалог выбора
     файла, нажатие уходит в него, и человек видит «не вставляется». */
  async function pasteFromClipboard(onSrcs) {
    if (!navigator.clipboard || !navigator.clipboard.read) { toast("Этот браузер не отдаёт буфер по кнопке — нажмите Ctrl+V"); return; }
    let items;
    try { items = await navigator.clipboard.read(); }
    catch (e) { toast("Браузер не дал прочитать буфер: разрешите доступ в адресной строке или нажмите Ctrl+V"); return; }
    const srcs = [];
    for (const it of items) {
      const type = (it.types || []).find((t) => /^image\//.test(t));
      if (!type) continue;
      try {
        const blob = await it.getType(type);
        const src = await ingestImage(new File([blob], "clip." + type.split("/")[1], { type }));
        if (src) srcs.push(src);
      } catch (e) { /* этот кусок буфера не читается — идём дальше */ }
    }
    if (!srcs.length) { toast("В буфере обмена нет картинки"); return; }
    await onSrcs(srcs);
  }

  /* Зона приёма картинок. Нажатие по фону НЕ открывает диалог файла: раньше
     открывало, и системное окно перехватывало следующий Ctrl+V. Диалог теперь
     только по явной кнопке. Сам фон принимает фокус, чтобы вставка с клавиатуры
     попадала в страницу. */
  function dropZone(onSrcs, text) {
    const base = text || "Перетащите сюда картинку — или возьмите её из буфера кнопкой ниже";
    const z = el("div", "drop");
    z.tabIndex = 0;
    const cap = el("div", "drop-t", base);
    const bar = el("div", "drop-bar");
    bar.appendChild(btn("вставить из буфера", "sm add", () => pasteFromClipboard(onSrcs)));
    bar.appendChild(btn("выбрать файлы…", "sm", () => { imgSink = onSrcs; $("file-img").click(); }));
    z.appendChild(cap); z.appendChild(bar);
    z.addEventListener("focus", () => { cap.textContent = "Можно нажать Ctrl+V — картинка из буфера ляжет сюда"; });
    z.addEventListener("blur", () => { cap.textContent = base; });
    z.addEventListener("dragover", (e) => { e.preventDefault(); z.classList.add("over"); });
    z.addEventListener("dragleave", () => z.classList.remove("over"));
    z.addEventListener("drop", async (e) => {
      e.preventDefault(); z.classList.remove("over");
      const srcs = await imagesFrom(e.dataTransfer);
      if (!srcs.length) { toast("Это не картинка"); return; }
      await onSrcs(srcs);
    });
    return z;
  }
  function imageBlock(s, save) {
    const w = el("div");
    if (s.image) {
      const z = el("div", "drop");
      const im = el("img"); im.src = s.image; z.appendChild(im);
      const put = (srcs) => { s.image = srcs[0]; save(); renderInspector(); };
      const bar = el("div", "drop-bar");
      bar.appendChild(btn("вставить из буфера", "sm add", () => pasteFromClipboard(put)));
      bar.appendChild(btn("заменить файлом…", "sm", () => { imgSink = put; $("file-img").click(); }));
      bar.appendChild(btn("убрать", "sm warn", () => { s.image = null; s.caption = ""; save(); renderInspector(); }));
      z.appendChild(bar);
      w.appendChild(z);
      w.appendChild(field("Подпись под изображением", s.caption, { on: (v) => { s.caption = v; save(); } }));
    } else w.appendChild(dropZone((srcs) => { s.image = srcs[0]; srcs.slice(1).forEach((x) => s.images.push({ src: x, caption: "" })); save(); renderInspector(); }));
    return w;
  }
  function slidesBlock(s, save) {
    const w = el("div");
    const list = el("div", "list");
    s.images.forEach((im, i) => {
      const r = el("item" === "" ? "div" : "div", "item");
      const img = el("img"); img.src = im.src; r.appendChild(img);
      const cap = el("input"); cap.type = "text"; cap.placeholder = "подпись слайда"; cap.value = im.caption; cap.addEventListener("input", () => { im.caption = cap.value; save(); }); r.appendChild(cap);
      const up = el("button", "mv", "▲"), dn = el("button", "mv", "▼"), x = el("button", "x", "×");
      up.disabled = i === 0; dn.disabled = i === s.images.length - 1;
      up.addEventListener("click", () => { s.images.splice(i - 1, 0, s.images.splice(i, 1)[0]); save(); renderInspector(); });
      dn.addEventListener("click", () => { s.images.splice(i + 1, 0, s.images.splice(i, 1)[0]); save(); renderInspector(); });
      x.addEventListener("click", () => { s.images.splice(i, 1); save(); renderInspector(); });
      r.appendChild(up); r.appendChild(dn); r.appendChild(x);
      list.appendChild(r);
    });
    w.appendChild(list);
    w.appendChild(dropZone((srcs) => { srcs.forEach((src) => s.images.push({ src, caption: "" })); save(); renderInspector(); }, "+ слайд: перетащите, выберите файлы или вставьте из буфера"));
    return w;
  }
  function rowsBlock(arr, cols, mk, save, keep, extra) {
    const w = el("div");
    const list = el("div", "list");
    arr.forEach((x, i) => {
      const r = el("div", "item");
      cols.forEach(([k, ph]) => { const inp = el("input"); inp.type = "text"; inp.placeholder = ph; inp.value = x[k] || ""; inp.addEventListener("input", () => { x[k] = inp.value; save(); }); r.appendChild(inp); });
      if (extra) extra(x, r);
      const del = el("button", "x", "×"); del.addEventListener("click", () => { arr.splice(i, 1); save(); renderInspector(); }); r.appendChild(del);
      list.appendChild(r);
    });
    w.appendChild(list);
    w.appendChild(btn("+ добавить", "sm", () => { arr.push(mk()); renderInspector(); setTimeout(() => { const ins = w.querySelectorAll(".item input[type=text]"); if (ins.length) ins[ins.length - cols.length].focus(); }, 30); }));
    // пустые строки (без адреса/файла) не сохраняются — они просто исчезают при следующей отрисовке
    return w;
  }

  /* ─── корзина ───────────────────────────────────────────────────────── */
  async function trashStand(sec, standId, quiet) {
    const s = S.sections[sec]; if (!s) return;
    const i = s.stands.findIndex((x) => x.id === standId); if (i < 0) return;
    const [st] = s.stands.splice(i, 1);
    S.trash.unshift({ deletedAt: new Date().toISOString(), sec, secTitle: s.title, index: i, stand: M.plainStand(st) });
    if (S.trash.length > 60) S.trash.length = 60;
    const dropped = S.links.filter((l) => (l.from.sec === sec && l.from.stand === standId) || (l.to.sec === sec && l.to.stand === standId));
    if (dropped.length) { S.trash[0].links = dropped; S.links = S.links.filter((l) => dropped.indexOf(l) < 0); await saveLinks(); }
    await saveSection(sec); await saveTrash();
    if (!quiet) { select({ type: "section", sec }); toast("Стенд в корзине — вернуть можно в «данные»"); }
  }
  async function restoreTrash(i) {
    const t = S.trash[i]; if (!t) return;
    let sec = S.sections[t.sec];
    if (!sec) { const first = allDoors().find((x) => S.sections[x.d.pavilion]); if (!first) { toast("Нет раздела, куда вернуть"); return; } sec = S.sections[first.d.pavilion]; }
    const st = M.normalizeStand(t.stand, sec.stands.length);
    if (sec.stands.some((x) => x.id === st.id)) st.id = M.newId("s");
    sec.stands.splice(Math.min(t.index || 0, sec.stands.length), 0, st);
    if (t.links && sec.id === t.sec) { t.links.forEach((l) => { const n = M.normalizeLink(l); if (n) S.links.push(n); }); await saveLinks(); }
    S.trash.splice(i, 1);
    await saveSection(sec.id); await saveTrash();
    closeSheet($("sh-data"));
    select({ type: "stand", sec: sec.id, stand: st.id }); toast("Стенд возвращён в «" + sec.title + "»");
  }

  /* ═══ связи ═══════════════════════════════════════════════════════════ */
  let lkKind = "branch", lkTarget = null, lkNote = "";
  function nodeLabel(n) {
    if (!n) return "";
    if (!n.stand) return "раздел «" + secName(n.sec) + "»";
    const s = standOf(n.sec, n.stand);
    return (s ? standName(s) : "стенд не найден") + " · " + secName(n.sec);
  }
  function renderLinks() {
    const box = $("lp"); box.innerHTML = "";
    const sel = S.sel;
    if (sel.type !== "stand" && sel.type !== "section") {
      $("lk-count").textContent = S.links.length ? "всего " + S.links.length : "";
      box.appendChild(el("div", "empty", "Выберите стенд или раздел — здесь будут его связи. Связь — это ответвление, отсылка «см. также» или «сначала изучить»."));
      if (S.links.length) box.appendChild(btn("карта связей", "", () => openMap(null)));
      return;
    }
    const me = sel.type === "stand" ? { sec: sel.sec, stand: sel.stand } : { sec: sel.sec };
    const same = (a, b) => a.sec === b.sec && (a.stand || "") === (b.stand || "");
    const out = S.links.filter((l) => same(l.from, me)), inn = S.links.filter((l) => same(l.to, me));
    $("lk-count").textContent = (out.length + inn.length) ? "отсюда " + out.length + " · сюда " + inn.length : "";
    box.appendChild(el("p", "who", sel.type === "stand" ? standName(standOf(sel.sec, sel.stand)) : secName(sel.sec)));
    box.appendChild(el("p", "where", sel.type === "stand" ? "стенд раздела «" + secName(sel.sec) + "»" : "раздел"));

    // новая связь
    box.appendChild(el("div", "sec-h", "Новая связь отсюда"));
    const kinds = el("div", "kinds");
    Object.keys(M.LINK_KINDS).forEach((k) => {
      const b = el("button", k === lkKind ? "on" : "", M.LINK_KINDS[k].label); b.type = "button";
      if (k === lkKind) b.style.background = M.LINK_KINDS[k].color;
      b.addEventListener("click", () => { lkKind = k; renderLinks(); });
      kinds.appendChild(b);
    });
    box.appendChild(kinds);
    box.appendChild(el("div", "khint", M.LINK_KINDS[lkKind].hint));
    const picker = el("div", "picker");
    const inp = el("input"); inp.type = "text"; inp.placeholder = "куда: начните вводить название стенда или раздела…"; inp.autocomplete = "off";
    const dd = el("div", "dd");
    picker.appendChild(inp); picker.appendChild(dd);
    const options = [];
    allDoors().forEach(({ c, d }) => {
      const s = S.sections[d.pavilion]; if (!s) return;
      options.push({ node: { sec: s.id }, text: s.title, sub: c.label + " · раздел", secOpt: true });
      s.stands.forEach((st, i) => options.push({ node: { sec: s.id, stand: st.id }, text: (st.title || st.short), sub: s.title + " · стенд " + String(i + 1).padStart(2, "0") + " · " + st.short }));
    });
    let cur = -1, shown = [];
    const show = () => {
      const q = inp.value.trim().toLowerCase();
      shown = options.filter((o) => !same(o.node, me) && (!q || (o.text + " " + o.sub).toLowerCase().indexOf(q) >= 0)).slice(0, 40);
      dd.innerHTML = ""; cur = -1;
      shown.forEach((o, i) => {
        const r = el("div", "opt" + (o.secOpt ? " sec-opt" : "")); r.textContent = o.text;
        r.appendChild(el("div", "s", o.sub));
        r.addEventListener("mousedown", (e) => { e.preventDefault(); pickTarget(o.node); });
        dd.appendChild(r);
      });
      dd.classList.toggle("on", shown.length > 0);
    };
    inp.addEventListener("focus", show); inp.addEventListener("input", show);
    inp.addEventListener("blur", () => setTimeout(() => dd.classList.remove("on"), 120));
    inp.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); cur = Math.max(0, Math.min(shown.length - 1, cur + (e.key === "ArrowDown" ? 1 : -1))); [...dd.children].forEach((c, i) => c.classList.toggle("cur", i === cur)); if (dd.children[cur]) dd.children[cur].scrollIntoView({ block: "nearest" }); }
      else if (e.key === "Enter") { e.preventDefault(); if (cur >= 0 && shown[cur]) pickTarget(shown[cur].node); else if (shown.length === 1) pickTarget(shown[0].node); }
      else if (e.key === "Escape") { dd.classList.remove("on"); }
    });
    box.appendChild(picker);
    const pickBar = el("div", "bar"); pickBar.style.margin = "8px 0";
    pickBar.appendChild(btn(S.pick ? "отмена указания" : "указать в дереве", "sm", () => { S.pick = S.pick ? null : { from: me }; renderTree(); renderLinks(); }));
    box.appendChild(pickBar);
    if (S.pick) box.appendChild(el("div", "pick-on", "Нажмите в дереве слева на стенд или раздел, куда ведёт связь. Esc — отмена."));
    if (lkTarget) {
      const t = el("div", "target");
      t.appendChild(el("span", null, "→ " + nodeLabel(lkTarget)));
      t.appendChild(el("span", "sp"));
      const x = el("button", "x", "×"); x.className = "x"; x.style.cssText = "background:none;border:none;color:var(--muted);font-family:var(--mono)"; x.addEventListener("click", () => { lkTarget = null; renderLinks(); }); t.appendChild(x);
      box.appendChild(t);
      const f = field("Пояснение", lkNote, { hint: "необязательно", placeholder: "зачем эта связь", on: (v) => { lkNote = v; } });
      f.style.marginTop = "10px"; box.appendChild(f);
      const add = btn("добавить связь", "add", async () => {
        const l = M.normalizeLink({ kind: lkKind, from: me, to: lkTarget, note: lkNote.trim() });
        if (S.links.some((x) => x.kind === l.kind && same(x.from, l.from) && same(x.to, l.to))) { toast("Такая связь уже есть"); return; }
        S.links.push(l); lkTarget = null; lkNote = ""; S.pick = null;
        await saveLinks(); renderAll(); toast("Связь добавлена");
      });
      box.appendChild(add);
    }

    const list = (title, arr, dir) => {
      box.appendChild(el("div", "sec-h", title));
      if (!arr.length) { box.appendChild(el("div", "empty", "Нет.")); return; }
      arr.forEach((l) => {
        const other = dir === "out" ? l.to : l.from;
        const ok = !!S.sections[other.sec] && (!other.stand || !!standOf(other.sec, other.stand));
        const r = el("div", "lk" + (ok ? "" : " bad")); r.style.borderLeftColor = M.LINK_KINDS[l.kind].color;
        const k = el("span", "kind", dir === "out" ? M.LINK_KINDS[l.kind].label : (l.kind === "before" ? "нужен для" : l.kind === "branch" ? "ветка от" : "ссылается")); k.style.background = M.LINK_KINDS[l.kind].color; r.appendChild(k);
        const body = el("div", "body");
        const t = el("div", "t", other.stand ? standName(standOf(other.sec, other.stand)) : "раздел «" + secName(other.sec) + "»");
        t.addEventListener("click", () => { if (!ok) return; select(other.stand ? { type: "stand", sec: other.sec, stand: other.stand } : { type: "section", sec: other.sec }); });
        body.appendChild(t);
        body.appendChild(el("div", "s", (other.stand ? secName(other.sec) : "") + (ok ? "" : " · цель не найдена")));
        const note = el("input", "note"); note.type = "text"; note.placeholder = "пояснение…"; note.value = l.note;
        note.addEventListener("input", () => { l.note = note.value; later("links", saveLinks); });
        body.appendChild(note);
        r.appendChild(body);
        const x = el("button", "x", "×"); x.title = "удалить связь";
        x.addEventListener("click", async () => { S.links = S.links.filter((y) => y !== l); await saveLinks(); renderAll(); });
        r.appendChild(x);
        box.appendChild(r);
      });
    };
    list("Отсюда →", out, "out");
    list("→ Сюда", inn, "in");
    const mb = el("div", "bar"); mb.style.marginTop = "18px";
    const w = findDoor(sel.sec);
    mb.appendChild(btn("карта связей курса", "", () => openMap(w ? w.c : null)));
    box.appendChild(mb);
  }
  function pickTarget(node) {
    lkTarget = node; S.pick = null;
    renderTree(); renderLinks();
    const t = document.querySelector("#lp .target"); if (t) t.scrollIntoView({ block: "nearest" });
  }
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (S.pick) { S.pick = null; renderTree(); renderLinks(); return; }
      [$("sh-map"), $("sh-data")].forEach((s) => { if (s.classList.contains("on")) closeSheet(s); });
    }
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && S.sel.type === "stand") {
      const sec = S.sections[S.sel.sec]; const i = sec.stands.findIndex((s) => s.id === S.sel.stand);
      const j = i + (e.key === "ArrowUp" ? -1 : 1); if (j < 0 || j >= sec.stands.length) return;
      e.preventDefault(); sec.stands.splice(j, 0, sec.stands.splice(i, 1)[0]); saveSection(sec.id).then(renderAll);
    }
  });

  /* ═══ карта связей ════════════════════════════════════════════════════ */
  function openSheet(s) { s.classList.add("on"); }
  function closeSheet(s) { s.classList.remove("on"); }
  function openMap(course) {
    const body = $("map-body"); body.innerHTML = "";
    const courses = [];
    if (course) { const b = S.buildings.find((x) => x.courses.indexOf(course) >= 0); courses.push({ b, c: course }); }
    else S.buildings.forEach((b) => b.courses.forEach((c) => courses.push({ b, c })));
    $("map-title").textContent = course ? "Карта связей: " + course.label : "Карта связей: вся академия";
    const lg = $("map-legend"); lg.innerHTML = "";
    Object.keys(M.LINK_KINDS).forEach((k) => { const s = el("span"); const i = el("i"); i.style.background = M.LINK_KINDS[k].color; s.appendChild(i); s.appendChild(document.createTextNode(M.LINK_KINDS[k].label)); lg.appendChild(s); });

    const NS = "http://www.w3.org/2000/svg";
    const mk = (t, a) => { const n = document.createElementNS(NS, t); Object.keys(a || {}).forEach((k) => n.setAttribute(k, a[k])); return n; };
    const LX = 230, BW = 150, BH = 46, GX = 180, LH = 96, PAD = 40;
    const pos = {};  // ключ узла → {x,y,w,h}
    let y = PAD, maxX = LX + 200;
    const lanes = [];
    courses.forEach(({ c }) => {
      lanes.push({ course: c, y });
      y += 34;
      c.doors.forEach((d) => {
        const s = S.sections[d.pavilion]; if (!s) return;
        lanes.push({ sec: s, y, open: d.open });
        pos[s.id] = { x: 16, y: y + 16, w: LX - 40, h: BH };
        s.stands.forEach((st, i) => { pos[s.id + "/" + st.id] = { x: LX + i * GX, y: y + 16, w: BW, h: BH, st }; maxX = Math.max(maxX, LX + i * GX + BW); });
        y += LH;
      });
      y += 20;
    });
    const W = maxX + PAD + 330, H = y + PAD;
    const svg = mk("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H });
    const defs = mk("defs");
    Object.keys(M.LINK_KINDS).forEach((k) => {
      const m = mk("marker", { id: "arr-" + k, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
      m.appendChild(mk("path", { d: "M0,0 L10,5 L0,10 z", fill: M.LINK_KINDS[k].color })); defs.appendChild(m);
    });
    svg.appendChild(defs);
    lanes.forEach((ln) => {
      if (ln.course) { const t = mk("text", { x: 16, y: ln.y + 14, class: "lane-c" }); t.textContent = ln.course.label; svg.appendChild(t); return; }
      svg.appendChild(mk("line", { x1: 0, y1: ln.y + LH - 8, x2: W, y2: ln.y + LH - 8, class: "lane" }));
      const p = pos[ln.sec.id];
      const g = mk("g", { class: "node" + (isSel({ type: "section", sec: ln.sec.id }) ? " sel" : "") });
      g.appendChild(mk("rect", { x: p.x, y: p.y, width: p.w, height: p.h, rx: 2 }));
      const t = mk("text", { x: p.x + 10, y: p.y + 19, class: "lane-l" }); t.textContent = "раздел" + (ln.open ? "" : " · закрыт"); g.appendChild(t);
      const t2 = mk("text", { x: p.x + 10, y: p.y + 36 }); t2.textContent = ln.sec.title.length > 26 ? ln.sec.title.slice(0, 25) + "…" : ln.sec.title; g.appendChild(t2);
      g.addEventListener("click", () => { closeSheet($("sh-map")); select({ type: "section", sec: ln.sec.id }); });
      svg.appendChild(g);
      if (ln.sec.stands.length) svg.appendChild(mk("line", { x1: LX, y1: p.y + BH / 2, x2: LX + (ln.sec.stands.length - 1) * GX + BW, y2: p.y + BH / 2, class: "main" }));
      ln.sec.stands.forEach((st) => {
        const q = pos[ln.sec.id + "/" + st.id];
        const n = mk("g", { class: "node" + (isSel({ type: "stand", sec: ln.sec.id, stand: st.id }) ? " sel" : "") });
        n.appendChild(mk("rect", { x: q.x, y: q.y, width: q.w, height: q.h, rx: 2 }));
        n.appendChild(mk("rect", { x: q.x, y: q.y, width: 4, height: q.h, fill: st.accent }));
        const sh = mk("rect", { x: q.x + 10, y: q.y + 7, width: Math.min(BW - 20, 8 + st.short.length * 6.2), height: 13, fill: st.accent }); n.appendChild(sh);
        const a = mk("text", { x: q.x + 14, y: q.y + 17, class: "sh" }); a.textContent = st.short.length > 20 ? st.short.slice(0, 19) + "…" : st.short; n.appendChild(a);
        const b = mk("text", { x: q.x + 10, y: q.y + 36 }); const nm = st.title || ""; b.textContent = nm.length > 22 ? nm.slice(0, 21) + "…" : nm; n.appendChild(b);
        n.addEventListener("click", () => { closeSheet($("sh-map")); select({ type: "stand", sec: ln.sec.id, stand: st.id }); });
        svg.appendChild(n);
      });
    });
    let drawn = 0;
    S.links.forEach((l) => {
      const a = pos[M.nodeKey(l.from)], b = pos[M.nodeKey(l.to)];
      if (!a && !b) return;
      if (!a || !b) {
        // другой конец вне этой карты (другой курс): короткий пунктир с подписью, куда ведёт
        const n = a || b, outgoing = !!a;
        const cx = n.x + 24, by = n.y + n.h, ly = by + 16;
        const d = outgoing
          ? "M" + cx + "," + by + " L" + cx + "," + ly + " L" + (cx + 36) + "," + ly
          : "M" + (cx + 36) + "," + ly + " L" + cx + "," + ly + " L" + cx + "," + by;
        const p = mk("path", { d, class: "edge", stroke: M.LINK_KINDS[l.kind].color, "stroke-dasharray": "4 3", "marker-end": "url(#arr-" + l.kind + ")" });
        const tt = mk("title"); tt.textContent = M.LINK_KINDS[l.kind].label + ": " + nodeLabel(l.from) + " → " + nodeLabel(l.to) + (l.note ? " — " + l.note : ""); p.appendChild(tt);
        svg.appendChild(p);
        const t = mk("text", { x: cx + 42, y: ly + 4, class: "lane-l" });
        t.textContent = (outgoing ? "→ " : "← ") + nodeLabel(outgoing ? l.to : l.from).slice(0, 40); svg.appendChild(t);
        drawn++; return;
      }
      const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2;
      const dx = Math.max(60, Math.abs(x2 - x1) / 2);
      const d = (x2 >= x1)
        ? "M" + x1 + "," + y1 + " C" + (x1 + dx) + "," + y1 + " " + (x2 - dx) + "," + y2 + " " + x2 + "," + y2
        : "M" + (a.x + a.w / 2) + "," + (a.y + a.h) + " C" + (a.x + a.w / 2) + "," + (a.y + a.h + 46) + " " + (b.x + b.w / 2) + "," + (b.y + b.h + 46) + " " + (b.x + b.w / 2) + "," + (b.y + b.h);
      const p = mk("path", { d, class: "edge", stroke: M.LINK_KINDS[l.kind].color, "marker-end": "url(#arr-" + l.kind + ")" });
      const tt = mk("title"); tt.textContent = M.LINK_KINDS[l.kind].label + ": " + nodeLabel(l.from) + " → " + nodeLabel(l.to) + (l.note ? " — " + l.note : ""); p.appendChild(tt);
      svg.appendChild(p); drawn++;
    });
    body.appendChild(svg);
    if (!drawn) { const e = el("div", "empty", "Связей пока нет. Выберите стенд, справа «Новая связь отсюда»."); e.style.padding = "16px 20px"; body.insertBefore(e, svg); }
    openSheet($("sh-map"));
  }
  $("btn-map").addEventListener("click", () => { const w = (S.sel.type === "stand" || S.sel.type === "section") ? findDoor(S.sel.sec) : null; openMap(w ? w.c : null); });
  $("map-x").addEventListener("click", () => closeSheet($("sh-map")));
  $("sh-map").addEventListener("pointerdown", (e) => { if (e.target === $("sh-map")) closeSheet($("sh-map")); });

  /* ═══ слушатели ═══════════════════════════════════════════════════════
     Ссылка `?g=<ключ>` — это не пароль: её можно переслать, отзывается она
     правкой файла и публикацией. Пока ключ заведён только в браузере,
     ссылка ещё не работает ни у кого, и в списке это сказано. */
  const guestKey = (name) => {
    let base = slug(name) || "guest";
    let k = base, n = 2;
    while (S.guests[k]) k = base + "-" + (n++);
    return k;
  };
  const guestLink = (k) => location.href.replace(/[^/]*$/, "") + "index.html?g=" + encodeURIComponent(k);
  async function addGuest() {
    const name = $("gs-name").value.trim();
    if (!name) { toast("Имя не может быть пустым"); return; }
    const k = guestKey(name);
    S.guests[k] = { name, role: "cadet", note: "Персональный вход слушателя", local: true };
    await saveGuests();
    $("gs-name").value = "";
    buildGuests();
    toast("Слушатель заведён. Ссылка заработает после публикации");
  }
  function buildGuests() {
    const list = $("gs-list"); list.innerHTML = "";
    const keys = Object.keys(S.guests);
    const pending = keys.filter((k) => S.guests[k].local).length;
    $("gs-lead").textContent = keys.length
      ? "Заведено " + keys.length + (pending ? ", из них ещё не опубликовано " + pending : ", все опубликованы") + "."
      : "Пока никого. Слушатель заходит по персональной ссылке, учётных записей у павильона нет.";
    if (!keys.length) { list.appendChild(el("div", "empty", "Пока никого.")); }
    keys.forEach((k) => {
      const g = S.guests[k];
      const r = el("div", "trow");
      r.appendChild(el("span", "t", g.name));
      r.appendChild(el("span", "m", g.local ? "только в браузере" : "опубликован"));
      r.appendChild(btn("копировать ссылку", "sm", async () => {
        try { await navigator.clipboard.writeText(guestLink(k)); toast("Ссылка скопирована"); }
        catch (e) { prompt("Скопируйте ссылку:", guestLink(k)); }
      }));
      r.appendChild(btn("убрать", "sm warn", async () => {
        if (!confirm("Убрать слушателя «" + g.name + "»? Его ссылка перестанет работать после следующей публикации.")) return;
        delete S.guests[k]; await saveGuests(); buildGuests();
      }));
      list.appendChild(r);
    });
    $("gs-key-state").textContent = KEY_HASH
      ? "Мастерская закрыта ключом. Чтобы сменить слово — задайте новое и пришлите отпечаток разработчику."
      : "Мастерская сейчас ОТКРЫТА всякому, у кого есть адрес. Задайте слово и пришлите отпечаток разработчику — он положит его в файл и опубликует.";
  }
  $("btn-guests").addEventListener("click", () => { buildGuests(); openSheet($("sh-guests")); });
  $("gs-add").addEventListener("click", addGuest);
  $("gs-name").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addGuest(); } });
  $("gs-key-calc").addEventListener("click", async () => {
    const w = $("gs-key").value;
    if (!w) { toast("Введите слово"); return; }
    const h = await sha256(w);
    if (!h) { toast("Браузер не считает отпечаток на этой странице"); return; }
    $("gs-key").value = "";
    const out = $("gs-key-out");
    out.hidden = false;
    out.innerHTML = "Отпечаток (само слово никуда не уходит, присылайте только эту строку):<br><code style=\"font-family:var(--mono); font-size:11px; background:#f0f0f0; padding:1px 3px\">" + esc(h) + "</code>";
    try { localStorage.setItem(KEY_STORE, w); } catch (e) { /* не страшно */ }
    try { await navigator.clipboard.writeText(h); toast("Отпечаток скопирован"); } catch (e) { toast("Отпечаток показан ниже"); }
  });
  $("gs-key-forget").addEventListener("click", () => {
    try { localStorage.removeItem(KEY_STORE); } catch (e) { /* не страшно */ }
    toast(KEY_HASH ? "Забыт. При следующем входе спросит ключ" : "Забыт");
  });
  $("gs-x").addEventListener("click", () => closeSheet($("sh-guests")));
  $("gs-done").addEventListener("click", () => closeSheet($("sh-guests")));
  $("sh-guests").addEventListener("pointerdown", (e) => { if (e.target === $("sh-guests")) closeSheet($("sh-guests")); });

  /* ═══ данные ══════════════════════════════════════════════════════════ */
  function download(name, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const today = () => new Date().toISOString().slice(0, 10);
  async function exportAll() {
    const sections = {};
    Object.values(S.sections).forEach((s) => { sections[s.id] = { pavilion: s.id, title: s.title, subtitle: s.subtitle, hasFile: s.hasFile, changed: M.fingerprint(s.stands) !== s.fileFp, stands: s.stands.map(M.plainStand) }; });
    // Загруженные файлы едут вместе: иначе на той стороне будут записи без содержимого.
    const used = new Set();
    Object.values(S.sections).forEach((sec) => sec.stands.forEach((st) => (st.downloads || []).forEach((d) => { if (d.fileId) used.add(d.fileId); })));
    const files = {};
    let heavy = 0;
    for (const id of used) {
      const rec = await M.getFile(id);
      if (!rec || !rec.blob) continue;
      files[id] = { name: rec.name, type: rec.type, size: rec.size, base64: await M.blobToBase64(rec.blob) };
      heavy += rec.size;
    }
    download("skipi-academy-" + today() + ".json", { format: "skipi-academy", version: 1, exportedAt: new Date().toISOString(), academy: { title: FILE_ACADEMY.title, place: FILE_ACADEMY.place, buildings: M.cloneStructure(S.buildings) }, sections, links: S.links,
      guests: Object.fromEntries(Object.entries(S.guests).map(([k, v]) => [k, { name: v.name, role: v.role, note: v.note }])), files });
    toast(Object.keys(files).length ? "Выгружено, файлов внутри " + Object.keys(files).length + " (" + M.niceSize(heavy) + ")" : "Файл академии выгружен");
  }
  function exportSection(id) {
    const s = S.sections[id];
    download("skipi-" + id + "-" + today() + ".json", { pavilion: id, title: s.title, subtitle: s.subtitle, exportedAt: new Date().toISOString(), stands: s.stands.map(M.plainStand) });
    toast("Раздел выгружен");
  }
  let jsonSink = null;
  function importJson(fn) { jsonSink = fn; $("file-json").click(); }
  $("file-json").addEventListener("change", async () => {
    const f = $("file-json").files && $("file-json").files[0]; $("file-json").value = "";
    if (!f || !jsonSink) return;
    try { const parsed = JSON.parse(await f.text()); await jsonSink(parsed); } catch (e) { toast("Не похоже на файл мастерской"); }
    jsonSink = null;
  });
  async function importSection(id, parsed) {
    const list = Array.isArray(parsed) ? parsed : parsed.stands;
    if (!Array.isArray(list)) throw new Error("пусто");
    const s = S.sections[id];
    if (!confirm("Заменить " + s.stands.length + " стендов раздела «" + s.title + "» на " + list.length + " из файла?")) return;
    s.stands = list.map(M.normalizeStand);
    if (!Array.isArray(parsed) && parsed.title) { s.title = String(parsed.title); s.subtitle = String(parsed.subtitle || ""); const w = findDoor(id); if (w) { w.d.label = s.title; await saveStructure(); } }
    await saveSection(id); renderAll(); toast("Загружено стендов: " + list.length);
  }
  async function importAll(parsed) {
    if (parsed.format !== "skipi-academy") {
      // файл одного раздела — в выбранный или в его собственный
      const id = parsed.pavilion && S.sections[parsed.pavilion] ? parsed.pavilion : ((S.sel.type === "stand" || S.sel.type === "section") ? S.sel.sec : "");
      if (!id) { toast("Это файл раздела: выберите раздел и загрузите в него"); return; }
      await importSection(id, parsed); return;
    }
    const nS = Object.keys(parsed.sections || {}).length;
    if (!confirm("Заменить всю структуру, " + nS + " разделов и " + ((parsed.links || []).length) + " связей тем, что в файле? Текущее состояние этого браузера будет перезаписано.")) return;
    S.buildings = M.cloneStructure(((parsed.academy || {}).buildings) || []);
    await saveStructure();
    for (const id of Object.keys(parsed.sections || {})) {
      const src = parsed.sections[id];
      if (!S.sections[id]) await loadSection(id, (findDoor(id) || { d: null }).d);
      const s = S.sections[id];
      s.stands = (src.stands || []).map(M.normalizeStand);
      if (src.title) s.title = String(src.title); s.subtitle = String(src.subtitle || "");
      await saveSection(id);
    }
    S.links = (parsed.links || []).map(M.normalizeLink).filter(Boolean);
    await saveLinks();
    closeSheet($("sh-data")); select({ type: "academy" }); toast("Академия загружена из файла");
  }
  $("btn-data").addEventListener("click", () => {
    const secs = Object.values(S.sections);
    const changed = secs.filter((s) => M.fingerprint(s.stands) !== s.fileFp || !s.hasFile).length;
    const bytes = new Blob([JSON.stringify(secs.map((s) => s.stands))]).size;
    $("dt-lead").textContent = "Разделов " + secs.length + ", из них отличаются от файлов или живут только здесь: " + changed + ". Связей " + S.links.length + ". Занято примерно " + (bytes / 1024 > 900 ? (bytes / 1048576).toFixed(1) + " МБ" : Math.round(bytes / 1024) + " КБ") + ".";
    const tr = $("dt-trash"); tr.innerHTML = "";
    if (!S.trash.length) tr.appendChild(el("div", "empty", "Пусто."));
    S.trash.forEach((t, i) => {
      const r = el("div", "trow");
      r.appendChild(el("span", "t", (t.stand.title || t.stand.short) + " — из «" + (t.secTitle || t.sec) + "»"));
      r.appendChild(el("span", "m", new Date(t.deletedAt).toLocaleString("ru-RU")));
      r.appendChild(btn("вернуть", "sm", () => restoreTrash(i)));
      const x = btn("×", "sm warn", async () => { S.trash.splice(i, 1); await saveTrash(); $("btn-data").click(); }); x.title = "удалить навсегда"; r.appendChild(x);
      tr.appendChild(r);
    });
    openSheet($("sh-data"));
  });
  $("dt-x").addEventListener("click", () => closeSheet($("sh-data")));
  $("dt-done").addEventListener("click", () => closeSheet($("sh-data")));
  $("sh-data").addEventListener("pointerdown", (e) => { if (e.target === $("sh-data")) closeSheet($("sh-data")); });
  $("dt-export").addEventListener("click", exportAll);
  $("dt-import").addEventListener("click", () => importJson(importAll));
  $("dt-reset-structure").addEventListener("click", async () => {
    if (!confirm("Вернуть структуру корпусов, курсов и разделов из файла? Разделы, созданные здесь, исчезнут из дерева (их стенды останутся в браузере и вернутся, если раздел создать с тем же кодом).")) return;
    await M.storeDel(M.KEY_ACADEMY);
    location.reload();
  });
  $("dt-wipe").addEventListener("click", async () => {
    if (!confirm("Стереть из этого браузера ВСЁ, что сделано в мастерской и павильоне: структуру, стенды всех разделов, связи, корзину? Файлы репозитория не пострадают.")) return;
    if (!confirm("Точно? Если не выгружали «всё» — сначала выгрузите.")) return;
    for (const k of await M.storeKeys()) await M.storeDel(k);
    location.reload();
  });

  /* ═══ поиск, режим, пуск ══════════════════════════════════════════════ */
  $("q").addEventListener("input", () => { S.q = $("q").value.trim().toLowerCase(); renderTree(); });
  $("q").addEventListener("keydown", (e) => { if (e.key === "Escape") { $("q").value = ""; S.q = ""; renderTree(); } });
  function setBuildMode() { try { localStorage.setItem("skipi-edu/mode", "build"); } catch (e) { /* пусто */ } }

  /* Адрес выбранного в дереве для павильона. Слово владельца 26.10: переключаясь
     в игру, человек должен оказаться там, где стоит курсор, а не на улице. */
  function playAddress(sel) {
    const enc = encodeURIComponent;
    if (!sel) return "";
    if (sel.type === "stand") return "#go=" + enc(sel.sec) + "/" + enc(sel.stand);
    if (sel.type === "section") return "#go=" + enc(sel.sec);
    if (sel.type === "course") return "#go=c:" + enc(sel.b) + ":" + enc(sel.c);
    if (sel.type === "building") return "#go=b:" + enc(sel.b);
    return "";
  }
  $("mode-play").addEventListener("click", () => {
    try { localStorage.setItem("skipi-edu/mode", "play"); } catch (e) { /* пусто */ }
    location.href = "index.html" + playAddress(S.sel);
  });
  $("btn-pav").addEventListener("click", setBuildMode);
  setBuildMode();

  function start() {
    const cell = document.querySelector(".statusbar .cell:nth-child(3)");
    if (cell && !KEY_HASH) { cell.textContent = "Мастерская открыта всем — ключ не задан"; cell.style.color = "#800000"; }
    load().catch((e) => { setStatus("ошибка загрузки"); console.error(e); toast("Не удалось загрузить: " + e.message); });
  }
  passGate().then((ok) => { if (ok) start(); else showGate(); });
})();
