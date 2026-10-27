/* Общее хранилище. Локальная запись завершается первой; неподтверждённые правки
   остаются в IndexedDB. Ревизия защищает от перезаписи работы другого компьютера. */
(() => {
  "use strict";
  const M = window.SKIPI_MODEL, config = window.SKIPI_SYNC_CONFIG || {};
  const url = String(config.url || "").replace(/\/$/, "");
  const META = "skipi-sync/state", KEY = "skipi-studio/key";
  const S = { enabled: false, revision: 0, pending: new Map(), busy: false, blocked: false, editor: false };
  let token = "", timer = 0, bar, status, retry;
  const remember = () => localStorage.setItem(META, JSON.stringify({ revision: S.revision, dirty: S.pending.size > 0 || S.busy }));
  function message(text) { if (status) status.textContent = text; }
  function banner() {
    bar = document.createElement("div");
    bar.style.cssText = "position:fixed;bottom:0;left:0;right:0;z-index:10001;background:#fff9d8;color:#17212b;padding:7px 12px;font:13px Tahoma,sans-serif;border-top:1px solid #876;display:flex;gap:12px;align-items:center;flex-wrap:wrap";
    status = document.createElement("span"); status.setAttribute("role", "status");
    retry = document.createElement("button"); retry.textContent = "Повторить сохранение";
    retry.onclick = () => { if (S.editor && S.enabled) flush(); else location.reload(); }; bar.append(status, retry); document.body.appendChild(bar);
    document.body.style.paddingBottom = "42px";
  }
  async function request(path, body) {
    const response = await fetch(url + path, { method: body ? "POST" : "GET", cache: "no-store",
      headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || "storage_unavailable"), { status: response.status });
    return data;
  }
  function choose(title, choices) {
    return new Promise((resolve) => {
      const panel = document.createElement("div");
      panel.style.cssText = "position:fixed;inset:0;z-index:10002;background:#192e3bea;display:grid;place-items:center;font:15px Tahoma,sans-serif";
      const box = document.createElement("div"); box.style.cssText = "background:white;color:#17212b;padding:24px;max-width:650px;margin:16px;line-height:1.5";
      const text = document.createElement("p"); text.textContent = title; box.appendChild(text);
      for (const [value, label] of choices) {
        const button = document.createElement("button"); button.textContent = label; button.dataset.syncChoice = value;
        button.style.cssText = "margin:5px;padding:9px"; button.onclick = () => { panel.remove(); resolve(value); }; box.appendChild(button);
      }
      panel.appendChild(box); document.body.appendChild(panel);
    });
  }
  async function login() {
    token = localStorage.getItem(KEY) || "";
    if (token) return true;
    return await new Promise((resolve) => {
      const form = document.createElement("form");
      form.style.cssText = "position:fixed;inset:15% 10%;z-index:10002;background:white;color:#17212b;padding:24px;border:2px solid #000080;font:15px Tahoma,sans-serif";
      const label = document.createElement("label"); label.textContent = "Ключ преподавателя для общего хранилища ";
      const input = document.createElement("input"); input.type = "password"; input.autocomplete = "current-password"; input.required = true;
      input.dataset.syncKey = ""; label.appendChild(input);
      const enter = document.createElement("button"); enter.textContent = "Подключить";
      const local = document.createElement("button"); local.type = "button"; local.textContent = "Продолжить только в этом браузере";
      local.onclick = () => { form.remove(); resolve(false); };
      form.append(label, enter, local); document.body.appendChild(form);
      form.onsubmit = (event) => { event.preventDefault(); token = input.value; localStorage.setItem(KEY, token); input.value = ""; form.remove(); resolve(true); };
    });
  }
  async function encode(value) {
    if (!value || !value.blob) return value;
    const { blob, ...meta } = value;
    return { ...meta, base64: await M.blobToBase64(blob) };
  }
  function globals(records) {
    if (records.__academy) window.SKIPI_ACADEMY = { ...window.SKIPI_ACADEMY, ...records.__academy };
    if (records.__guests) window.SKIPI_GUESTS = records.__guests.guests || {};
    if (records.__links) window.SKIPI_LINKS = records.__links;
    window.SKIPI_REMOTE_SECTIONS = {};
    for (const [key, value] of Object.entries(records)) if (!key.startsWith("__") && !key.startsWith("file:") && value && Array.isArray(value.stands)) {
      window.SKIPI_REMOTE_SECTIONS[key] = { id: key, title: value.title, subtitle: value.subtitle, stands: value.stands };
    }
  }
  async function localRecords() {
    const records = {};
    for (const key of await M.storeKeys()) if (/^(?:__[a-z]+|[a-zA-Z0-9_-]+|file:[a-zA-Z0-9_-]+)$/.test(key)) records[key] = await encode(await M.storeGet(key));
    for (const [old, canonical] of Object.entries(config.aliases || {})) {
      if (records[old]) {
        let useOld = true;
        if (records[canonical]?.stands?.length && records[old].stands?.length) {
          const backupKey = "sync-backup/aliases-" + Date.now();
          if (!await M.storeSet(backupKey, { records: structuredClone(records) }) || !await M.storeGet(backupKey)) throw new Error("Не удалось сохранить резерв обеих версий раздела");
          // После ручной публикации та же картинка бывает data: в старой копии
          // и обычным файлом в новой. Сравниваем её байты, а не строку адреса.
          const images = new Map();
          const imageHash = async (src) => {
            if (!src) return "";
            if (!images.has(src)) images.set(src, (async () => {
              const response = await fetch(src); if (!response.ok) throw new Error("Не удалось сверить картинки двух версий");
              const hash = await crypto.subtle.digest("SHA-256", await response.arrayBuffer());
              return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
            })());
            return images.get(src);
          };
          const signature = async (section) => {
            const stands = [];
            for (const raw of section.stands) {
              const stand = M.normalizeStand(raw); stand.image = await imageHash(stand.image);
              for (const image of stand.images) image.src = await imageHash(image.src);
              stands.push(stand);
            }
            return JSON.stringify(stands);
          };
          if (await signature(records[old]) === await signature(records[canonical])) useOld = false;
          else useOld = await choose("В этом браузере две заполненные версии коммерческого раздела. Резерв обеих сохранён. Какую перенести в общее хранилище?", [["old", "Ранее заполненный раздел"], ["new", "Новая копия раздела"]]) === "old";
        }
        if (useOld) records[canonical] = { ...records[old], pavilion: canonical };
        delete records[old];
      }
      for (const building of records.__academy?.buildings || []) for (const course of building.courses || []) {
        const unique = new Set();
        course.doors = (course.doors || []).filter((door) => {
          if (door.pavilion === old) door.pavilion = canonical;
          if (!door.pavilion) return true;
          if (unique.has(door.pavilion)) return false;
          unique.add(door.pavilion); return true;
        });
      }
      for (const g of Object.values(records.__guests?.guests || {})) if (Object.hasOwn(g.access || {}, "section:" + old)) {
        g.access["section:" + canonical] = g.access["section:" + old]; delete g.access["section:" + old];
      }
      for (const link of records.__links?.links || []) for (const side of ["from", "to"]) if (link[side]?.sec === old) link[side].sec = canonical;
    }
    return records;
  }
  async function flush() {
    clearTimeout(timer); timer = 0;
    if (S.busy || S.blocked || !S.pending.size) return;
    S.busy = true; remember(); message("Сохраняю в общем хранилище…");
    const batch = new Map(S.pending); S.pending.clear();
    try {
      const changes = {};
      for (const [key, value] of batch) changes[key] = await encode(value);
      const result = await request("/changes", { baseRevision: S.revision, changes });
      S.revision = result.revision;
      window.dispatchEvent(new CustomEvent("skipi-sync-saved", { detail: { changes, revision: S.revision } }));
      message("Сохранено в общем хранилище. Доступно на других компьютерах.");
    } catch (error) {
      for (const [key, value] of batch) if (!S.pending.has(key)) S.pending.set(key, value);
      S.blocked = error.status === 409 || error.status === 401;
      message(error.status === 409 ? "На другом компьютере есть новые правки. Ваши правки сохранены в этом браузере. Выгрузите всё перед объединением; сервер не перезаписан."
        : error.status === 401 ? "Ключ преподавателя не принят. Правки остались в этом браузере."
        : "Нет связи с хранилищем. Правки сохранены в этом браузере; повторю отправку.");
      if (!S.blocked) timer = setTimeout(flush, 10000);
    } finally {
      S.busy = false; remember();
      if (S.pending.size && !S.blocked && !timer) timer = setTimeout(flush, 1200);
    }
  }
  function changed(key, value) {
    if (!/^(?:__[a-z]+|[a-zA-Z0-9_-]+|file:[a-zA-Z0-9_-]+)$/.test(key)) return;
    S.pending.set(key, structuredClone(value)); remember(); message("Сохранено в этом браузере. Отправляю в общее хранилище…");
    clearTimeout(timer); timer = setTimeout(() => { timer = 0; flush(); }, 1200);
  }
  async function start({ editor = false } = {}) {
    if (!url) return false;
    S.editor = editor;
    try {
      if (editor) {
        banner();
        while (true) {
          if (!await login()) { message("Общее хранилище не подключено. Правки остаются в этом браузере."); return false; }
          try { await request("/session"); break; }
          catch (error) { if (error.status !== 401) throw error; localStorage.removeItem(KEY); token = ""; message("Неверный ключ преподавателя. Введите его ещё раз."); }
        }
      }
      else token = localStorage.getItem(KEY) || "";
      let state = await request("/state"); S.revision = state.revision;
      if (editor) {
        const local = await localRecords(), meta = JSON.parse(localStorage.getItem(META) || "null");
        if (Object.keys(local).length && (!meta || meta.dirty)) {
          const choice = await choose("В этом браузере есть прежнее наполнение. Перед объединением сохраню его резервную копию. Серверные данные не будут заменены без вашего выбора.",
            [["upload", "Перенести правки этого браузера"], ["server", "Открыть версию из общего хранилища"], ["local", "Продолжить только в этом браузере"]]);
          if (choice === "local") { message("Правки остаются в этом браузере. Автоматическая отправка отключена."); return false; }
          const backed = await M.storeSet("sync-backup/" + Date.now(), { savedAt: new Date().toISOString(), records: local });
          if (!backed) throw new Error("Не удалось сохранить резервную копию; перенос остановлен");
          if (choice === "upload") { await request("/changes", { baseRevision: S.revision, changes: local }); state = await request("/state"); S.revision = state.revision; }
        }
        for (const key of await M.storeKeys()) if (/^(?:__[a-z]+|[a-zA-Z0-9_-]+)$/.test(key) && !Object.hasOwn(state.records, key)) await M.storeDel(key);
        for (const [key, value] of Object.entries(state.records)) {
          if (Array.isArray(value?.stands)) value.seedFingerprint = M.fingerprint(value.stands);
          if (!await M.storeSet(key, value)) throw new Error("Не удалось сохранить локальную копию общего хранилища");
        }
        M.setWriteObserver(changed); remember(); message("Общее хранилище подключено. Изменения сохраняются автоматически.");
        window.addEventListener("beforeunload", (event) => { if (S.pending.size || S.busy) { event.preventDefault(); event.returnValue = ""; } });
      } else {
        for (const value of Object.values(state.records)) if (Array.isArray(value?.stands)) value.seedFingerprint = M.fingerprint(value.stands);
        M.setRemoteRecords(state.records);
      }
      globals(state.records); S.enabled = true; return true;
    } catch (error) {
      if (!status) banner();
      message("Общее хранилище недоступно. Работаю с копией в этом браузере: " + error.message);
      return false;
    }
  }
  window.SKIPI_SYNC = { start, flush, get enabled() { return S.enabled; }, get revision() { return S.revision; },
    async getFile(id) {
      if (!S.enabled) return null;
      const record = await request("/file/" + encodeURIComponent(id));
      const bytes = Uint8Array.from(atob(record.base64), (c) => c.charCodeAt(0));
      return { ...record, blob: new Blob([bytes], { type: record.type }) };
    }
  };
})();
