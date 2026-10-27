/* ──────────────────────────────────────────────────────────────────────────
   ОБЩАЯ МОДЕЛЬ ПАВИЛЬОНА И МАСТЕРСКОЙ

   Одна правда для двух страниц: павильон (index.html, game.js) показывает
   содержание слушателю, мастерская (studio.html, studio.js) даёт методисту
   дерево, создание разделов и стендов и связи между ними. Обе читают и пишут
   одни и те же записи в одном браузере (IndexedDB «skipi-education»):

     <раздел>     набор стендов раздела: {version, savedAt, seedFingerprint,
                  stands, title, subtitle}. Если раздела нет в файлах
                  content/, он существует только здесь.
     __academy    структура: корпуса → курсы → разделы, заданная методистом
                  в браузере поверх content/academy.js.
     __links      связи между стендами и разделами, поверх content/links.js.
     __trash      удалённые в мастерской стенды, чтобы можно было вернуть.

   Отпечаток содержания (fingerprint) обязан считаться одинаково в обеих
   страницах — иначе павильон сочтёт набор методиста устаревшим и спрячет его.
   Поэтому функция одна, здесь.
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";
  const DB_NAME = "skipi-education", STORE = "pavilions";
  const KEY_ACADEMY = "__academy", KEY_LINKS = "__links", KEY_TRASH = "__trash";
  // Файлы и артефакты, загруженные преподавателем: ключ "file:<id>" → {name,type,size,blob}.
  // Лежат отдельно от стендов, чтобы набор раздела оставался лёгким.
  const FILE_PREFIX = "file:";

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
      catch (e2) { return false; }
    }
  }
  async function storeDel(key) {
    try {
      const d = await db();
      return await new Promise((res, rej) => {
        const t = d.transaction(STORE, "readwrite").objectStore(STORE).delete(key);
        t.onsuccess = () => res(true); t.onerror = () => rej(t.error);
      });
    } catch (e) {
      try { localStorage.removeItem(DB_NAME + "/" + key); return true; } catch (e2) { return false; }
    }
  }
  async function storeKeys() {
    try {
      const d = await db();
      return await new Promise((res, rej) => {
        const t = d.transaction(STORE, "readonly").objectStore(STORE).getAllKeys();
        t.onsuccess = () => res((t.result || []).map(String)); t.onerror = () => rej(t.error);
      });
    } catch (e) {
      const out = [];
      try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf(DB_NAME + "/") === 0) out.push(k.slice(DB_NAME.length + 1)); } } catch (e2) { /* пусто */ }
      return out;
    }
  }

  /* ─── файлы и артефакты ────────────────────────────────────────────────
     Хранятся как Blob: это дешевле строки и переживает перезагрузку. Пока файл
     не опубликован, он есть только в браузере того, кто его загрузил. */
  async function putFile(file) {
    const id = newId("f");
    const rec = { id, name: String(file.name || "файл"), type: String(file.type || "application/octet-stream"),
      size: file.size, addedAt: new Date().toISOString(), blob: file };
    const ok = await storeSet(FILE_PREFIX + id, rec);
    return ok ? { id, name: rec.name, type: rec.type, size: rec.size } : null;
  }
  const getFile = (id) => storeGet(FILE_PREFIX + id);
  const delFile = (id) => storeDel(FILE_PREFIX + id);
  async function listFiles() {
    const keys = (await storeKeys()).filter((k) => k.indexOf(FILE_PREFIX) === 0);
    const out = [];
    for (const k of keys) { const r = await getFile(k.slice(FILE_PREFIX.length)); if (r) out.push(r); }
    return out;
  }
  function blobToBase64(blob) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => { const s = String(fr.result); res(s.slice(s.indexOf(",") + 1)); };
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(blob);
    });
  }
  const niceSize = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + " МБ"
    : n >= 1024 ? Math.round(n / 1024) + " КБ" : n + " б";

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

  const ACCENTS = ["#f0a830", "#2aa0a0", "#e0674a", "#7fb069", "#8e86d8", "#4a9fd8", "#d8894a"];
  // Пиктограммы стендов: 8×8, # — закрашенный пиксель. Рисует их движок павильона и мастерская.
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
  const newId = (p) => (p || "s") + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  function normalizeStand(raw, i) {
    raw = raw || {};
    return {
      id: raw.id || newId("s"),
      short: String(raw.short || "СТЕНД").trim() || "СТЕНД",
      icon: ICON_NAMES.indexOf(raw.icon) >= 0 ? raw.icon : "book",
      accent: raw.accent || ACCENTS[(i || 0) % ACCENTS.length],
      title: raw.title || "",
      lead: raw.lead || "",
      body: Array.isArray(raw.body) ? raw.body.slice() : (raw.body ? [String(raw.body)] : []),
      pointsTitle: raw.pointsTitle || "",
      points: Array.isArray(raw.points) ? raw.points.slice() : [],
      note: raw.note || "",
      image: raw.image || null,
      caption: raw.caption || "",
      images: Array.isArray(raw.images)
        ? raw.images.filter((im) => im && im.src).map((im) => ({ src: String(im.src), caption: String(im.caption || "") }))
        : [],
      videos: Array.isArray(raw.videos)
        ? raw.videos.filter((v) => v && v.url).map((v) => ({ label: String(v.label || "Видео к занятию"), url: String(v.url) }))
        : [],
      // file — путь к опубликованному файлу; fileId — файл, загруженный в этот
      // браузер и ещё не уехавший в публикацию. Запись живёт при любом из двух.
      downloads: Array.isArray(raw.downloads)
        ? raw.downloads.filter((d) => d && (d.file || d.fileId)).map((d) => ({
            label: String(d.label || d.name || d.file || "Файл"),
            file: d.file ? String(d.file) : "",
            fileId: d.fileId ? String(d.fileId) : "",
            name: d.name ? String(d.name) : "",
            size: Number(d.size) || 0,
            type: d.type ? String(d.type) : "",
            hold: !!d.hold, holdWhy: d.holdWhy ? String(d.holdWhy) : ""
          }))
        : [],
      draft: !!raw.draft,
      custom: !!raw.custom
    };
  }
  // То, что уходит в хранилище и в файл: без координат и прочих полей движка.
  function plainStand(s) {
    return {
      id: s.id, short: s.short, icon: s.icon, accent: s.accent, title: s.title, lead: s.lead,
      body: s.body, pointsTitle: s.pointsTitle, points: s.points, note: s.note,
      image: s.image, caption: s.caption, images: s.images, videos: s.videos, downloads: s.downloads,
      draft: s.draft, custom: s.custom
    };
  }

  /* ─── структура: корпуса → курсы → разделы ───────────────────────────── */
  function cloneStructure(buildings) {
    return (buildings || []).map((b) => ({
      id: b.id || newId("b"), label: b.label || "Корпус", address: b.address || "", style: b.style || "corpus", open: !!b.open,
      courses: (b.courses || []).map((c) => ({
        id: c.id || newId("c"), label: c.label || "Курс", sub: c.sub || "Курс", open: !!c.open,
        doors: (c.doors || []).map((d) => ({
          label: d.label || "Раздел", open: !!d.open, pavilion: d.pavilion || ""
        }))
      }))
    }));
  }
  /* Структура из файла могла пополниться после того, как методист сохранил свою.
     Всё, чего нет у методиста (по id корпуса и курса, по id раздела), добавляем;
     ничего из его правок не трогаем. Возвращает {buildings, added}. */
  function mergeStructure(fileBuildings, savedBuildings) {
    const out = cloneStructure(savedBuildings);
    let added = 0;
    for (const fb of cloneStructure(fileBuildings)) {
      let b = out.find((x) => x.id === fb.id);
      if (!b) { out.push(fb); added += 1 + fb.courses.length; continue; }
      for (const fc of fb.courses) {
        let c = b.courses.find((x) => x.id === fc.id);
        if (!c) { b.courses.push(fc); added++; continue; }
        for (const fd of fc.doors) {
          const existing = c.doors.find((x) => fd.pavilion ? x.pavilion === fd.pavilion || (!x.pavilion && x.label === fd.label) : x.label === fd.label);
          if (!existing) { c.doors.push(fd); added++; }
          else if (!existing.pavilion && fd.pavilion) { existing.pavilion = fd.pavilion; added++; }
        }
      }
    }
    return { buildings: out, added };
  }

  // Персональные настройки слушателя сохраняются при выгрузке и в старых браузерах.
  function normalizeGuest(raw, fallback) {
    const g = Object.assign({}, fallback || {}, raw || {});
    const access = {};
    for (const [key, value] of Object.entries(g.access || {})) {
      if (/^(building|course|section):/.test(key) && typeof value === "boolean") access[key] = value;
    }
    return {
      name: String(g.name || "Слушатель"), role: g.role === "captain" ? "captain" : "cadet",
      note: String(g.note || ""), active: g.active !== false, access,
      ...(Number.isInteger(g.stripes) && g.stripes >= 1 && g.stripes <= 4 ? { stripes: g.stripes } : {})
    };
  }
  function guestBuildings(buildings, guest) {
    const out = cloneStructure(buildings);
    if (!guest) return out;
    const g = normalizeGuest(guest), a = g.access;
    const allowed = (key, value) => Object.hasOwn(a, key) ? a[key] : value;
    for (const b of out) {
      const bk = "building:" + b.id;
      for (const c of b.courses) {
        const ck = "course:" + b.id + "/" + c.id;
        for (const d of c.doors) {
          const dk = "section:" + d.pavilion;
          d.open = allowed(dk, d.open);
          if (a[dk] === true && a[ck] !== false) c.open = true;
        }
        c.open = allowed(ck, c.open);
        if ((a[ck] === true || c.doors.some((d) => a["section:" + d.pavilion] === true)) && c.open && a[bk] !== false) b.open = true;
      }
      b.open = g.active && allowed(bk, b.open);
      for (const c of b.courses) {
        c.open = b.open && c.open;
        for (const d of c.doors) d.open = c.open && d.open;
      }
    }
    return out;
  }

  /* ─── связи ──────────────────────────────────────────────────────────── */
  const LINK_KINDS = {
    branch: { label: "ответвление", hint: "боковой путь: от этого стенда уходит ветка туда", color: "#f0a830" },
    see:    { label: "см. также",   hint: "отсылка: смотри и этот материал",                  color: "#2aa0a0" },
    before: { label: "сначала",     hint: "нужно знать до этого стенда",                      color: "#e0674a" }
  };
  // Адрес узла: раздел и, если это стенд, его id внутри раздела.
  const nodeKey = (n) => (n && n.sec ? n.sec + (n.stand ? "/" + n.stand : "") : "");
  function normalizeLink(raw) {
    if (!raw || !raw.from || !raw.to) return null;
    const from = { sec: String(raw.from.sec || ""), stand: raw.from.stand ? String(raw.from.stand) : "" };
    const to = { sec: String(raw.to.sec || ""), stand: raw.to.stand ? String(raw.to.stand) : "" };
    if (!from.sec || !to.sec) return null;
    return {
      id: raw.id || newId("l"),
      kind: LINK_KINDS[raw.kind] ? raw.kind : "see",
      from, to, note: raw.note ? String(raw.note) : ""
    };
  }

  window.SKIPI_MODEL = {
    DB_NAME, STORE, KEY_ACADEMY, KEY_LINKS, KEY_TRASH, FILE_PREFIX,
    storeGet, storeSet, storeDel, storeKeys,
    putFile, getFile, delFile, listFiles, blobToBase64, niceSize,
    fingerprint, ACCENTS, ICONS, ICON_NAMES, newId, normalizeStand, plainStand,
    cloneStructure, mergeStructure, normalizeGuest, guestBuildings,
    LINK_KINDS, nodeKey, normalizeLink
  };
})();
