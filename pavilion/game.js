/* Skipi Education — интерактивное пространство.
   Статика без сборки, без сервера, без учётных записей.
   Исходные стенды лежат в content/communication.js.
   Стенды, созданные и исправленные в браузере, лежат в этом же браузере (IndexedDB). */
(() => {
  "use strict";

  /* ═══ экран ═══════════════════════════════════════════════════════════
     Кадр не фиксирован: под окно подбирается целое увеличение пикселя, а
     внутреннее разрешение берётся такое, чтобы холст занял всё окно целиком.
     Чем больше окно, тем больше коридора видно и тем мельче игровой пиксель. */
  let VW = 480, VH = 286;                 // внутреннее разрешение, считается в resize
  let FLOOR_Y = 246, CEIL_H = 48, U = 1;  // U — во сколько раз сцена крупнее исходной
  const G = {};                           // производные размеры сцены
  const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  let GAP = 317, FIRST_X = 396, ENTRY_X = 106;   // пересчитываются в resize
  let HUB_W = 1478;
  const DOOR_STEP = 300, DOOR_FIRST = 420;
  const DOORS = [];                       // заполняется из content/course.js
  const PH = 68;                          // рост человечка в игровых пикселях

  const cv = document.getElementById("screen");
  const ctx = cv.getContext("2d", { alpha: false });
  let scale = 3;

  function resize() {
    const w = Math.max(320, window.innerWidth);
    const h = Math.max(240, window.innerHeight);
    let s = Math.max(1, Math.round(h / 290));
    for (let guard = 0; guard < 16; guard++) {
      const vw = Math.floor(w / s), vh = Math.floor(h / s);
      if (s > 1 && (vw < 420 || vh < 240)) { s--; continue; }
      if (vw > 900) { s++; continue; }
      break;
    }
    scale = s;
    VW = Math.min(900, Math.floor(w / s));
    VH = Math.min(320, Math.floor(h / s), Math.round(VW * 0.68));
    cv.width = VW; cv.height = VH;
    cv.style.width = VW * s + "px";
    cv.style.height = VH * s + "px";

    FLOOR_Y = Math.round(VH * 0.861);     // линия пола, по ней идут ноги
    U = FLOOR_Y / 186;                    // исходная сцена была сделана при FLOOR_Y = 186
    const R = (v) => Math.round(v * U);
    CEIL_H = R(36);
    G.R = R;
    G.ductY = R(8); G.ductH = R(11); G.cableY = R(23);
    G.trayY = R(42); G.trayH = Math.max(2, R(3)); G.trayDotY = R(40); G.trayLineY = R(48);
    G.skirtH = R(12);
    G.floorTop = FLOOR_Y - R(8);
    G.laneY = FLOOR_Y + R(8); G.laneH = R(14);
    G.lampStep = R(120); G.hubLampStep = R(240);
    G.standFoot = FLOOR_Y - R(8);
    // низ щита всегда выше макушки, поэтому человечек не закрывает содержание
    G.standBase = FLOOR_Y - PH - R(8);
    G.standTop = Math.max(CEIL_H + R(14), G.standBase - R(76));
    G.standH = G.standBase - G.standTop;
    G.standW = Math.round(G.standH * 0.82);
    G.portY = Math.round((G.standTop + G.standBase) / 2); G.portR = R(13);
    G.doorwayW = R(58); G.doorwayH = R(96);
    G.doorW = R(76); G.doorH = R(112);
    G.reach = R(52);
    GAP = R(240); FIRST_X = R(300); ENTRY_X = R(80);
    HUB_W = R(DOOR_FIRST + Math.max(1, DOORS.length) * DOOR_STEP);
    DOORS.forEach((d) => { d.x = R(d.base); });
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
  // надпись, которая обязана влезть в отведённую ширину: шрифт ужимается сам
  function textFit(s, x, y, size, color, align, maxW) {
    let sz = Math.max(6, size);
    ctx.font = "700 " + sz + "px " + MONO;
    while (sz > 6 && ctx.measureText(s).width > maxW) {
      sz -= 1;
      ctx.font = "700 " + sz + "px " + MONO;
    }
    ctx.textAlign = align || "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = color;
    ctx.fillText(s, x | 0, y | 0);
    ctx.textAlign = "left";
  }

  // Длинное название двери режется на две строки по ближайшему к середине пробелу.
  function splitLabel(label, size, maxW) {
    ctx.font = "700 " + size + "px " + MONO;
    if (ctx.measureText(label).width <= maxW) return [label];
    const words = label.split(" ");
    if (words.length < 2) return [label];
    let best = 1, diff = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
      const d = Math.abs(ctx.measureText(a).width - ctx.measureText(b).width);
      if (d < diff) { diff = d; best = i; }
    }
    return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
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
  // Павильонов несколько. Каждый лежит в своём файле content/<id>.js и объявляет
  // window.SKIPI_PAVILION; файлы грузятся по списку дверей курса, по одному,
  // и складываются в реестр. Активный павильон выбирается входом в дверь.
  const PAVS = {};
  let SEED = { id: "course", title: "Павильон", subtitle: "", stands: [] };
  let PID = SEED.id;

  function loadScript(src) {
    return new Promise((res) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => res(true);
      s.onerror = () => res(false);
      document.head.appendChild(s);
    });
  }
  async function loadPavilions(ids) {
    for (const id of ids) {
      try { delete window.SKIPI_PAVILION; } catch (e) { window.SKIPI_PAVILION = undefined; }
      const ok = await loadScript("content/" + id + ".js");
      const p = window.SKIPI_PAVILION;
      if (ok && p && Array.isArray(p.stands)) PAVS[p.id || id] = p;
    }
  }

  // Персональная ссылка: ?g=<ключ из content/guests.js>.
  // Гость читает павильон и не видит редактора. Без параметра — автор.
  const GUESTS = window.SKIPI_GUESTS || {};
  const GUEST = (() => {
    let key = "";
    try { key = (new URLSearchParams(location.search).get("g") || "").trim().toLowerCase(); }
    catch (e) { key = ""; }
    if (!key || !Object.prototype.hasOwnProperty.call(GUESTS, key)) return null;
    const g = GUESTS[key] || {};
    return { id: key, name: g.name || key, role: g.role === "captain" ? "captain" : "cadet", note: g.note || "" };
  })();
  const SUIT = GUEST ? GUEST.role : "captain";
  let SEEN_KEY = "", SEED_FP = "";

  /* Отметка о входе слушателя. Сервера у павильона нет, поэтому страница просто
     дёргает существующий файл на машине академии с меткой в адресе — запрос
     оседает в журнале nginx. Конфиг той машины не трогается ничем. Автор
     (адрес без ?g=) не отмечается: это журнал слушателей, а не слежка. */
  const BEACON = "https://academy.capt-tymur.com/robots.txt";
  function mark(event, n) {
    if (!GUEST) return;
    try {
      const q = "?edu=" + encodeURIComponent(PID) +
        "&u=" + encodeURIComponent(GUEST.id) +
        "&e=" + encodeURIComponent(event) +
        (n == null ? "" : "&n=" + n) +
        "&t=" + Date.now();
      new Image().src = BEACON + q;
    } catch (e) { /* не вышло — не беда, это не часть прохождения */ }
  }


  let stands = [];
  let CORRIDOR_W = 900, EXIT_X = 780;
  let seen = new Set();

  const newId = () => "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  /* Отпечаток содержания из файла. Нужен, чтобы отличить «человек правил стенды
     у себя» от «автор курса выложил новое содержание». Берём то, что меняется
     при смысловой правке: состав и порядок стендов, надписи, слайды, объём текста. */
  function fingerprint(list) {
    const s = JSON.stringify((list || []).map((x) => [
      x.id, x.short, x.title, x.image,
      (x.images || []).map((i) => i.src),
      (x.body || []).length, (x.points || []).length,
      (x.downloads || []).map((d) => d.file)
    ]));
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = (((h * 33) ^ s.charCodeAt(i)) >>> 0);
    return h.toString(36) + "." + s.length.toString(36);
  }
  let lastBackupKey = null;
  const seenKeyFor = (id) => "skipi-edu/" + id + "/seen" + (GUEST ? "/" + GUEST.id : "");
  function seenSetFor(id) {
    try { return new Set(JSON.parse(localStorage.getItem(seenKeyFor(id)) || "[]")); }
    catch (e) { return new Set(); }
  }

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
      image: raw.image || null,          // dataURL либо путь к файлу
      caption: raw.caption || "",
      images: Array.isArray(raw.images)
        ? raw.images.filter((im) => im && im.src).map((im) => ({
            src: String(im.src), caption: String(im.caption || "")
          }))
        : [],
      videos: Array.isArray(raw.videos)
        ? raw.videos.filter((v) => v && v.url).map((v) => ({
            label: String(v.label || "Видео к занятию"),
            url: String(v.url)
          }))
        : [],
      downloads: Array.isArray(raw.downloads)
        ? raw.downloads.filter((d) => d && d.file).map((d) => ({
            label: String(d.label || d.file),
            file: String(d.file),
            hold: !!d.hold,
            holdWhy: d.holdWhy ? String(d.holdWhy) : ""
          }))
        : [],
      draft: !!raw.draft,
      custom: !!raw.custom
    };
  }

  function relayout() {
    stands.forEach((s, i) => { s.index = i; s.x = FIRST_X + i * GAP; });
    const last = stands.length ? stands[stands.length - 1].x : FIRST_X - GAP;
    CORRIDOR_W = Math.max(Math.round(760 * U), last + Math.round(300 * U));
    EXIT_X = CORRIDOR_W - Math.round(120 * U);
    buildRail();
    syncChrome();
  }

  async function save() {
    const plain = stands.map((s) => ({
      id: s.id, short: s.short, icon: s.icon, accent: s.accent, title: s.title, lead: s.lead,
      body: s.body, pointsTitle: s.pointsTitle, points: s.points, note: s.note,
      image: s.image, caption: s.caption, images: s.images, videos: s.videos, downloads: s.downloads,
      draft: s.draft, custom: s.custom
    }));
    await storeSet(PID, {
      version: 2, savedAt: new Date().toISOString(),
      seedFingerprint: SEED_FP, stands: plain
    });
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
  const ACADEMY = window.SKIPI_ACADEMY || {
    title: "Skipi Education", place: "",
    buildings: [{ id: "b1", label: "Учебный корпус", open: true,
      courses: [Object.assign({ id: "c1", label: (window.SKIPI_COURSE || {}).title || "Курс", open: true },
        { doors: ((window.SKIPI_COURSE || {}).doors) || [] })] }]
  };
  const BUILDINGS = ACADEMY.buildings || [];
  let building = null, course = null;      // где мы сейчас

  // Список дверей текущего уровня. Дверь знает, что за ней.
  function doorsOf(level) {
    if (level === "street") {
      return BUILDINGS.map((b) => ({ kind: "building", ref: b, label: b.label, sub: "", open: !!b.open }));
    }
    if (level === "hall") {
      return ((building && building.courses) || [])
        .map((c) => ({ kind: "course", ref: c, label: c.label, sub: c.sub || "", open: !!c.open }));
    }
    return ((course && course.doors) || [])
      .map((d) => ({ kind: "pavilion", ref: d, label: d.label, sub: "", open: !!d.open, pavilion: d.pavilion || "" }));
  }

  function setLevel(level) {
    DOORS.length = 0;
    doorsOf(level).forEach((d, i) => {
      const base = DOOR_FIRST + i * DOOR_STEP;
      DOORS.push(Object.assign(d, { base, x: Math.round(base * U), label: String(d.label || "—").toUpperCase() }));
    });
    HUB_W = Math.round((DOOR_FIRST + Math.max(1, DOORS.length) * DOOR_STEP) * U);
  }
  setLevel("street");
  const game = {
    scene: "street", x: Math.round(170 * U), facing: 1, walkPhase: 0, moving: false,
    cam: 0, fade: 1, fadeDir: -1, fadeThen: null,
    autoTarget: null, autoOpen: null, focus: null
  };
  const SPEED = 78;
  const worldWidth = () => (game.scene === "corridor" ? CORRIDOR_W : HUB_W);
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
    if (uiOpen()) {
      if (carousel && carousel.slides.length > 1 && sheetCard.classList.contains("on")) {
        if (K_LEFT.includes(e.code)) { e.preventDefault(); showSlide(carousel.i - 1); return; }
        if (K_RIGHT.includes(e.code)) { e.preventDefault(); showSlide(carousel.i + 1); return; }
      }
      if (K_ACT.includes(e.code)) { e.preventDefault(); closeTop(); }
      return;
    }
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
      const hit = stands.find((s) => Math.abs(s.x - wx) < G.standW / 2 &&
        wy > G.standTop - 6 && wy < G.standFoot);
      if (hit) { game.autoTarget = hit.x; game.autoOpen = hit.id; return; }
    }
    game.autoTarget = clamp(wx, 40, worldWidth() - 40);
  });

  /* ═══ что под рукой ═══════════════════════════════════════════════════ */
  function computeFocus() {
    let best = null;
    const reach = G.reach || 52;
    const near = (kind, x, extra) => {
      const d = Math.abs(x - game.x);
      if (d < reach && (!best || d < best.dist)) best = Object.assign({ kind, dist: d }, extra || {});
    };
    if (game.scene !== "corridor") {
      DOORS.forEach((d) => near("door", d.x, { door: d }));
      if (game.scene !== "street") near("back", Math.round(140 * U));
      return best;
    }
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
    if (f.kind === "door") { openDoor(f.door); return; }
    if (f.kind === "back") { goBack(); return; }
    if (f.kind === "entry") { goBack(); return; }
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
  function closeSheet(el) {
    el.classList.remove("on");
    if (el === sheetCard) carousel = null;   // карусель живёт только в открытой карточке
    syncChrome();
  }
  function closeTop() {
    if (sheetEd.classList.contains("on")) { commitEditor(); closeSheet(sheetEd); return; }
    if (sheetData.classList.contains("on")) { closeSheet(sheetData); return; }
    if (sheetCard.classList.contains("on")) { closeSheet(sheetCard); return; }
  }

  /* ═══ карточка стенда ═════════════════════════════════════════════════ */
  let currentStand = null;
  let carousel = null;                      // открытая карусель слайдов, если она есть

  function showSlide(n) {
    if (!carousel) return;
    const L = carousel.slides.length;
    const i = ((n % L) + L) % L;
    carousel.i = i;
    const sl = carousel.slides[i];
    carousel.img.src = sl.src;
    carousel.img.alt = sl.caption || carousel.title;
    carousel.cap.textContent = sl.caption || "";
    carousel.cap.hidden = !sl.caption;
    if (carousel.count) carousel.count.textContent = (i + 1) + " / " + L;
    if (carousel.dots) {
      [...carousel.dots.children].forEach((d, k) => d.classList.toggle("on", k === i));
    }
  }
  function openStand(s) {
    currentStand = s;
    $("card-no").textContent = "Стенд " + String(s.index + 1).padStart(2, "0") + " из " + String(stands.length).padStart(2, "0");
    $("card-no").style.color = s.accent;
    $("card-title").textContent = s.title || s.short;
    $("card-lead").textContent = s.lead || "";
    $("card-lead").hidden = !s.lead;
    const body = $("card-body");
    body.innerHTML = "";
    // Со слайдом карточка раскладывается в две колонки: слева инфографика,
    // справа текст. Без слайда — одна колонка во всю ширину.
    body.classList.toggle("two-col", !!(s.image || (s.images && s.images.length)));
    let col = body;
    carousel = null;
    const slides = (s.images && s.images.length)
      ? s.images
      : (s.image ? [{ src: s.image, caption: s.caption || "" }] : []);
    if (slides.length) {
      const fig = document.createElement("figure");
      fig.className = "col-img";
      const wrap = document.createElement("div");
      wrap.className = "car";
      const im = document.createElement("img");
      im.className = "shot";
      wrap.appendChild(im);
      fig.appendChild(wrap);
      const cap = document.createElement("figcaption");
      cap.className = "shot-cap";
      fig.appendChild(cap);

      if (slides.length > 1) {
        const count = document.createElement("div");
        count.className = "car-count";
        const dots = document.createElement("div");
        dots.className = "car-dots";
        slides.forEach((_, i) => {
          const d = document.createElement("button");
          d.className = "car-dot"; d.type = "button";
          d.addEventListener("click", () => showSlide(i));
          dots.appendChild(d);
        });
        const mk = (cls, txt, step) => {
          const b = document.createElement("button");
          b.className = "car-nav " + cls; b.type = "button"; b.textContent = txt;
          b.addEventListener("click", () => showSlide(carousel.i + step));
          return b;
        };
        wrap.appendChild(mk("prev", "◀", -1));
        wrap.appendChild(mk("next", "▶", 1));
        fig.insertBefore(count, cap.nextSibling);
        fig.appendChild(dots);
        carousel = { slides, i: 0, img: im, cap, dots, count, title: s.title || "" };
      } else {
        carousel = { slides, i: 0, img: im, cap, dots: null, count: null, title: s.title || "" };
      }
      showSlide(0);
      body.appendChild(fig);
      col = document.createElement("div");
      col.className = "col-txt";
      body.appendChild(col);
    }
    (s.body || []).forEach((p) => { const n = document.createElement("p"); n.textContent = p; col.appendChild(n); });
    if (s.points && s.points.length) {
      const h = document.createElement("div");
      h.className = "card-h"; h.style.color = s.accent; h.textContent = s.pointsTitle || "Коротко";
      col.appendChild(h);
      const ul = document.createElement("ul");
      s.points.forEach((t) => { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); });
      col.appendChild(ul);
    }
    if (!s.image && !(s.body || []).length && !(s.points || []).length) {
      const n = document.createElement("p");
      n.style.color = "#6f8aa1";
      n.textContent = "Стенд пока пустой. Нажмите «Править стенд» — и положите на него изображение или текст.";
      col.appendChild(n);
    }
    renderVideos(col, s);
    renderDownloads(col, s);
    $("card-note").textContent = s.note || "";
    $("card-note").hidden = !s.note;
    $("card-draft").hidden = !s.draft;
    const next = stands[s.index + 1];
    $("card-next").textContent = next ? "К стенду «" + next.short + "» →" : "К выходу →";
    $("card-edit").hidden = !!GUEST;            // слушателю править нечего
    sheetCard.querySelector(".card").style.borderTopColor = s.accent;
    openSheet(sheetCard);
    markSeen(s.id);
    mark("stand:" + s.id, seen.size);
    syncChrome();
  }

  // Ссылки на видео к занятию. Открываются в новой вкладке, плеер не встраиваем:
  // страница статическая, и чужой проигрыватель внутрь карточки не тянем.
  function renderVideos(body, s) {
    const list = s.videos || [];
    if (!list.length) return;
    const h = document.createElement("div");
    h.className = "dl-h"; h.style.color = s.accent; h.textContent = "Видео к занятию";
    body.appendChild(h);
    list.forEach((v) => {
      const row = document.createElement("a");
      row.className = "dl video";
      row.href = v.url;
      row.target = "_blank";
      row.rel = "noopener noreferrer";
      const k = document.createElement("span");
      k.className = "kind"; k.textContent = "ВИДЕО";
      const txt = document.createElement("span");
      txt.textContent = v.label;
      const a = document.createElement("span");
      a.className = "arrow"; a.textContent = "↗";
      row.appendChild(k); row.appendChild(txt); row.appendChild(a);
      body.appendChild(row);
    });
  }

  // Файлы на стенде. Запись с hold:true не отдаётся: файл не выложен наружу,
  // и честнее показать это строкой, чем дать ссылку в никуда.
  function renderDownloads(body, s) {
    const list = s.downloads || [];
    if (!list.length) return;
    const h = document.createElement("div");
    h.className = "dl-h"; h.style.color = s.accent; h.textContent = "Скачать";
    body.appendChild(h);
    list.forEach((d) => {
      const kind = (d.file.split(".").pop() || "файл").toUpperCase().slice(0, 5);
      const row = document.createElement(d.hold ? "div" : "a");
      row.className = "dl" + (d.hold ? " held" : "");
      if (!d.hold) {
        row.href = d.file;
        row.setAttribute("download", "");
        row.rel = "noopener";
      }
      const k = document.createElement("span");
      k.className = "kind"; k.textContent = kind;
      const txt = document.createElement("span");
      txt.textContent = d.label;
      if (d.hold) {
        const why = document.createElement("span");
        why.className = "why";
        why.textContent = d.holdWhy || "файл пока не выложен";
        txt.appendChild(why);
      }
      const a = document.createElement("span");
      a.className = "arrow"; a.textContent = d.hold ? "—" : "↓";
      row.appendChild(k); row.appendChild(txt); row.appendChild(a);
      body.appendChild(row);
    });
  }

  function openFinal() {
    currentStand = null;
    const done = stands.filter((s) => seen.has(s.id)).length;
    const all = stands.length > 0 && done === stands.length;
    mark(all ? "done" : "exit", done);
    $("card-no").textContent = "Выход";
    $("card-no").style.color = C.teal;
    $("card-title").textContent = all ? "Коридор пройден" : "Вы у выхода";
    $("card-lead").hidden = false;
    $("card-lead").textContent = "Открыто стендов: " + done + " из " + stands.length + ".";
    const body = $("card-body");
    body.innerHTML = "";
    body.classList.remove("two-col");
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
    if (!s) { goBack(); return; }
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
    game.x = clamp(stands.length ? stands[Math.min(i, stands.length - 1)].x : ENTRY_X + Math.round(40 * U), 28, CORRIDOR_W - 28);
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
  btnData.addEventListener("click", async () => {
    const backup = await storeGet(PID + "/backup");
    const btn = $("dt-restore");
    if (btn) {
      btn.hidden = !(backup && backup.stands && backup.stands.length);
      if (!btn.hidden) {
        btn.textContent = "Вернуть мой прежний набор (" + backup.stands.length + ")";
        btn.onclick = async () => {
          if (!confirm("Заменить текущие " + stands.length + " стендов на ваши прежние "
            + backup.stands.length + "?")) return;
          stands = backup.stands.map(normalize);
          await save(); relayout(); closeSheet(sheetData);
          toast("Вернул прежний набор");
        };
      }
    }
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
    btnAdd.hidden = !corridor || !!GUEST;
    btnData.hidden = !corridor || !!GUEST;
    elWhere.innerHTML =
      corridor ? esc(SEED.title) + "<small>" + esc(SEED.subtitle || "") + "</small>"
      : game.scene === "street" ? esc(ACADEMY.title || "Академия") + "<small>" + esc(ACADEMY.place || "") + "</small>"
      : game.scene === "hall" ? esc(building ? building.label : "Корпус") + "<small>" + esc(ACADEMY.title || "") + "</small>"
      : "Вестибюль<small>" + esc(course ? course.label : "") + "</small>";
    if (corridor) {
      const done = stands.filter((s) => seen.has(s.id)).length;
      elCount.innerHTML = "<b>" + done + "/" + stands.length + "</b><small>стенды</small>";
      railDots.forEach((d) => { if (d.stand) d.node.classList.toggle("seen", seen.has(d.stand.id)); });
      placeRail();
    }
  }
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  /* ═══ титул ═══════════════════════════════════════════════════════════ */
  // имя павильона берётся из файла содержания, а не зашито в разметку
  (function guestChrome() {
    if (!GUEST) return;
    const plate = $("hud-guest"), nm = $("hud-guest-name");
    if (plate && nm) {
      plate.hidden = false;
      plate.firstChild.textContent = GUEST.role === "captain" ? "Капитан" : "Слушатель";
      nm.textContent = GUEST.name;
    }
    const note = document.querySelector("#title .title-note");
    if (note) {
      note.textContent = GUEST.name + ", это ваш персональный вход. Вы на набережной академии: "
        + "идите вдоль неё и заходите в учебный корпус. Внутри двери курсов, в курсе — разделы, "
        + "в разделе коридор со стендами. Регистрации нет.";
    }
  })();

  (function nameFromContent() {
    const main = document.querySelector("#title .title-main");
    const sub = document.querySelector("#title .title-sub");
    const kick = document.querySelector("#title .title-kicker");
    const name = ACADEMY.title || "Skipi Education";
    if (kick) kick.textContent = "Skipi Education";
    if (main) main.textContent = name.toUpperCase();
    if (sub) { sub.textContent = (ACADEMY.place || "").toUpperCase(); sub.hidden = !ACADEMY.place; }
    document.title = name;
  })();
  let titleShown = true;
  function startGame() {
    if (!titleShown) return;
    titleShown = false;
    $("title").classList.add("hide");
    mark("enter", 0);
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
    const cam = game.cam, R = G.R;
    px(0, 0, VW, VH, "#0a1824");
    px(0, 0, VW, CEIL_H, C.ceil);
    for (let x = -(cam % R(64)); x < VW; x += R(64)) px(x, 0, 2, CEIL_H, C.ceilRib);
    px(0, G.ductY, VW, G.ductH, "#132536");
    px(0, G.ductY, VW, 1, "#1d3e55");
    px(0, G.ductY + G.ductH, VW, 1, "#07111a");
    px(0, CEIL_H - 2, VW, 2, "#13293a");
    for (let wx = R(120); wx < HUB_W; wx += G.hubLampStep) {
      const sx = wx - cam;
      if (sx < -70 || sx > VW + 70) continue;
      px(sx - 1, G.ductY + G.ductH, 2, CEIL_H - G.ductY - G.ductH - R(6), "#17303f");
      px(sx - R(16), CEIL_H - R(6), R(32), R(4), C.lampBox);
      px(sx - R(13), CEIL_H - R(4), R(26), Math.max(2, R(2)), C.lampLit);
      glow(sx, CEIL_H, R(54), 0.1);
    }
    px(0, CEIL_H, VW, FLOOR_Y - CEIL_H, C.wallA);
    for (let x = -(cam % R(48)); x < VW; x += R(48)) px(x, CEIL_H, 1, FLOOR_Y - CEIL_H, C.wallSeam);
    px(0, R(62), VW, 2, C.wallTrim);
    px(0, FLOOR_Y - R(10), VW, R(10), C.skirt);

    const sign = game.scene === "hall"
      ? [(ACADEMY.title || "Академия").toUpperCase(),
         (building ? building.label : "").toUpperCase()]
      : [((course && course.sub) || "Курс").toUpperCase(),
         ((course && course.label) || "").toUpperCase()];
    const sw = R(268), sh = R(46), sy = R(66), sx0 = R(50) - cam;
    if (sx0 > -sw - 40 && sx0 < VW + 60) {
      px(sx0 - 2, sy - 2, sw + 4, sh + 4, "#0b1b27");
      px(sx0, sy, sw, sh, "#102636");
      px(sx0, sy, sw, 2, C.amber);
      textFit(sign[0], sx0 + sw / 2, sy + R(8), R(9), C.teal, "center", sw - R(16));
      textFit(sign[1], sx0 + sw / 2, sy + R(23), R(13), C.paper, "center", sw - R(16));
    }
    if (game.scene !== "street") {
      drawDoorway(Math.round(140 * U) - cam,
        game.scene === "hall" ? "НА УЛИЦУ" : "В КОРПУС", "#4a9fd8");
    }
    DOORS.forEach((d) => drawDoor(d.x - cam, d.label, d.open, doorDone(d)));
    drawFloor(cam, HUB_W);
  }

  // Дверь помечается пройденной, если в её павильоне открыты все стенды.
  function doorDone(d) {
    if (d.kind !== "pavilion" || !d.pavilion) return false;
    const pav = PAVS[d.pavilion];
    const total = d.pavilion === PID ? stands.length : (pav && pav.stands ? pav.stands.length : 0);
    if (!total) return false;
    const got = d.pavilion === PID ? seen : seenSetFor(d.pavilion);
    if (d.pavilion === PID) return stands.every((s) => got.has(s.id));
    return pav.stands.every((s) => got.has(s.id));
  }

  /* ═══ улица: набережная Дона, вдоль неё корпуса ══════════════════════ */
  function drawStreet() {
    const cam = game.cam, R = G.R;

    // небо
    const sky = ctx.createLinearGradient(0, 0, 0, Math.round(FLOOR_Y * 0.52));
    sky.addColorStop(0, "#071320");
    sky.addColorStop(0.6, "#11293c");
    sky.addColorStop(1, "#27556b");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, VW, Math.round(FLOOR_Y * 0.52));

    // дальний берег
    const hz = Math.round(FLOOR_Y * 0.46);
    px(0, hz, VW, Math.round(FLOOR_Y * 0.52) - hz, "#16384c");
    for (let x = -Math.round((cam * 0.22) % R(22)); x < VW + R(22); x += R(22)) {
      const h = R(5) + (Math.abs(Math.round(x / R(22))) % 3) * R(3);
      px(x, hz - h, R(13), h + 2, "#12303f");
    }
    px(0, hz, VW, 1, "#2a6076");
    // огоньки дальнего берега
    for (let x = -Math.round((cam * 0.22) % R(40)); x < VW; x += R(40)) px(x + R(6), hz - R(3), 2, 2, "#e8c98a");

    // терраса под корпусами
    const terr = Math.round(FLOOR_Y * 0.52);
    px(0, terr, VW, FLOOR_Y - R(14) - terr, "#1a3344");
    px(0, terr, VW, 2, "#2e6076");
    for (let x = -Math.round((cam * 0.75) % R(34)); x < VW + R(34); x += R(34)) {
      px(x, terr + R(3), R(3), R(7), "#132836");
    }

    // На улице вход делается меньше интерьерной двери: иначе он занимает
    // весь фасад и дому негде показать окна.
    const keepW = G.doorW, keepH = G.doorH;
    G.doorW = R(58); G.doorH = R(76);
    DOORS.forEach((d) => {
      const sx = d.x - cam;
      if (sx > -R(230) && sx < VW + R(230)) drawFacade(sx, d);
    });

    // прогулочная полоса: светлый камень, чтобы человечек читался
    const walkTop = FLOOR_Y - R(14), walkBot = FLOOR_Y + R(5);
    px(0, walkTop, VW, walkBot - walkTop, "#33454f");
    px(0, walkTop, VW, 1, "#4a6775");
    px(0, FLOOR_Y, VW, 1, "#3d5461");
    for (let x = -(cam % R(26)); x < VW; x += R(26)) px(x, walkTop + 1, 1, walkBot - walkTop - 2, "#2a3a44");
    // фонари вдоль набережной
    for (let wx = R(200); wx < HUB_W; wx += R(260)) {
      const sx = wx - cam;
      if (sx < -R(20) || sx > VW + R(20)) continue;
      px(sx - 1, walkTop - R(46), 2, R(46), "#15303f");
      px(sx - R(5), walkTop - R(52), R(10), R(7), "#1d3f52");
      px(sx - R(3), walkTop - R(50), R(6), R(3), "#ffd98a");
      glow(sx, walkTop - R(46), R(34), 0.12);
    }

    // парапет на краю набережной
    const par = walkBot;
    px(0, par, VW, R(3), "#52707e");
    px(0, par + R(3), VW, R(7), "#22343e");
    for (let x = -(cam % R(12)); x < VW; x += R(12)) px(x, par + R(4), R(3), R(5), "#3a525f");
    px(0, par + R(10), VW, R(2), "#1a2a33");

    // вода
    const wat = par + R(12);
    px(0, wat, VW, VH - wat, "#0d2c3b");
    px(0, wat, VW, 1, "#2b6076");
    for (let i = 0; i < 5; i++) {
      const y = wat + R(3) + i * R(5);
      if (y > VH - 2) break;
      for (let x = -Math.round((cam * 0.35 + i * 17) % R(26)); x < VW; x += R(26)) {
        px(x, y, R(11), 1, i % 2 ? "#0e3042" : "#113a4c");
      }
    }
    // отражение фонарей
    for (let wx = R(200); wx < HUB_W; wx += R(260)) {
      const sx = wx - cam;
      if (sx < -R(10) || sx > VW + R(10)) continue;
      for (let i = 0; i < 4; i++) px(sx - 1, wat + R(2) + i * R(5), 2, 2, "rgba(255,217,138,0.28)");
    }
    // судно у причала
    const shipX = R(980) - cam * 0.9;
    if (shipX > -R(130) && shipX < VW + R(130)) {
      px(shipX - R(50), wat - R(14), R(100), R(14), "#0a1c26");
      px(shipX - R(46), wat - R(12), R(92), R(9), "#1d4760");
      px(shipX - R(14), wat - R(28), R(26), R(14), "#245a76");
      px(shipX - R(9), wat - R(24), R(6), R(5), "#ffd98a");
      px(shipX + R(2), wat - R(24), R(6), R(5), "#ffd98a");
      px(shipX + R(18), wat - R(40), 2, R(26), "#1a4256");
      px(shipX - R(34), wat - R(34), 2, R(20), "#1a4256");
    }

    DOORS.forEach((d) => drawDoor(d.x - cam, d.label, d.open, false, d.sub));
    G.doorW = keepW; G.doorH = keepH;
  }

  // Фасад корпуса: силуэт зависит от style, чтобы дома не были близнецами.
  function drawFacade(sx, d) {
    const R = G.R, st = (d.ref && d.ref.style) || "corpus";
    const doorTop = FLOOR_Y - R(8) - G.doorH;
    const plateTop = doorTop - R(44);              // полоса, где висит табличка
    const top = R(16);
    const w = R(226), h = doorTop - top + R(30);
    const lit = d.open;
    px(sx - w / 2 - 2, top - 2, w + 4, h + 4, "#071520");
    px(sx - w / 2, top, w, h, lit ? "#20475c" : "#172f3d");
    px(sx - w / 2, top, w, R(4), lit ? "#357a94" : "#1f3d4e");

    if (st === "arches") {
      for (let i = 0; i < 6; i++) {
        const ax = sx - w / 2 + R(18) + i * R(33);
        const ay = top + R(22), ah = h - R(34);
        px(ax, ay, R(22), ah, "#0b1f2b");
        disc(ax + R(11), ay, R(11), "#0b1f2b");
        if (lit) { px(ax + 2, ay, R(18), ah - 2, "#16394b"); disc(ax + R(11), ay, R(9), "#16394b"); }
      }
    } else if (st === "hall") {
      px(sx - w / 2 + R(10), top + R(16), w - R(20), h - R(28), "#0e2432");
      for (let i = 0; i < 9; i++) px(sx - w / 2 + R(16) + i * R(24), top + R(22), R(14), h - R(40), lit ? "#2a6075" : "#132c3a");
    } else {
      for (let r = 0; r < 8; r++) {
        const wy = top + R(14) + r * R(24);
        if (wy + R(14) > doorTop - R(4)) break;
        if (wy + R(14) > plateTop && wy < plateTop + R(34)) continue;   // не лезем под табличку
        for (let i = 0; i < 7; i++) {
          const wx = sx - w / 2 + R(16) + i * R(30);
          px(wx, wy, R(18), R(14), "#0d2230");
          px(wx + 1, wy + 1, R(16), R(12), lit && (i + r) % 3 !== 1 ? "#f0cd8a" : "#16384a");
        }
      }
    }
    // карниз и крыша
    px(sx - w / 2 - R(4), top - R(6), w + R(8), R(6), "#0a1b26");
    px(sx - w / 2 - R(4), top - R(6), w + R(8), 2, "#2d5e74");
  }

  function drawDoor(sx, label, open, done, sub) {
    const R = G.R, w = G.doorW, h = G.doorH;
    if (sx < -w - 40 || sx > VW + w + 40) return;
    const top = FLOOR_Y - R(8) - h, bot = FLOOR_Y - R(8), ix = sx - w / 2;
    px(ix - R(4), top - R(4), w + R(8), h + R(4), "#0b1620");
    px(ix - 2, top - 2, w + 4, h + 2, "#1d3c4c");
    if (open) {
      px(ix, top, w, h, "#15293a");
      px(ix + R(6), top + R(6), w - R(12), h - R(12), "#1d3b4d");
      px(ix + R(6), top + R(6), w - R(12), R(3), C.lampLit);
      glow(sx, top + R(12), R(48), 0.20);
      px(ix + R(17), top + R(22), w - R(34), h - R(36), "#0d1f2b");
      px(ix + R(17), top + R(22), w - R(34), 2, "#2a5468");
      px(ix + R(6), bot - R(12), w - R(12), R(12), "#24404f");
      px(ix + R(6), bot - R(12), w - R(12), 1, "#3d6b80");
      px(ix, bot - R(3), w, R(3), "#8a7446");
      ctx.fillStyle = "rgba(255,214,140,0.09)";
      ctx.fillRect((sx - R(40)) | 0, bot, R(80), R(24));
    } else {
      px(ix, top, w, h, "#102029");
      for (let y = top + R(10); y < bot - R(12); y += R(9)) px(ix + R(8), y, w - R(16), Math.max(2, R(3)), "#15293a");
      px(ix + R(8), top + R(10), w - R(16), 1, "#1b3647");
      px(ix, bot - R(3), w, R(3), "#1a2b36");
    }
    const pw = R(136), maxW = pw - R(24);
    const lines = splitLabel(label, R(8), maxW);
    const ph = R(7) + lines.length * R(11), py = top - ph - R(7);
    px(sx - pw / 2, py, pw, ph, "#0a1824");
    px(sx - pw / 2, py, pw, 2, open ? C.amber : "#24404f");
    lines.forEach((ln, i) => {
      textFit(ln, sx, py + R(4) + i * R(11), R(8), open ? C.paper : "#55738a", "center", maxW);
    });
    if (sub) textFit(String(sub).toUpperCase(), sx, py + ph + R(3), R(7), "#6f8aa1", "center", pw);
    px(sx + pw / 2 - R(7), py + R(4), R(4), R(4), open ? "#6ee7a8" : "#6a3030");
    if (done) {
      px(sx - pw / 2 + R(2), py + R(3), R(7), R(7), "#6ee7a8");
      px(sx - pw / 2 + R(4), py + R(6), R(2), R(2), "#0a1824");
    }
  }

  function drawCorridor() {
    const cam = game.cam, R = G.R;
    px(0, 0, VW, VH, C.wallB);
    px(0, 0, VW, CEIL_H, C.ceil);
    for (let x = -(cam % R(32)); x < VW; x += R(32)) px(x, 0, 2, CEIL_H - R(4), C.ceilRib);
    px(0, G.ductY, VW, G.ductH, "#132536");
    px(0, G.ductY, VW, 1, "#1d3e55");
    px(0, G.ductY + G.ductH, VW, 1, "#07111a");
    for (let x = -(cam % R(44)); x < VW; x += R(44)) px(x, G.ductY, 2, G.ductH, "#0d1c29");
    px(0, G.cableY, VW, 1, "#16303f");
    px(0, CEIL_H - R(3), VW, R(3), "#14293a");
    for (let wx = R(60); wx < CORRIDOR_W; wx += G.lampStep) {
      const sx = wx - cam;
      if (sx < -70 || sx > VW + 70) continue;
      px(sx - 1, G.ductY + G.ductH, 2, CEIL_H - G.ductY - G.ductH - R(7), "#17303f");
      px(sx - R(20), CEIL_H - R(7), R(40), R(5), C.lampBox);
      px(sx - R(17), CEIL_H - R(5), R(34), Math.max(2, R(2)), C.lampLit);
      glow(sx, CEIL_H - 2, R(70), 0.13);
      ctx.fillStyle = "rgba(255,214,140,0.05)";
      ctx.fillRect((sx - R(30)) | 0, G.cableY + 1, R(60), R(8));
    }
    px(0, CEIL_H, VW, FLOOR_Y - CEIL_H, C.wallA);
    for (let x = -(cam % R(56)); x < VW + R(56); x += R(56)) {
      px(x, CEIL_H, R(28), FLOOR_Y - CEIL_H, C.wallB);
      px(x, CEIL_H, 1, FLOOR_Y - CEIL_H, C.wallSeam);
    }
    px(0, G.trayY, VW, G.trayH, "#1d4154");
    for (let x = -(cam % R(14)); x < VW; x += R(14)) px(x, G.trayDotY, 2, 2, "#2a5a70");
    px(0, G.trayLineY, VW, 1, "#0e2430");
    px(0, FLOOR_Y - G.skirtH, VW, G.skirtH, C.skirt);
    px(0, FLOOR_Y - G.skirtH, VW, 1, "#1e4458");

    for (let i = 0; i <= stands.length; i++) {
      const wx = FIRST_X - Math.round(GAP / 2) + i * GAP;
      if (wx < R(40) || wx > CORRIDOR_W - R(60)) continue;
      const sx = wx - cam;
      if (sx < -G.portR - 10 || sx > VW + G.portR + 10) continue;
      disc(sx, G.portY, G.portR, "#0c1f29");
      disc(sx, G.portY, G.portR - 2, "#23536a");
      disc(sx, G.portY, G.portR - 4, "#071722");
      disc(sx - R(3), G.portY - R(3), Math.max(2, R(3)), "#0f3246");
      px(sx - G.portR + 2, G.portY - 1, G.portR * 2 - 4, 1, "#0a2430");
    }

    drawDoorway(ENTRY_X - cam, "ВЕСТИБЮЛЬ", "#4a9fd8");
    drawDoorway(EXIT_X - cam, "ВЫХОД", C.teal);
    stands.forEach((s) => drawStand(s, s.x - cam));
    drawFloor(cam, CORRIDOR_W);
  }

  function drawDoorway(sx, label, color) {
    const R = G.R, w = G.doorwayW, h = G.doorwayH;
    if (sx < -w - 40 || sx > VW + w + 40) return;
    const top = FLOOR_Y - R(8) - h, ix = sx - w / 2;
    px(ix - R(3), top - R(3), w + R(6), h + R(3), "#0b1620");
    px(ix, top, w, h, "#0a1821");
    const g = ctx.createLinearGradient(0, top, 0, FLOOR_Y - R(8));
    g.addColorStop(0, "rgba(120,190,210,0.20)");
    g.addColorStop(1, "rgba(120,190,210,0.02)");
    ctx.fillStyle = g; ctx.fillRect(ix | 0, top | 0, w, h - R(8));
    px(ix, top, w, 2, color);
    const pw = R(68), ph = R(14), py = top - R(18);
    px(sx - pw / 2, py, pw, ph, "#0a1824");
    px(sx - pw / 2, py, pw, 2, color);
    textFit(label, sx, py + R(4), R(8), C.paper, "center", pw - R(10));
  }

  function drawStand(s, sx) {
    const R = G.R, w = G.standW, h = G.standH;
    if (sx < -w - 20 || sx > VW + w + 20) return;
    const top = G.standTop, base = G.standBase, foot = G.standFoot;
    const near = game.focus && game.focus.kind === "stand" && game.focus.stand.id === s.id;

    if (near) {
      const g = ctx.createLinearGradient(0, CEIL_H, 0, foot);
      g.addColorStop(0, "rgba(255,214,140,0.16)");
      g.addColorStop(1, "rgba(255,214,140,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(sx - R(10), CEIL_H); ctx.lineTo(sx + R(10), CEIL_H);
      ctx.lineTo(sx + w / 2 + R(8), foot); ctx.lineTo(sx - w / 2 - R(8), foot);
      ctx.closePath(); ctx.fill();
    }
    // опорная плита и стойка
    px(sx - R(14), foot - R(4), R(28), R(4), "#0d1d27");
    px(sx - R(12), foot - R(3), R(24), 2, "#17313f");
    px(sx - R(5), base - 2, R(10), foot - base + 2, "#0d1d27");
    px(sx - R(4), base - 2, R(4), foot - base + 2, "#1b394a");
    // светильник над щитом
    px(sx - R(8), top - R(9), R(16), R(5), "#1a2e3c");
    px(sx - R(6), top - R(5), R(12), Math.max(2, R(2)), near ? "#ffe3a8" : "#6b5c3a");
    // щит
    px(sx - w / 2 + R(3), top + R(3), w, h, "rgba(0,0,0,0.30)");
    px(sx - w / 2 - 2, top - 2, w + 4, h + 4, C.standFrame);
    px(sx - w / 2, top, w, h, near ? "#eef3f7" : C.standBody);
    const headH = R(15);
    px(sx - w / 2, top, w, headH, s.accent);
    textFit(s.short, sx, top + R(3), R(9), "#1a1205", "center", w - R(8));

    const pad = R(5), ix = sx - w / 2 + pad, iw = w - pad * 2;
    const iy = top + headH + R(5), ih = h - headH - R(22);
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
      const lines = R(16);                                  // место под две строки внизу
      const m = Math.max(2, Math.floor((ih - lines) / 8));   // пиктограмма влезает над ними
      icon(s.icon, sx - m * 4, iy + Math.round((ih - lines - m * 8) / 2), m, C.standInk);
      for (let i = 0; i < 2; i++) {
        px(ix + R(3), iy + ih - lines + R(4) + i * R(6), [R(40), R(30)][i],
           Math.max(2, R(2)), i === 0 ? "#6d8296" : "#9fb0bf");
      }
    }
    const plate = R(12);
    px(sx - w / 2, base - plate, w, plate, C.standBody2);
    px(sx - w / 2, base - plate, w, 1, "#aab9c5");
    text(String(s.index + 1).padStart(2, "0"), sx - w / 2 + R(6), base - plate + R(2), R(8), "#4a5c69", "left");
    if (s.videos && s.videos.length) {             // на стенде есть видео
      const vx = sx + w / 2 - R(44), vy = base - plate + R(2);
      px(vx, vy, R(9), R(8), "#8a3b2a");
      px(vx + R(3), vy + R(2), R(3), R(4), "#f3d9d2");
    }
    if (s.downloads && s.downloads.length) {       // на стенде есть файл
      const mx = sx + w / 2 - R(30), my = base - plate + R(2);
      px(mx, my, R(9), R(8), "#3a5a70");
      px(mx + R(4), my + R(1), 1, R(4), "#dbe7ef");
      px(mx + R(2), my + R(4), R(5), 1, "#dbe7ef");
    }
    if (seen.has(s.id)) {
      px(sx + w / 2 - R(16), base - plate + R(2), R(10), R(8), "#2f8f63");
      px(sx + w / 2 - R(13), base - plate + R(6), R(2), R(2), "#d9f5e6");
      px(sx + w / 2 - R(11), base - plate + R(4), R(2), R(2), "#d9f5e6");
    }
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect((sx - R(15)) | 0, foot, R(30), R(3));
  }

  function drawFloor(cam, width) {
    const R = G.R;
    px(0, G.floorTop, VW, VH - G.floorTop, C.floor);
    px(0, G.floorTop, VW, 1, "#1d3d4e");
    px(0, G.laneY, VW, G.laneH, C.floorLane);
    px(0, G.laneY, VW, 1, "#20394a");
    for (let x = -(cam % R(40)); x < VW; x += R(40)) px(x, G.floorTop + 1, 1, VH - G.floorTop - 1, "#0e1d26");
    px(0, VH - R(6), VW, R(6), C.floorEdge);
    const step = game.scene === "corridor" ? G.lampStep : G.hubLampStep;
    const start = game.scene === "corridor" ? R(60) : R(120);
    for (let wx = start; wx < width; wx += step) {
      const sx = wx - cam;
      if (sx < -R(80) || sx > VW + R(80)) continue;
      ctx.fillStyle = "rgba(255,214,140,0.05)";
      ctx.beginPath(); ctx.ellipse(sx, G.laneY, R(46), R(11), 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* ═══ человечек ═══════════════════════════════════════════════════════
     Два вида: капитан (чёрный китель, погоны, четыре нашивки) и слушатель
     (синий китель, одна нашивка, без погон). Кто именно — решает ссылка. */
  const SUITS = {
    captain: {
      jkt: "#1b2130", jktS: "#11161f", rim: "#38465e", tie: "#0a0d12",
      hair: "#2b2119", trou: "#161b25", trouS: "#0e121a",
      stripes: 4, boards: true
    },
    cadet: {
      jkt: "#23344d", jktS: "#182538", rim: "#46618a", tie: "#132235",
      hair: "#59402a", trou: "#1c2a3d", trouS: "#131d2b",
      stripes: 1, boards: false
    }
  };
  const P = {
    out: "#05070a", gold: "#e3b457", gold2: "#a9823a", shirt: "#eef3f8",
    skin: "#e3ab80", skinS: "#bd8657", shoe: "#090b0f"
  };

  function drawPlayer(sx, dir, phase, moving, t) {
    const S = SUITS[SUIT] || SUITS.captain;
    const sw = moving ? [[-5, 5], [0, 0], [5, -5], [0, 0]][phase] : [0, 0];
    const lift = moving ? [0, 1, 0, 1][phase] : 0;
    const bob = moving ? [0, 1, 0, 1][phase] : (Math.sin(t / 640) > 0.6 ? 1 : 0);
    const x = Math.round(sx), B = FLOOR_Y + bob, f = dir > 0;
    const Y = (up) => B - up;              // высота над палубой

    ctx.fillStyle = "rgba(0,0,0,0.40)";
    ctx.beginPath(); ctx.ellipse(x, FLOOR_Y + 1, 15, 4, 0, 0, Math.PI * 2); ctx.fill();

    // ноги и ботинки
    [0, 1].forEach((i) => {
      const lx = x + (i === 0 ? -11 : 2) + sw[i] * dir;
      px(lx - 1, Y(25), 11, 21, P.out);
      px(lx, Y(24), 9, 19, i === 0 ? S.trou : S.trouS);
      const sh = lx - 2 + (f ? 2 : -2);
      px(sh, Y(6) - lift, 13, 6, P.out);
      px(sh + 1, Y(5) - lift, 11, 4, P.shoe);
    });

    // китель
    px(x - 15, Y(47), 30, 28, P.out);
    px(x - 14, Y(46), 28, 26, S.jkt);
    px(x + (f ? 5 : -14), Y(46), 9, 26, S.jktS);
    px(x + (f ? -14 : 13), Y(45), 1, 24, S.rim);          // блик от светильника
    px(x - 14, Y(21), 28, 2, P.out);                       // низ кителя
    // сорочка, лацканы, галстук
    px(x - 6, Y(47), 12, 9, P.shirt);
    px(x - 11, Y(47), 6, 10, S.jkt);
    px(x + 5, Y(47), 6, 10, S.jkt);
    px(x - 11, Y(47), 1, 10, P.out);
    px(x + 10, Y(47), 1, 10, P.out);
    px(x - 2, Y(45), 4, 9, S.tie);
    // пуговицы в два ряда
    [40, 34, 28].forEach((up) => {
      if (S.boards) { px(x - 8, Y(up), 2, 2, P.gold); px(x + 6, Y(up), 2, 2, P.gold); }
      else px(x - 1, Y(up), 2, 2, P.gold2);
    });
    // погоны — только у капитана
    if (S.boards) {
      px(x - 15, Y(47), 7, 3, P.gold2); px(x + 8, Y(47), 7, 3, P.gold2);
      px(x - 15, Y(47), 7, 1, P.gold);   px(x + 8, Y(47), 7, 1, P.gold);
    }

    // руки, на обшлагах четыре нашивки
    [0, 1].forEach((i) => {
      const off = Math.round(-sw[i] * dir * 0.6);
      const ax = i === 0 ? x - 21 : x + 13;
      px(ax, Y(45) + off, 8, 24, P.out);
      px(ax + 1, Y(44) + off, 6, 22, i === 0 ? S.jkt : S.jktS);
      for (let k = 0; k < S.stripes; k++) px(ax + 1, Y(31 - k * 3) + off, 6, 2, P.gold);
      px(ax + 1, Y(22) + off, 6, 4, P.skin);
    });

    // шея и голова
    px(x - 5, Y(52), 10, 7, P.skinS);
    px(x - 9, Y(63), 18, 18, P.out);
    px(x - 8, Y(62), 16, 16, P.skin);
    px(x + (f ? 2 : -8), Y(62), 6, 16, P.skinS);
    px(x + (f ? 1 : -3), Y(56), 2, 2, "#141a22");
    px(x + (f ? -4 : 2), Y(56), 2, 2, "#141a22");
    px(x - 5, Y(59), 10, 1, S.hair);
    px(x - 2, Y(51), 4, 1, P.skinS);
    // волосы, фуражки нет
    px(x - 9, Y(68), 18, 6, S.hair);
    px(x - 10, Y(64), 2, 5, S.hair);
    px(x + 8, Y(64), 2, 5, S.hair);
    px(x + (f ? -9 : 3), Y(63), 6, 2, S.hair);
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
    if (game.scene === "street") drawStreet();
    else if (game.scene === "corridor") drawCorridor();
    else drawHub();
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
      else if (f.kind === "door") {
        cap = !f.door.open ? "Закрыто"
          : f.door.kind === "building" ? "Войти в корпус"
          : f.door.kind === "course" ? "Войти на курс"
          : "Войти в раздел";
      }
      else if (f.kind === "back") cap = game.scene === "hall" ? "На улицу" : "В корпус";
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

  addEventListener("resize", () => {
    const frac = game.x / Math.max(1, worldWidth());
    resize();
    relayout();
    const ww = worldWidth();
    game.x = clamp(frac * ww, 28, ww - 28);
    game.cam = clamp(game.x - VW / 2, 0, Math.max(0, ww - VW));
    placeRail();
  });

  /* ═══ пуск ════════════════════════════════════════════════════════════ */
  function closedWord(kind) {
    return kind === "building" ? "Этот корпус ещё закрыт"
      : kind === "course" ? "Этот курс ещё закрыт" : "Этот раздел ещё закрыт";
  }

  function openDoor(d) {
    if (!d.open) { toast(closedWord(d.kind)); return; }
    if (d.kind === "building") {
      building = d.ref;
      setLevel("hall");
      go("hall", Math.round(240 * U));
      return;
    }
    if (d.kind === "course") {
      course = d.ref;
      setLevel("hub");
      go("hub", Math.round(240 * U));
      return;
    }
    enterPavilion(d.pavilion).then(() => go("corridor", ENTRY_X + Math.round(40 * U)));
  }

  // Назад на уровень выше, к той двери, из которой вышли.
  function goBack() {
    if (game.scene === "corridor") {
      setLevel("hub");
      const d = DOORS.find((n) => n.pavilion === PID);
      go("hub", d ? d.x : Math.round(240 * U));
      return;
    }
    if (game.scene === "hub") {
      setLevel("hall");
      const d = DOORS.find((n) => n.ref === course);
      course = null;
      go("hall", d ? d.x : Math.round(240 * U));
      return;
    }
    if (game.scene === "hall") {
      setLevel("street");
      const d = DOORS.find((n) => n.ref === building);
      building = null;
      go("street", d ? d.x : Math.round(240 * U));
    }
  }

  async function enterPavilion(id) {
    SEED = PAVS[id] || { id, title: id, subtitle: "", stands: [] };
    PID = SEED.id || id;
    SEED_FP = fingerprint(SEED.stands);
    SEEN_KEY = seenKeyFor(PID);
    seen = seenSetFor(PID);
    const saved = await storeGet(PID);
    const hasLocal = saved && Array.isArray(saved.stands) && saved.stands.length;
    let list = SEED.stands || [];
    let replaced = false;

    if (hasLocal) {
      if (saved.seedFingerprint === SEED_FP) {
        list = saved.stands;                       // файл не менялся — работаем с местным набором
      } else {
        // Автор курса выложил другое содержание. Местный набор не теряем,
        // но на экране должно быть опубликованное, иначе человек смотрит старое.
        lastBackupKey = PID + "/backup";
        await storeSet(lastBackupKey, {
          backedUpAt: new Date().toISOString(),
          seedFingerprint: saved.seedFingerprint || "",
          stands: saved.stands
        });
        replaced = true;
      }
    }
    stands = list.map(normalize);
    await save();
    relayout();
    if (replaced) {
      setTimeout(() => toast("Содержание обновлено автором курса. Ваш прежний набор сохранён в резерве"), 900);
    }
  }

  /* ═══ пуск ════════════════════════════════════════════════════════════ */
  (async () => {
    const ids = [];
    BUILDINGS.forEach((b) => (b.courses || []).forEach((c) => (c.doors || []).forEach((d) => {
      if (d.pavilion && ids.indexOf(d.pavilion) < 0) ids.push(d.pavilion);
    })));
    await loadPavilions(ids);
    // раздел без загруженного содержания закрываем: пустой коридор хуже честной двери
    BUILDINGS.forEach((b) => (b.courses || []).forEach((c) => (c.doors || []).forEach((d) => {
      if (d.pavilion && !PAVS[d.pavilion]) d.open = false;
    })));
    setLevel("street");
    syncChrome();
    requestAnimationFrame(frame);
  })();
})();
