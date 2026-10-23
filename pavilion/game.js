/* Skipi Education — интерактивное пространство.
   Статика без сборки, без сервера, без учётных записей.
   Исходные стенды лежат в content/communication.js.
   Стенды, созданные и исправленные в браузере, лежат в этом же браузере (IndexedDB). */
(() => {
  "use strict";

  /* ═══ экран ═══════════════════════════════════════════════════════════ */
  const VW = 384, VH = 216, FLOOR_Y = 186, CEIL_H = 36;
  const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  const GAP = 240, FIRST_X = 300, ENTRY_X = 80;

  const cv = document.getElementById("screen");
  const ctx = cv.getContext("2d", { alpha: false });
  let scale = 3;

  function resize() {
    const pad = window.innerWidth < 700 ? 0 : 24;
    const raw = Math.min((window.innerWidth - pad) / VW, (window.innerHeight - pad) / VH);
    // на большом экране — целое увеличение, пиксель в пиксель;
    // на телефоне целое дало бы узкую полоску, поэтому там дробное
    scale = raw >= 2 ? Math.floor(raw) : Math.max(0.6, raw);
    cv.style.width = Math.round(VW * scale) + "px";
    cv.style.height = Math.round(VH * scale) + "px";
  }
  resize();

  /* ═══ палитра и пиктограммы ═══════════════════════════════════════════ */
  const C = {
    ceil: "#0a141d", ceilRib: "#102130", lampBox: "#1b2f3f", lampLit: "#ffd98a",
    wallA: "#17313f", wallB: "#143040", wallSeam: "#0d2029", wallTrim: "#20495c",
    skirt: "#0c1c25", floor: "#122029", floorLane: "#182d39", floorEdge: "#0a1620",
    standFrame: "#0b1620", standBody: "#dde6ec", standBody2: "#c6d3dd", standInk: "#16242e",
    doorFrame: "#0b1620", doorDark: "#071018", doorGlow: "#ffcf86",
    teal: "#2aa0a0", amber: "#f0a830", paper: "#e6eef6"
  };
  const ACCENTS = ["#f0a830", "#2aa0a0", "#e0674a", "#7fb069", "#8e86d8", "#4a9fd8", "#d8894a"];
  const ICONS = {
    radio:   ["..#....#", "...#..#.", "....##..", ".######.", ".#....#.", ".#.##.#.", ".#....#.", ".######."],
    antenna: ["#..#..#.", ".#.#.#..", "..###...", "...#....", "...#....", "..###...", ".#####..", "#######."],
    speech:  [".#####..", "#.....#.", "#.##..#.", "#.....#.", "#..##.#.", "#.....#.", ".###.#..", "...#...."],
    alarm:   ["...#....", "..###...", ".#####..", ".#####..", "#######.", "#######.", "........", "...#...."],
    bridge:  ["..####..", ".#....#.", "#..##..#", "#.####.#", "#..##..#", ".#....#.", "..####..", "...##..."],
    pilot:   ["..####..", ".######.", "..####..", "...##...", ".######.", "#..##..#", "#..##..#", "...##..."],
    office:  ["#######.", "#.#.#.#.", "#######.", "#.#.#.#.", "#######.", "#.###.#.", "#.###.#.", "#######."],
    log:     [".#####..", ".#...#..", ".#.###..", ".#...#..", ".#.###..", ".#...#..", ".#####..", "..###..."],
    book:    ["..####..", ".#....#.", "#.####.#", "#.#..#.#", "#.####.#", "#.#..#.#", "#.####.#", ".######."],
    anchor:  ["...##...", "...##...", ".######.", "...##...", "#..##..#", "#..##..#", ".######.", "..####.."]
  };
  const ICON_NAMES = Object.keys(ICONS);

  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); };
  function text(s, x, y, size, color, align) {
    ctx.font = "700 " + size + "px " + MONO;
    ctx.textAlign = align || "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = color;
    ctx.fillText(s, x | 0, y | 0);
    ctx.textAlign = "left";
  }
  function icon(name, x, y, mul, color) {
    const g = ICONS[name] || ICONS.book;
    ctx.fillStyle = color;
    for (let r = 0; r < g.length; r++)
      for (let c = 0; c < g[r].length; c++)
        if (g[r][c] === "#") ctx.fillRect((x + c * mul) | 0, (y + r * mul) | 0, mul, mul);
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ═══ хранилище: IndexedDB, запасной путь — localStorage ══════════════ */
  const DB_NAME = "skipi-education", STORE = "pavilions";
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error("no idb"));
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function storeGet(key) {
    try {
      const d = await db();
      return await new Promise((res, rej) => {
        const t = d.transaction(STORE, "readonly").objectStore(STORE).get(key);
        t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error);
      });
    } catch (e) {
      try { const raw = localStorage.getItem(DB_NAME + "/" + key); return raw ? JSON.parse(raw) : undefined; }
      catch (e2) { return undefined; }
    }
  }
  async function storeSet(key, val) {
    try {
      const d = await db();
      return await new Promise((res, rej) => {
        const t = d.transaction(STORE, "readwrite").objectStore(STORE).put(val, key);
        t.onsuccess = () => res(true); t.onerror = () => rej(t.error);
      });
    } catch (e) {
      try { localStorage.setItem(DB_NAME + "/" + key, JSON.stringify(val)); return true; }
      catch (e2) { toast("Не удалось сохранить: в браузере кончилось место"); return false; }
    }
  }

  /* ═══ модель ══════════════════════════════════════════════════════════ */
  const SEED = window.SKIPI_PAVILION || { id: "pavilion", title: "Павильон", subtitle: "", stands: [] };
  const PID = SEED.id;
  const SEEN_KEY = "skipi-edu/" + PID + "/seen";

  let stands = [];
  let CORRIDOR_W = 900, EXIT_X = 780;
  let seen = new Set();
  try { seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); } catch (e) { /* приватный режим */ }

  const newId = () => "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  function normalize(raw, i) {
    return {
      id: raw.id || newId(),
      short: (raw.short || "СТЕНД").slice(0, 10),
      icon: ICONS[raw.icon] ? raw.icon : "book",
      accent: raw.accent || ACCENTS[i % ACCENTS.length],
      title: raw.title || "",
      lead: raw.lead || "",
      body: Array.isArray(raw.body) ? raw.body.slice() : (raw.body ? [String(raw.body)] : []),
      pointsTitle: raw.pointsTitle || "",
      points: Array.isArray(raw.points) ? raw.points.slice() : [],
      note: raw.note || "",
      image: raw.image || null,          // dataURL
      caption: raw.caption || "",
      draft: !!raw.draft,
      custom: !!raw.custom
    };
  }

  function relayout() {
    stands.forEach((s, i) => { s.index = i; s.x = FIRST_X + i * GAP; });
    const last = stands.length ? stands[stands.length - 1].x : FIRST_X - GAP;
    CORRIDOR_W = Math.max(760, last + 300);
    EXIT_X = CORRIDOR_W - 120;
    buildRail();
    syncChrome();
  }

  async function save() {
    const plain = stands.map((s) => ({
      id: s.id, short: s.short, icon: s.icon, accent: s.accent, title: s.title, lead: s.lead,
      body: s.body, pointsTitle: s.pointsTitle, points: s.points, note: s.note,
      image: s.image, caption: s.caption, draft: s.draft, custom: s.custom
    }));
    await storeSet(PID, { version: 1, savedAt: new Date().toISOString(), stands: plain });
  }
  function markSeen(id) {
    seen.add(id);
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen])); } catch (e) { /* не страшно */ }
  }

  /* ═══ изображения ═════════════════════════════════════════════════════ */
  const imgCache = new Map();
  function getImg(src) {
    if (!src) return null;
    let im = imgCache.get(src);
    if (!im) { im = new Image(); im.src = src; imgCache.set(src, im); }
    return im.complete && im.naturalWidth ? im : null;
  }
  const MAX_SIDE = 1400, MAX_BYTES = 420 * 1024;

  function fileToDataUrl(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(file);
    });
  }
  function loadImage(src) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("bad image"));
      im.src = src;
    });
  }
  async function ingestImage(file) {
    try { return await ingestImageInner(file); }
    catch (e) { toast("Не удалось прочитать изображение"); return null; }
  }
  async function ingestImageInner(file) {
    if (!file || !/^image\//.test(file.type)) { toast("Это не изображение"); return null; }
    let url = await fileToDataUrl(file);
    const im = await loadImage(url);
    const big = Math.max(im.naturalWidth, im.naturalHeight) > MAX_SIDE;
    if (big || url.length > MAX_BYTES * 1.37) {
      const k = Math.min(1, MAX_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
      const w = Math.max(1, Math.round(im.naturalWidth * k));
      const h = Math.max(1, Math.round(im.naturalHeight * k));
      const oc = document.createElement("canvas");
      oc.width = w; oc.height = h;
      oc.getContext("2d").drawImage(im, 0, 0, w, h);
      let out = oc.toDataURL("image/webp", 0.86);
      if (out.length > url.length || out.indexOf("data:image/webp") !== 0) out = oc.toDataURL("image/jpeg", 0.86);
      if (out.length < url.length) url = out;
    }
    return url;
  }

  /* ═══ состояние игры ══════════════════════════════════════════════════ */
  const HUB_W = 1120;
  const DOORS = [
    { x: 360, label: (SEED.title || "ПАВИЛЬОН").toUpperCase(), open: true },
    { x: 620, label: "СКОРО", open: false },
    { x: 880, label: "СКОРО", open: false }
  ];
  const game = {
    scene: "hub", x: 170, facing: 1, walkPhase: 0, moving: false,
    cam: 0, fade: 1, fadeDir: -1, fadeThen: null,
    autoTarget: null, autoOpen: null, focus: null
  };
  const SPEED = 78;
  const worldWidth = () => (game.scene === "hub" ? HUB_W : CORRIDOR_W);
  const uiOpen = () => !!document.querySelector(".sheet.on");

  function go(scene, atX) {
    game.fadeDir = 1;
    game.fadeThen = () => {
      game.scene = scene; game.x = atX; game.autoTarget = null; game.autoOpen = null;
      game.cam = clamp(game.x - VW / 2, 0, worldWidth() - VW);
      syncChrome();
    };
  }

  /* ═══ ввод ════════════════════════════════════════════════════════════ */
  const held = { left: false, right: false };
  let actLatch = false;
  const K_LEFT = ["ArrowLeft", "KeyA"], K_RIGHT = ["ArrowRight", "KeyD"];
  const K_ACT = ["ArrowUp", "KeyW", "Space", "Enter", "KeyE"];
  const typing = (e) => /^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || "");

  addEventListener("keydown", (e) => {
    if (e.code === "Escape") { closeTop(); return; }
    if (typing(e)) return;
    if (titleShown) { if (K_ACT.includes(e.code)) { e.preventDefault(); startGame(); } return; }
    if (uiOpen()) { if (K_ACT.includes(e.code)) { e.preventDefault(); closeTop(); } return; }
    if (K_LEFT.includes(e.code)) { held.left = true; game.autoTarget = null; e.preventDefault(); }
    if (K_RIGHT.includes(e.code)) { held.right = true; game.autoTarget = null; e.preventDefault(); }
    if (K_ACT.includes(e.code)) { if (!actLatch) { actLatch = true; interact(); } e.preventDefault(); }
  });
  addEventListener("keyup", (e) => {
    if (K_LEFT.includes(e.code)) held.left = false;
    if (K_RIGHT.includes(e.code)) held.right = false;
    if (K_ACT.includes(e.code)) actLatch = false;
  });
  addEventListener("blur", () => { held.left = held.right = false; });

  if ("ontouchstart" in window || navigator.maxTouchPoints > 0) document.body.classList.add("is-touch");
  document.querySelectorAll("[data-hold]").forEach((btn) => {
    const key = btn.dataset.hold;
    const down = (e) => { e.preventDefault(); if (key === "act") interact(); else { held[key] = true; game.autoTarget = null; } };
    const up = (e) => { e.preventDefault(); if (key !== "act") held[key] = false; };
    btn.addEventListener("touchstart", down, { passive: false });
    btn.addEventListener("touchend", up, { passive: false });
    btn.addEventListener("mousedown", down);
    addEventListener("mouseup", up);
  });

  cv.addEventListener("pointerdown", (e) => {
    if (uiOpen() || titleShown) return;
    const r = cv.getBoundingClientRect();
    const wx = game.cam + (e.clientX - r.left) / scale;
    const wy = (e.clientY - r.top) / scale;
    game.autoOpen = null;
    if (game.scene === "corridor") {
      const hit = stands.find((s) => Math.abs(s.x - wx) < 34 && wy > 98 && wy < 182);
      if (hit) { game.autoTarget = hit.x; game.autoOpen = hit.id; return; }
    }
    game.autoTarget = clamp(wx, 40, worldWidth() - 40);
  });

  /* ═══ что под рукой ═══════════════════════════════════════════════════ */
  const REACH = 52;
  function computeFocus() {
    let best = null;
    const near = (kind, x, extra) => {
      const d = Math.abs(x - game.x);
      if (d < REACH && (!best || d < best.dist)) best = Object.assign({ kind, dist: d }, extra || {});
    };
    if (game.scene === "hub") { DOORS.forEach((d) => near("door", d.x, { door: d })); return best; }
    stands.forEach((s) => near("stand", s.x, { stand: s }));
    near("exit", EXIT_X);
    near("entry", ENTRY_X);
    return best;
  }

  function interact() {
    if (titleShown) { startGame(); return; }
    if (uiOpen() || game.fadeDir === 1) return;
    const f = game.focus;
    if (!f) return;
    if (f.kind === "door") { f.door.open ? go("corridor", ENTRY_X + 40) : toast("Этот павильон ещё закрыт"); return; }
    if (f.kind === "entry") { go("hub", DOORS[0].x); return; }
    if (f.kind === "exit") { openFinal(); return; }
    openStand(f.stand);
  }

  /* ═══ элементы ════════════════════════════════════════════════════════ */
  const $ = (id) => document.getElementById(id);
  const sheetCard = $("modal"), sheetEd = $("editor"), sheetData = $("data");
  const elPrompt = $("prompt"), elPromptCap = $("prompt-cap"), elPromptKey = $("prompt-key");
  const elWhere = $("hud-where"), elCount = $("hud-count"), elRail = $("rail"), elToast = $("toast");
  const btnAdd = $("btn-add"), btnData = $("btn-data");

  let toastTimer = 0;
  function toast(msg) {
    elToast.textContent = msg;
    elToast.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elToast.classList.remove("on"), 2200);
  }
  function openSheet(el) { el.classList.add("on"); }
  function closeSheet(el) { el.classList.remove("on"); syncChrome(); }
  function closeTop() {
    if (sheetEd.classList.contains("on")) { commitEditor(); closeSheet(sheetEd); return; }
    if (sheetData.classList.contains("on")) { closeSheet(sheetData); return; }
    if (sheetCard.classList.contains("on")) { closeSheet(sheetCard); return; }
  }

  /* ═══ карточка стенда ═════════════════════════════════════════════════ */
  let currentStand = null;
  function openStand(s) {
    currentStand = s;
    $("card-no").textContent = "Стенд " + String(s.index + 1).padStart(2, "0") + " из " + String(stands.length).padStart(2, "0");
    $("card-no").style.color = s.accent;
    $("card-title").textContent = s.title || s.short;
    $("card-lead").textContent = s.lead || "";
    $("card-lead").hidden = !s.lead;
    const body = $("card-body");
    body.innerHTML = "";
    if (s.image) {
      const im = document.createElement("img");
      im.className = "shot"; im.src = s.image; im.alt = s.caption || s.title || "";
      body.appendChild(im);
      if (s.caption) { const c = document.createElement("div"); c.className = "shot-cap"; c.textContent = s.caption; body.appendChild(c); }
    }
    (s.body || []).forEach((p) => { const n = document.createElement("p"); n.textContent = p; body.appendChild(n); });
    if (s.points && s.points.length) {
      const h = document.createElement("div");
      h.className = "card-h"; h.style.color = s.accent; h.textContent = s.pointsTitle || "Коротко";
      body.appendChild(h);
      const ul = document.createElement("ul");
      s.points.forEach((t) => { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); });
      body.appendChild(ul);
    }
    if (!s.image && !(s.body || []).length && !(s.points || []).length) {
      const n = document.createElement("p");
      n.style.color = "#6f8aa1";
      n.textContent = "Стенд пока пустой. Нажмите «Править стенд» — и положите на него изображение или текст.";
      body.appendChild(n);
    }
    $("card-note").textContent = s.note || "";
    $("card-note").hidden = !s.note;
    $("card-draft").hidden = !s.draft;
    const next = stands[s.index + 1];
    $("card-next").textContent = next ? "К стенду «" + next.short + "» →" : "К выходу →";
    $("card-edit").hidden = false;
    sheetCard.querySelector(".card").style.borderTopColor = s.accent;
    openSheet(sheetCard);
    markSeen(s.id);
    syncChrome();
  }

  function openFinal() {
    currentStand = null;
    const done = stands.filter((s) => seen.has(s.id)).length;
    const all = stands.length > 0 && done === stands.length;
    $("card-no").textContent = "Выход";
    $("card-no").style.color = C.teal;
    $("card-title").textContent = all ? "Коридор пройден" : "Вы у выхода";
    $("card-lead").hidden = false;
    $("card-lead").textContent = "Открыто стендов: " + done + " из " + stands.length + ".";
    const body = $("card-body");
    body.innerHTML = "";
    const p = document.createElement("p");
    p.textContent = all
      ? "Павильон «" + SEED.title + "» пройден целиком. Отметки о стендах остаются в этом браузере."
      : "Можно вернуться и пройти оставшиеся стенды, а можно выйти в вестибюль.";
    body.appendChild(p);
    $("card-note").hidden = true;
    $("card-draft").hidden = true;
    $("card-edit").hidden = true;
    $("card-next").textContent = "Выйти в вестибюль";
    sheetCard.querySelector(".card").style.borderTopColor = C.teal;
    openSheet(sheetCard);
  }

  $("card-x").addEventListener("click", () => closeSheet(sheetCard));
  sheetCard.addEventListener("pointerdown", (e) => { if (e.target === sheetCard) closeSheet(sheetCard); });
  $("card-next").addEventListener("click", () => {
    const s = currentStand;
    closeSheet(sheetCard);
    if (!s) { go("hub", DOORS[0].x); return; }
    const next = stands[s.index + 1];
    game.autoTarget = next ? next.x : EXIT_X;
    game.autoOpen = next ? next.id : null;
  });
  $("card-edit").addEventListener("click", () => { closeSheet(sheetCard); if (currentStand) openEditor(currentStand); });

  /* ═══ редактор стенда ═════════════════════════════════════════════════ */
  let editing = null, edImage = null;

  function buildPickers() {
    const ic = $("ed-icons");
    ic.innerHTML = "";
    ICON_NAMES.forEach((name) => {
      const b = document.createElement("button");
      b.className = "ic"; b.dataset.icon = name; b.type = "button";
      const c = document.createElement("canvas");
      c.width = 24; c.height = 24;
      const g = c.getContext("2d");
      g.fillStyle = "#9fb6c9";
      const grid = ICONS[name];
      for (let r = 0; r < 8; r++) for (let q = 0; q < 8; q++) if (grid[r][q] === "#") g.fillRect(q * 3, r * 3, 3, 3);
      b.appendChild(c);
      b.addEventListener("click", () => {
        if (!editing) return;
        editing.icon = name;
        ic.querySelectorAll(".ic").forEach((n) => n.classList.toggle("on", n.dataset.icon === name));
      });
      ic.appendChild(b);
    });
    const sw = $("ed-colors");
    sw.innerHTML = "";
    ACCENTS.forEach((col) => {
      const b = document.createElement("button");
      b.className = "sw"; b.type = "button"; b.dataset.col = col; b.style.background = col;
      b.addEventListener("click", () => {
        if (!editing) return;
        editing.accent = col;
        sw.querySelectorAll(".sw").forEach((n) => n.classList.toggle("on", n.dataset.col === col));
      });
      sw.appendChild(b);
    });
  }
  buildPickers();

  function setEdImage(src) {
    edImage = src || null;
    const im = $("ed-img");
    im.hidden = !src;
    if (src) im.src = src;
    $("ed-drop-big").textContent = src ? "Заменить: Ctrl+V, перетащите файл или нажмите" : "Вставьте Ctrl+V · перетащите файл · нажмите, чтобы выбрать";
    $("ed-img-actions").hidden = !src;
  }

  function openEditor(s) {
    editing = s;
    $("ed-no").textContent = "Стенд " + String(s.index + 1).padStart(2, "0");
    $("ed-short").value = s.short;
    $("ed-title").value = s.title;
    $("ed-lead").value = s.lead;
    $("ed-body").value = (s.body || []).join("\n");
    $("ed-points").value = (s.points || []).join("\n");
    $("ed-points-title").value = s.pointsTitle;
    $("ed-note").value = s.note;
    $("ed-caption").value = s.caption;
    setEdImage(s.image);
    $("ed-icons").querySelectorAll(".ic").forEach((n) => n.classList.toggle("on", n.dataset.icon === s.icon));
    $("ed-colors").querySelectorAll(".sw").forEach((n) => n.classList.toggle("on", n.dataset.col === s.accent));
    openSheet(sheetEd);
  }

  function commitEditor() {
    if (!editing) return;
    const s = editing;
    const lines = (v) => v.split("\n").map((t) => t.trim()).filter(Boolean);
    s.short = ($("ed-short").value.trim() || "СТЕНД").slice(0, 10);
    s.title = $("ed-title").value.trim();
    s.lead = $("ed-lead").value.trim();
    s.body = lines($("ed-body").value);
    s.points = lines($("ed-points").value);
    s.pointsTitle = $("ed-points-title").value.trim();
    s.note = $("ed-note").value.trim();
    s.caption = $("ed-caption").value.trim();
    s.image = edImage;
    save();
    relayout();
  }

  $("ed-done").addEventListener("click", () => { commitEditor(); closeSheet(sheetEd); });
  $("ed-x").addEventListener("click", () => { commitEditor(); closeSheet(sheetEd); });
  sheetEd.addEventListener("pointerdown", (e) => { if (e.target === sheetEd) { commitEditor(); closeSheet(sheetEd); } });
  $("ed-img-clear").addEventListener("click", () => setEdImage(null));

  $("ed-del").addEventListener("click", () => {
    if (!editing) return;
    if (!confirm("Удалить стенд «" + (editing.title || editing.short) + "»?")) return;
    const i = stands.indexOf(editing);
    stands.splice(i, 1);
    editing = null;
    closeSheet(sheetEd);
    save(); relayout();
    game.x = clamp(stands.length ? stands[Math.min(i, stands.length - 1)].x : ENTRY_X + 40, 28, CORRIDOR_W - 28);
    toast("Стенд удалён");
  });
  $("ed-dup").addEventListener("click", () => {
    if (!editing) return;
    commitEditor();
    const copy = normalize(JSON.parse(JSON.stringify(editing)), stands.length);
    copy.id = newId(); copy.custom = true;
    copy.title = (copy.title || copy.short) + " — копия";
    stands.splice(editing.index + 1, 0, copy);
    save(); relayout();
    openEditor(copy);
    toast("Стенд продублирован");
  });
  const move = (dir) => {
    if (!editing) return;
    commitEditor();
    const i = editing.index, j = i + dir;
    if (j < 0 || j >= stands.length) return;
    stands.splice(j, 0, stands.splice(i, 1)[0]);
    relayout();
    $("ed-no").textContent = "Стенд " + String(editing.index + 1).padStart(2, "0");
    game.x = editing.x; game.autoTarget = null;
    save();
  };
  $("ed-left").addEventListener("click", () => move(-1));
  $("ed-right").addEventListener("click", () => move(1));

  /* изображение: файл, перетаскивание, буфер обмена */
  const fileImg = $("file-img"), drop = $("ed-drop");
  drop.addEventListener("click", () => fileImg.click());
  fileImg.addEventListener("change", async () => {
    const f = fileImg.files && fileImg.files[0];
    fileImg.value = "";
    if (!f) return;
    const src = await ingestImage(f);
    if (src) { setEdImage(src); toast("Изображение добавлено"); }
  });
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", async (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    const src = await ingestImage(f);
    if (src) { setEdImage(src); toast("Изображение добавлено"); }
  });
  addEventListener("paste", async (e) => {
    const items = (e.clipboardData && e.clipboardData.items) || [];
    let file = null;
    for (const it of items) if (it.kind === "file" && /^image\//.test(it.type)) { file = it.getAsFile(); break; }
    if (!file) {
      const t = e.clipboardData && e.clipboardData.getData("text/plain");
      if (t && /^(https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S*)?|data:image\/)/i.test(t.trim())) {
        if (sheetEd.classList.contains("on")) { e.preventDefault(); setEdImage(t.trim()); toast("Изображение по ссылке"); }
      }
      return;
    }
    e.preventDefault();
    const src = await ingestImage(file);
    if (!src) return;
    if (sheetEd.classList.contains("on")) { setEdImage(src); toast("Изображение вставлено"); return; }
    const target = game.focus && game.focus.kind === "stand" ? game.focus.stand : null;
    if (target) { target.image = src; save(); toast("Изображение легло на стенд «" + target.short + "»"); }
    else toast("Подойдите к стенду или откройте «Править стенд»");
  });

  /* ═══ создать стенд ═══════════════════════════════════════════════════ */
  btnAdd.addEventListener("click", () => {
    const s = normalize({ short: "НОВЫЙ", title: "Новый стенд", icon: "book", custom: true }, stands.length);
    stands.push(s);
    save(); relayout();
    if (game.scene !== "corridor") go("corridor", s.x);
    else { game.x = s.x; game.autoTarget = null; }
    openEditor(s);
    toast("Стенд создан");
  });

  /* ═══ данные: выгрузка, загрузка, сброс ═══════════════════════════════ */
  btnData.addEventListener("click", () => {
    const bytes = new Blob([JSON.stringify(stands)]).size;
    const withImg = stands.filter((s) => s.image).length;
    $("dt-lead").textContent = stands.length + " стендов, из них с изображением " + withImg + ".";
    $("dt-size").textContent = "Занято примерно " + (bytes / 1024 > 900
      ? (bytes / 1048576).toFixed(1) + " МБ" : Math.round(bytes / 1024) + " КБ") + " в этом браузере.";
    openSheet(sheetData);
  });
  $("dt-x").addEventListener("click", () => closeSheet(sheetData));
  $("dt-done").addEventListener("click", () => closeSheet(sheetData));
  sheetData.addEventListener("pointerdown", (e) => { if (e.target === sheetData) closeSheet(sheetData); });

  $("dt-export").addEventListener("click", () => {
    const out = { pavilion: PID, title: SEED.title, subtitle: SEED.subtitle, exportedAt: new Date().toISOString(), stands };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "skipi-" + PID + "-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast("Файл выгружен");
  });
  const fileJson = $("file-json");
  $("dt-import").addEventListener("click", () => fileJson.click());
  fileJson.addEventListener("change", async () => {
    const f = fileJson.files && fileJson.files[0];
    fileJson.value = "";
    if (!f) return;
    try {
      const parsed = JSON.parse(await f.text());
      const list = Array.isArray(parsed) ? parsed : parsed.stands;
      if (!Array.isArray(list) || !list.length) throw new Error("пусто");
      if (!confirm("Заменить текущие " + stands.length + " стендов на " + list.length + " из файла?")) return;
      stands = list.map(normalize);
      await save(); relayout();
      closeSheet(sheetData);
      toast("Загружено стендов: " + stands.length);
    } catch (err) { toast("Не похоже на файл павильона"); }
  });
  $("dt-reset").addEventListener("click", async () => {
    if (!confirm("Вернуть исходные стенды? Всё, что вы создали в этом браузере, пропадёт.")) return;
    stands = (SEED.stands || []).map(normalize);
    await save(); relayout();
    closeSheet(sheetData);
    toast("Возвращены исходные стенды");
  });

  /* ═══ приборы ═════════════════════════════════════════════════════════ */
  const railDots = [];
  function buildRail() {
    elRail.querySelectorAll(".rail-dot,.rail-you,.rail-cap").forEach((n) => n.remove());
    railDots.length = 0;
    const mk = (cls, wx) => {
      const n = document.createElement("div");
      n.className = cls; n.dataset.wx = String(wx);
      elRail.appendChild(n); return n;
    };
    mk("rail-cap", ENTRY_X);
    stands.forEach((s) => railDots.push({ node: mk("rail-dot", s.x), stand: s }));
    mk("rail-cap", EXIT_X);
    railDots.push({ node: mk("rail-you", 0), you: true });
    placeRail();
  }
  function placeRail() {
    const w = elRail.clientWidth || 1;
    elRail.querySelectorAll("[data-wx]").forEach((n) => {
      if (n.classList.contains("rail-you")) return;
      n.style.left = (Number(n.dataset.wx) / CORRIDOR_W) * w + "px";
    });
  }
  function syncChrome() {
    const corridor = game.scene === "corridor";
    elCount.hidden = !corridor;
    elRail.hidden = !corridor;
    btnAdd.hidden = !corridor;
    btnData.hidden = !corridor;
    elWhere.innerHTML = corridor
      ? esc(SEED.title) + "<small>" + esc(SEED.subtitle || "Skipi Education") + "</small>"
      : "Вестибюль<small>Skipi Education</small>";
    if (corridor) {
      const done = stands.filter((s) => seen.has(s.id)).length;
      elCount.innerHTML = "<b>" + done + "/" + stands.length + "</b><small>стенды</small>";
      railDots.forEach((d) => { if (d.stand) d.node.classList.toggle("seen", seen.has(d.stand.id)); });
      placeRail();
    }
  }
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  /* ═══ титул ═══════════════════════════════════════════════════════════ */
  let titleShown = true;
  function startGame() {
    if (!titleShown) return;
    titleShown = false;
    $("title").classList.add("hide");
    game.fadeDir = -1;
    syncChrome();
  }
  $("start").addEventListener("click", startGame);

  /* ═══ отрисовка ═══════════════════════════════════════════════════════ */
  function glow(x, y, r, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,214,140," + a + ")");
    g.addColorStop(1, "rgba(255,214,140,0)");
    ctx.fillStyle = g; ctx.fillRect((x - r) | 0, (y - r) | 0, r * 2, r * 2);
  }
  const disc = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };

  function drawHub() {
    const cam = game.cam;
    px(0, 0, VW, VH, "#0a1824");
    px(0, 0, VW, CEIL_H, C.ceil);
    for (let x = -(cam % 64); x < VW; x += 64) px(x, 0, 2, CEIL_H, C.ceilRib);
    px(0, 10, VW, 9, "#132536");
    px(0, 10, VW, 1, "#1d3e55");
    px(0, 19, VW, 1, "#07111a");
    px(0, CEIL_H - 2, VW, 2, "#13293a");
    for (let wx = 120; wx < HUB_W; wx += 240) {
      const sx = wx - cam;
      if (sx < -40 || sx > VW + 40) continue;
      px(sx - 1, 19, 2, CEIL_H - 25, "#17303f");
      px(sx - 16, CEIL_H - 6, 32, 4, C.lampBox);
      px(sx - 13, CEIL_H - 4, 26, 2, C.lampLit);
      glow(sx, CEIL_H, 54, 0.1);
    }
    px(0, CEIL_H, VW, FLOOR_Y - CEIL_H, C.wallA);
    for (let x = -(cam % 48); x < VW; x += 48) px(x, CEIL_H, 1, FLOOR_Y - CEIL_H, C.wallSeam);
    px(0, 62, VW, 2, C.wallTrim);
    px(0, FLOOR_Y - 10, VW, 10, C.skirt);
    const sign = 60 - cam;
    if (sign > -240 && sign < VW + 60) {
      px(sign - 2, 68, 216, 44, "#0b1b27");
      px(sign, 70, 212, 40, "#102636");
      px(sign, 70, 212, 2, C.amber);
      text("SKIPI", sign + 106, 77, 13, C.paper, "center");
      text("EDUCATION", sign + 106, 93, 9, C.teal, "center");
    }
    const all = stands.length > 0 && stands.every((s) => seen.has(s.id));
    DOORS.forEach((d, i) => drawDoor(d.x - cam, d.label, d.open, i === 0 && all));
    drawFloor(cam, HUB_W);
  }

  function drawDoor(sx, label, open, done) {
    if (sx < -90 || sx > VW + 90) return;
    const w = 76, h = 112, top = FLOOR_Y - 8 - h, bot = FLOOR_Y - 8;
    const ix = sx - w / 2;
    px(ix - 4, top - 4, w + 8, h + 4, "#0b1620");
    px(ix - 2, top - 2, w + 4, h + 2, "#1d3c4c");
    if (open) {
      px(ix, top, w, h, "#15293a");
      px(ix + 6, top + 6, w - 12, h - 12, "#1d3b4d");       // дальняя переборка
      px(ix + 6, top + 6, w - 12, 3, C.lampLit);            // лампа над проёмом
      glow(sx, top + 12, 48, 0.20);
      px(ix + 17, top + 22, w - 34, h - 36, "#0d1f2b");     // уходящий вглубь коридор
      px(ix + 17, top + 22, w - 34, 2, "#2a5468");
      px(ix + 6, bot - 12, w - 12, 12, "#24404f");          // пол за дверью
      px(ix + 6, bot - 12, w - 12, 1, "#3d6b80");
      px(ix, bot - 3, w, 3, "#8a7446");                     // комингс
      ctx.fillStyle = "rgba(255,214,140,0.09)";
      ctx.fillRect((sx - 40) | 0, bot, 80, 24);             // свет на палубу
    } else {
      px(ix, top, w, h, "#102029");
      for (let y = top + 10; y < bot - 12; y += 9) px(ix + 8, y, w - 16, 3, "#15293a");
      px(ix + 8, top + 10, w - 16, 1, "#1b3647");
      px(ix, bot - 3, w, 3, "#1a2b36");
    }
    px(sx - 48, top - 22, 96, 16, "#0a1824");
    px(sx - 48, top - 22, 96, 2, open ? C.amber : "#24404f");
    text(label, sx, top - 17, 8, open ? C.paper : "#55738a", "center");
    px(sx + 41, top - 18, 4, 4, open ? "#6ee7a8" : "#6a3030");
    if (done) { px(sx - 46, top - 19, 7, 7, "#6ee7a8"); px(sx - 44, top - 16, 2, 2, "#0a1824"); }
  }

  function drawCorridor() {
    const cam = game.cam;
    px(0, 0, VW, VH, C.wallB);
    px(0, 0, VW, CEIL_H, C.ceil);
    for (let x = -(cam % 32); x < VW; x += 32) px(x, 0, 2, CEIL_H - 4, C.ceilRib);
    // воздуховод под подволоком
    px(0, 8, VW, 11, "#132536");
    px(0, 8, VW, 1, "#1d3e55");
    px(0, 18, VW, 1, "#07111a");
    for (let x = -(cam % 44); x < VW; x += 44) px(x, 8, 2, 11, "#0d1c29");
    // кабельная нитка вдоль потолка
    px(0, 23, VW, 1, "#16303f");
    px(0, CEIL_H - 3, VW, 3, "#14293a");
    for (let wx = 60; wx < CORRIDOR_W; wx += 120) {
      const sx = wx - cam;
      if (sx < -60 || sx > VW + 60) continue;
      px(sx - 1, 19, 2, CEIL_H - 26, "#17303f");          // подвес
      px(sx - 20, CEIL_H - 7, 40, 5, C.lampBox);
      px(sx - 17, CEIL_H - 5, 34, 2, C.lampLit);
      glow(sx, CEIL_H - 2, 70, 0.13);
      ctx.fillStyle = "rgba(255,214,140,0.05)";
      ctx.fillRect((sx - 30) | 0, 24, 60, 8);
    }
    px(0, CEIL_H, VW, FLOOR_Y - CEIL_H, C.wallA);
    for (let x = -(cam % 56); x < VW + 56; x += 56) {
      px(x, CEIL_H, 28, FLOOR_Y - CEIL_H, C.wallB);
      px(x, CEIL_H, 1, FLOOR_Y - CEIL_H, C.wallSeam);
    }
    px(0, 42, VW, 3, "#1d4154");
    for (let x = -(cam % 14); x < VW; x += 14) px(x, 40, 2, 2, "#2a5a70");
    px(0, 48, VW, 1, "#0e2430");
    for (let x = -(cam % 28); x < VW; x += 28) px(x, 150, 1, 1, "#2a5064");
    px(0, FLOOR_Y - 12, VW, 12, C.skirt);
    px(0, FLOOR_Y - 12, VW, 1, "#1e4458");

    for (let i = 0; i <= stands.length; i++) {
      const wx = FIRST_X - 120 + i * GAP;
      if (wx > CORRIDOR_W - 60 || wx < 40) continue;
      const sx = wx - cam;
      if (sx < -30 || sx > VW + 30) continue;
      disc(sx, 92, 13, "#0c1f29");
      disc(sx, 92, 11, "#23536a");
      disc(sx, 92, 9, "#071722");
      disc(sx - 3, 89, 3, "#0f3246");
      px(sx - 11, 91, 22, 1, "#0a2430");
    }

    drawDoorway(ENTRY_X - cam, "ВЕСТИБЮЛЬ", "#4a9fd8");
    drawDoorway(EXIT_X - cam, "ВЫХОД", C.teal);
    stands.forEach((s) => drawStand(s, s.x - cam));
    drawFloor(cam, CORRIDOR_W);
  }

  function drawDoorway(sx, label, color) {
    if (sx < -80 || sx > VW + 80) return;
    const w = 58, h = 96, top = FLOOR_Y - 8 - h;
    px(sx - w / 2 - 3, top - 3, w + 6, h + 3, C.doorFrame);
    px(sx - w / 2, top, w, h, "#0a1821");
    const g = ctx.createLinearGradient(0, top, 0, FLOOR_Y - 8);
    g.addColorStop(0, "rgba(120,190,210,0.20)");
    g.addColorStop(1, "rgba(120,190,210,0.02)");
    ctx.fillStyle = g; ctx.fillRect((sx - w / 2) | 0, top | 0, w, h - 8);
    px(sx - w / 2, top, w, 2, color);
    px(sx - 34, top - 18, 68, 14, "#0a1824");
    px(sx - 34, top - 18, 68, 2, color);
    text(label, sx, top - 13, 8, C.paper, "center");
  }

  function drawStand(s, sx) {
    if (sx < -70 || sx > VW + 70) return;
    const w = 62, h = 76, top = 56, base = top + h;        // щит: 56..132
    const foot = FLOOR_Y - 8;                              // пол у стены
    const near = game.focus && game.focus.kind === "stand" && game.focus.stand.id === s.id;

    if (near) {
      const g = ctx.createLinearGradient(0, CEIL_H, 0, foot);
      g.addColorStop(0, "rgba(255,214,140,0.16)");
      g.addColorStop(1, "rgba(255,214,140,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(sx - 10, CEIL_H); ctx.lineTo(sx + 10, CEIL_H);
      ctx.lineTo(sx + w / 2 + 8, foot); ctx.lineTo(sx - w / 2 - 8, foot);
      ctx.closePath(); ctx.fill();
    }
    // стойка и опорная плита
    px(sx - 11, foot - 4, 22, 4, "#0d1d27");
    px(sx - 9, foot - 3, 18, 2, "#17313f");
    px(sx - 4, base - 2, 8, foot - base + 2, "#0d1d27");
    px(sx - 3, base - 2, 3, foot - base + 2, "#1b394a");
    // светильник над щитом
    px(sx - 7, top - 8, 14, 4, "#1a2e3c");
    px(sx - 5, top - 5, 10, 2, near ? "#ffe3a8" : "#6b5c3a");
    px(sx - w / 2 + 3, top + 3, w, h, "rgba(0,0,0,0.30)");
    px(sx - w / 2 - 2, top - 2, w + 4, h + 4, C.standFrame);
    px(sx - w / 2, top, w, h, near ? "#eef3f7" : C.standBody);
    px(sx - w / 2, top, w, 15, s.accent);
    text(s.short, sx, top + 3, 9, "#1a1205", "center");

    const ix = sx - w / 2 + 5, iy = top + 20, iw = w - 10, ih = 40;
    const im = s.image ? getImg(s.image) : null;
    if (im) {
      const k = Math.max(iw / im.naturalWidth, ih / im.naturalHeight);
      const cw = Math.min(im.naturalWidth, iw / k), ch = Math.min(im.naturalHeight, ih / k);
      ctx.drawImage(im, (im.naturalWidth - cw) / 2, (im.naturalHeight - ch) / 2, cw, ch, ix | 0, iy | 0, iw, ih);
      px(ix, iy, iw, 1, "#8fa3b3");
      px(ix, iy + ih - 1, iw, 1, "#8fa3b3");
    } else if (s.image) {
      px(ix, iy, iw, ih, "#b9c6d1");
    } else {
      icon(s.icon, sx - 12, iy + 4, 3, C.standInk);
      for (let i = 0; i < 2; i++) px(ix + 3, top + 52 + i * 5, [40, 30][i], 2, i === 0 ? "#6d8296" : "#9fb0bf");
    }
    px(sx - w / 2, base - 12, w, 12, C.standBody2);
    px(sx - w / 2, base - 12, w, 1, "#aab9c5");
    text(String(s.index + 1).padStart(2, "0"), sx - w / 2 + 6, base - 10, 8, "#4a5c69", "left");
    if (seen.has(s.id)) {
      px(sx + w / 2 - 16, base - 10, 10, 8, "#2f8f63");
      px(sx + w / 2 - 13, base - 6, 2, 2, "#d9f5e6");
      px(sx + w / 2 - 11, base - 8, 2, 2, "#d9f5e6");
    }
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect((sx - 13) | 0, foot, 26, 3);
  }

  function drawFloor(cam, width) {
    px(0, FLOOR_Y - 8, VW, VH - FLOOR_Y + 8, C.floor);
    px(0, FLOOR_Y - 8, VW, 1, "#1d3d4e");
    px(0, FLOOR_Y + 8, VW, 14, C.floorLane);
    px(0, FLOOR_Y + 8, VW, 1, "#20394a");
    for (let x = -(cam % 40); x < VW; x += 40) px(x, FLOOR_Y - 7, 1, VH - FLOOR_Y + 7, "#0e1d26");
    px(0, VH - 6, VW, 6, C.floorEdge);
    const step = game.scene === "corridor" ? 120 : 240;
    const start = game.scene === "corridor" ? 60 : 120;
    for (let wx = start; wx < width; wx += step) {
      const sx = wx - cam;
      if (sx < -70 || sx > VW + 70) continue;
      ctx.fillStyle = "rgba(255,214,140,0.05)";
      ctx.beginPath(); ctx.ellipse(sx, FLOOR_Y + 8, 46, 11, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* ═══ человечек ═══════════════════════════════════════════════════════ */
  const P = {
    out: "#0a111a", cap: "#1d3f63", capHi: "#2c5c8c", brim: "#132b47",
    skin: "#e9b58b", skinSh: "#c98f66", shirt: "#e6eef6", shirtSh: "#b9cbdb",
    trou: "#27384d", trouSh: "#1a2636", shoe: "#0f1720"
  };
  function drawPlayer(sx, dir, phase, moving, t) {
    const sw = moving ? [[-4, 4], [0, 0], [4, -4], [0, 0]][phase] : [0, 0];
    const lift = moving ? [0, 1, 0, 1][phase] : 0;
    const bob = moving ? [0, 1, 0, 1][phase] : (Math.sin(t / 620) > 0.6 ? 1 : 0);
    const x = Math.round(sx), y = FLOOR_Y + bob;

    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.beginPath(); ctx.ellipse(x, FLOOR_Y + 1, 11, 3, 0, 0, Math.PI * 2); ctx.fill();

    [0, 1].forEach((i) => {
      const lx = x - 6 + i * 6 + sw[i] * dir;
      px(lx - 1, y - 15, 7, 13, P.out);
      px(lx, y - 14, 5, 12, i === 0 ? P.trou : P.trouSh);
      px(lx - 2, y - 3 - lift, 9, 4, P.out);
      px(lx - 1 + (dir > 0 ? 1 : 0), y - 2 - lift, 7, 2, P.shoe);
    });
    px(x - 10, y - 31, 20, 17, P.out);
    px(x - 9, y - 30, 18, 15, P.shirt);
    px(x + (dir > 0 ? 3 : -9), y - 30, 6, 15, P.shirtSh);
    px(x - 9, y - 18, 18, 3, P.trou);
    px(x - 9, y - 18, 18, 1, P.out);
    px(x + (dir > 0 ? -7 : 3), y - 28, 4, 3, C.amber);
    [0, 1].forEach((i) => {
      const off = Math.round(-sw[i] * dir * 0.7);
      const ax = i === 0 ? x - 13 : x + 9;
      px(ax, y - 29 + off, 5, 14, P.out);
      px(ax + 1, y - 28 + off, 3, 11, P.shirtSh);
      px(ax + 1, y - 17 + off, 3, 3, P.skin);
    });
    px(x - 3, y - 33, 6, 3, P.skinSh);
    px(x - 7, y - 46, 14, 14, P.out);
    px(x - 6, y - 45, 12, 12, P.skin);
    px(x + (dir > 0 ? 1 : -6), y - 45, 5, 12, P.skinSh);
    px(x + (dir > 0 ? 1 : -3), y - 41, 2, 2, "#15202c");
    px(x + (dir > 0 ? -4 : 2), y - 41, 2, 2, "#15202c");
    px(x - 4, y - 36, 8, 1, P.skinSh);
    px(x - 8, y - 52, 16, 7, P.out);
    px(x - 7, y - 51, 14, 5, P.cap);
    px(x - 7, y - 51, 14, 2, P.capHi);
    px(x - 9, y - 47, 18, 3, P.out);
    px(x + (dir > 0 ? -7 : -10), y - 46, 18, 2, P.brim);
    px(x - 2, y - 50, 4, 3, C.amber);
  }

  /* ═══ цикл ════════════════════════════════════════════════════════════ */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const locked = uiOpen() || titleShown || game.fadeDir === 1;
    let dir = 0;
    if (!locked) {
      if (held.left) dir -= 1;
      if (held.right) dir += 1;
      if (dir === 0 && game.autoTarget !== null) {
        const d = game.autoTarget - game.x;
        if (Math.abs(d) < 3) {
          game.autoTarget = null;
          if (game.autoOpen) {
            const s = stands.find((n) => n.id === game.autoOpen);
            game.autoOpen = null;
            if (s) { game.focus = { kind: "stand", stand: s, dist: 0 }; openStand(s); }
          }
        } else dir = d > 0 ? 1 : -1;
      }
    }
    game.moving = dir !== 0;
    if (dir !== 0) game.facing = dir;
    game.x = clamp(game.x + dir * SPEED * dt, 28, worldWidth() - 28);
    game.walkPhase = game.moving ? (game.walkPhase + dt * 8.5) % 4 : 0;

    const targetCam = clamp(game.x - VW / 2, 0, Math.max(0, worldWidth() - VW));
    game.cam += (targetCam - game.cam) * Math.min(1, dt * 9);
    if (Math.abs(targetCam - game.cam) < 0.4) game.cam = targetCam;
    game.focus = locked ? null : computeFocus();

    if (game.fadeDir === 1) {
      game.fade = Math.min(1, game.fade + dt * 3.4);
      if (game.fade >= 1 && game.fadeThen) { game.fadeThen(); game.fadeThen = null; game.fadeDir = -1; }
    } else if (game.fade > 0) game.fade = Math.max(0, game.fade - dt * 2.6);

    ctx.imageSmoothingEnabled = false;
    if (game.scene === "hub") drawHub(); else drawCorridor();
    drawPlayer(game.x - game.cam, game.facing, Math.floor(game.walkPhase), game.moving, now);

    const vg = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VH * 0.95);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH);
    if (game.fade > 0) { ctx.fillStyle = "rgba(4,9,14," + game.fade + ")"; ctx.fillRect(0, 0, VW, VH); }

    syncPrompt();
    requestAnimationFrame(frame);
  }

  function syncPrompt() {
    const f = game.focus;
    if (!f) elPrompt.classList.remove("on");
    else {
      let cap = "";
      if (f.kind === "stand") cap = seen.has(f.stand.id) ? "Открыть снова" : "Открыть стенд";
      else if (f.kind === "door") cap = f.door.open ? "Войти в павильон" : "Закрыто";
      else if (f.kind === "exit") cap = "Выход";
      else if (f.kind === "entry") cap = "В вестибюль";
      elPromptCap.textContent = cap;
      elPromptKey.textContent = "↑ или пробел";
      elPrompt.classList.add("on");
    }
    if (game.scene === "corridor" && !elRail.hidden) {
      const you = elRail.querySelector(".rail-you");
      if (you) you.style.left = (game.x / CORRIDOR_W) * elRail.clientWidth + "px";
    }
  }

  addEventListener("resize", () => { resize(); placeRail(); });

  /* ═══ пуск ════════════════════════════════════════════════════════════ */
  (async () => {
    const saved = await storeGet(PID);
    const list = saved && Array.isArray(saved.stands) && saved.stands.length ? saved.stands : (SEED.stands || []);
    stands = list.map(normalize);
    relayout();
    requestAnimationFrame(frame);
  })();
})();
