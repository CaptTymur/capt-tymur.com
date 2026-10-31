/* Кабинет преподавателя. Тот же список слушателей, что у мастерской.
   Сохранение — в этом браузере; действие у слушателей — после публикации выгрузки. */
(async () => {
  "use strict";
  const M = window.SKIPI_MODEL, $ = (id) => document.getElementById(id);
  if (window.SKIPI_SYNC) await window.SKIPI_SYNC.start({ editor: true });
  const published = window.SKIPI_GUESTS || {}, guests = {};
  let selected = "", buildings = [], dirty = false, credentialsBusy = false, accountInfo = {};
  if (window.SKIPI_SYNC?.enabled) {
    try { accountInfo = (await window.SKIPI_SYNC.request("/students")).students; } catch { /* старый сервис: настройки доступа продолжают работать */ }
  }
  const status = (message) => { $("status").textContent = message; };
  const hash = String((window.SKIPI_STUDIO || {}).keyHash || "").trim().toLowerCase();
  const accepted = async (word) => {
    if (!word) return false;
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(word));
    return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("") === hash;
  };
  if (hash) {
    let saved = "";
    try { saved = localStorage.getItem("skipi-studio/key") || ""; } catch { /* спросим */ }
    if (!await accepted(saved)) {
      $("gate").hidden = false;
      await new Promise((resolve) => $("gate-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!await accepted($("gate-key").value)) { $("gate-error").textContent = "Неверный ключ"; return; }
        try { localStorage.setItem("skipi-studio/key", $("gate-key").value); } catch { /* только текущий вход */ }
        $("gate-key").value = ""; $("gate").hidden = true; resolve();
      }));
    }
  } else $("key-warning").textContent = "Ключ преподавателя пока не задан. Этот кабинет и мастерская открыты всем, у кого есть адрес.";

  const local = await M.storeGet("__guests");
  for (const [key, g] of Object.entries(published)) guests[key] = M.normalizeGuest(g);
  for (const [key, g] of Object.entries(local && local.guests || {})) guests[key] = M.normalizeGuest(g, published[key]);
  const savedAcademy = await M.storeGet(M.KEY_ACADEMY);
  buildings = savedAcademy && savedAcademy.buildings
    ? M.mergeStructure(window.SKIPI_ACADEMY.buildings, savedAcademy.buildings).buildings
    : M.cloneStructure(window.SKIPI_ACADEMY.buildings);
  const changed = (key) => !published[key] || JSON.stringify(guests[key]) !== JSON.stringify(M.normalizeGuest(published[key]));
  const publicationStatus = () => {
    if (window.SKIPI_SYNC?.enabled) { status("Настройки сохраняются автоматически в общем хранилище. Подтверждение отправки — в нижней строке."); return; }
    const count = Object.keys(guests).filter(changed).length;
    status(count ? "Сохранено в этом браузере. Студентов с неопубликованными изменениями: " + count + ". Выгрузите изменения и передайте файл для публикации — до этого ссылки и права у студентов прежние."
      : "Все сохранённые настройки студентов опубликованы.");
  };
  const link = (key) => new URL("index.html?g=" + encodeURIComponent(key), location.href).href;
  const save = async () => {
    if (!await M.storeSet("__guests", { version: 1, savedAt: new Date().toISOString(), guests })) throw new Error("Не удалось сохранить настройки в браузере");
    publicationStatus();
  };
  function renderList() {
    $("list").replaceChildren();
    for (const [key, g] of Object.entries(guests)) {
      const button = document.createElement("button"); button.type = "button";
      button.textContent = g.name + (g.active ? "" : " · вход закрыт") + (changed(key) ? " · не опубликовано" : "");
      button.setAttribute("aria-pressed", String(key === selected));
      button.addEventListener("click", () => {
        if (dirty && !confirm("Отменить несохранённые правки?")) return;
        selected = key; render();
      });
      $("list").appendChild(button);
    }
  }
  function accessRow(label, key, open, section) {
    const row = document.createElement("label"); row.className = "access" + (section ? " section" : "");
    const name = document.createElement("span"); name.textContent = label;
    const select = document.createElement("select"); select.dataset.access = key;
    // Модуль по умолчанию закрыт: дверь академии сама доступа слушателю не даёт.
    const byDefault = section ? "По умолчанию закрыто" : "Как в академии (" + (open ? "открыто" : "закрыто") + ")";
    for (const [value, text] of [["", byDefault], ["true", "Открыть"], ["false", "Закрыть"]]) {
      const option = document.createElement("option"); option.value = value; option.textContent = text; select.appendChild(option);
    }
    const value = guests[selected].access[key]; select.value = value === undefined ? "" : String(value);
    row.append(name, select); $("access").appendChild(row);
  }
  function render() {
    dirty = false; renderList(); $("empty").hidden = !!selected; $("student-form").hidden = !selected;
    if (!selected) return;
    const g = guests[selected];
    $("student-title").textContent = g.name; $("name").value = g.name; $("active").checked = g.active;
    $("stripes").value = g.stripes === undefined ? "" : String(g.stripes);
    $("invite").value = link(selected); $("preview").href = link(selected);
    $("student-login").value = accountInfo[selected]?.username || selected;
    $("student-password").value = ""; $("issued-password").value = ""; $("credential-result").hidden = true; $("credential-message").textContent = "";
    $("login-state").textContent = accountInfo[selected]?.passwordConfigured ? "Пароль задан. Повторное назначение завершит прежние входы студента." : "Пароль ещё не задан. Студент войдёт после его назначения.";
    $("access").replaceChildren();
    for (const b of buildings) {
      accessRow(b.label, "building:" + b.id, b.open, false);
      for (const c of b.courses) {
        const enrollment = document.createElement("label"); enrollment.className = "row";
        const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.dataset.course = b.id + "/" + c.id; checkbox.checked = (g.courses || []).includes(checkbox.dataset.course);
        enrollment.append(checkbox, document.createTextNode("Назначен курс: " + c.label)); $("access").appendChild(enrollment);
        accessRow(c.label, "course:" + b.id + "/" + c.id, c.open, false);
        for (const d of c.doors) if (d.pavilion) accessRow(d.label, "section:" + d.pavilion, d.open, true);
        else { const planned = document.createElement("div"); planned.className = "access section"; planned.textContent = d.label + " · модуль ещё не создан"; $("access").appendChild(planned); }
      }
    }
    publicationStatus();
  }
  $("student-form").addEventListener("input", (event) => { if (!event.target.closest("#login-settings")) dirty = true; });
  $("student-form").addEventListener("change", (event) => { if (!event.target.closest("#login-settings")) dirty = true; });
  $("student-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const g = guests[selected], name = $("name").value.trim();
    if (!name) return;
    const next = { ...g, name, active: $("active").checked, access: { ...g.access } };
    next.courses = [...document.querySelectorAll("[data-course]:checked")].map((input) => input.dataset.course);
    if ($("stripes").value) next.stripes = Number($("stripes").value); else delete next.stripes;
    for (const input of document.querySelectorAll("[data-access]")) {
      if (!input.value) delete next.access[input.dataset.access];
      else next.access[input.dataset.access] = input.value === "true";
    }
    const previous = guests[selected]; guests[selected] = M.normalizeGuest(next);
    try { await save(); render(); } catch (error) { guests[selected] = previous; status(error.message); }
  });
  $("reset").addEventListener("click", render);
  $("copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(link(selected)); status("Ссылка скопирована" + (changed(selected) ? ". Внимание: изменения доступа ещё не опубликованы." : ".")); }
    catch { $("invite").select(); status("Скопируйте выделенную ссылку."); }
  });
  $("add-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = $("new-name").value.trim(); if (!name) return;
    if (dirty && !confirm("Отменить несохранённые правки?")) return;
    const key = "student-" + crypto.randomUUID().slice(0, 12);
    guests[key] = M.normalizeGuest({ name, role: "cadet", courses: [], note: "Персональный вход слушателя" });
    try { await save(); selected = key; $("new-name").value = ""; render(); }
    catch (error) { delete guests[key]; status(error.message); }
  });
  $("export").addEventListener("click", () => {
    if (dirty) { status("Сначала сохраните или отмените правки студента."); return; }
    const data = { format: "skipi-students", version: 1, exportedAt: new Date().toISOString(), guests };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "skipi-students-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    status(window.SKIPI_SYNC?.enabled ? "Резервная выгрузка готова. Настройки сохраняются автоматически." : "Выгрузка готова. Передайте файл разработчику для публикации; у студентов пока действуют прежние настройки.");
  });
  window.addEventListener("beforeunload", (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
  async function setPassword(generated) {
    if (credentialsBusy) return;
    if (dirty) { $("credential-message").textContent = "Сначала сохраните настройки студента."; return; }
    if (!window.SKIPI_SYNC?.enabled) { $("credential-message").textContent = "Подключите общее хранилище, чтобы задать пароль."; return; }
    if (!generated && $("student-password").value.length < 8) { $("credential-message").textContent = "Пароль должен содержать не менее 8 символов."; return; }
    credentialsBusy = true; $("set-password").disabled = true; $("generate-password").disabled = true;
    $("issued-password").value = ""; $("credential-result").hidden = true;
    const id = selected;
    try {
      await window.SKIPI_SYNC.flush();
      const body = { id, username: $("student-login").value.trim() };
      if (!generated) body.password = $("student-password").value;
      const answer = await window.SKIPI_SYNC.request("/students/password", body);
      accountInfo[id] = { username: answer.username, passwordConfigured: true };
      if (selected !== id) return;
      $("student-password").value = ""; $("login-state").textContent = "Пароль задан. Прежние входы студента завершены.";
      $("credential-message").textContent = "Логин: " + answer.username + ". Передайте студенту ссылку на личный кабинет и пароль.";
      if (answer.generatedPassword) { $("issued-password").value = answer.generatedPassword; $("issued-password").type = "password"; $("credential-result").hidden = false; }
    } catch (error) { $("credential-message").textContent = error.message === "username_taken" ? "Этот логин уже занят." : "Не удалось задать пароль. Проверьте сохранение студента, логин и связь."; }
    finally { credentialsBusy = false; $("set-password").disabled = false; $("generate-password").disabled = false; }
  }
  $("set-password").addEventListener("click", () => setPassword(false));
  $("generate-password").addEventListener("click", () => setPassword(true));
  $("show-password").addEventListener("click", () => { $("issued-password").type = $("issued-password").type === "password" ? "text" : "password"; });
  $("copy-password").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("issued-password").value); $("credential-message").textContent = "Пароль скопирован."; } catch { $("issued-password").type = "text"; $("issued-password").select(); } });
  window.addEventListener("skipi-sync-saved", (event) => {
    if (event.detail.changes.__guests) { Object.keys(published).forEach((key) => delete published[key]); Object.assign(published, event.detail.changes.__guests.guests); renderList(); publicationStatus(); }
  });
  $("workspace").hidden = false; $("export").hidden = false;
  selected = Object.keys(guests)[0] || ""; render(); publicationStatus();
  window.SKIPI_TEACHER_FEEDBACK?.start();
})().catch((error) => { document.getElementById("status").textContent = "Не удалось открыть кабинет: " + error.message; });
