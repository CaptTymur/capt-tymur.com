(() => {
  "use strict";
  const $ = (id) => document.getElementById(id), base = String(window.SKIPI_SYNC_CONFIG?.url || "").replace(/\/$/, "");
  let busy = false;
  async function request(path, body) {
    const response = await fetch(base + path, { method: body ? "POST" : "GET", credentials: "include", cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : {}, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || "connection_error"), { status: response.status });
    return data;
  }
  const gameLink = (student, target) => "index.html?g=" + encodeURIComponent(student.id) + "#go=" + target;
  function artifactList(course) {
    const section = document.createElement("section"); section.className = "course-artifacts";
    const heading = document.createElement("h3"); heading.textContent = "Артефакты курса"; section.appendChild(heading);
    let count = 0;
    for (const item of course.modules) for (const file of item.artifacts || []) {
      const row = document.createElement("div"); row.className = "artifact"; row.dataset.fileId = file.fileId || "";
      const text = document.createElement("div"), title = document.createElement("strong"), moduleName = document.createElement("div");
      title.textContent = file.label || file.name || "Артефакт"; moduleName.className = "note"; moduleName.textContent = item.label;
      text.append(title, moduleName); row.appendChild(text);
      const status = document.createElement("p"); status.className = "note"; status.setAttribute("role", "status");
      if (file.fileId) {
        const button = document.createElement("button"); button.type = "button"; button.className = "quiet"; button.textContent = "Скачать";
        button.addEventListener("click", async () => {
          if (button.disabled) return; button.disabled = true; status.textContent = "Загружаю файл…";
          try {
            const record = await request("/file/" + encodeURIComponent(file.fileId));
            const bytes = Uint8Array.from(atob(record.base64), (c) => c.charCodeAt(0));
            const url = URL.createObjectURL(new Blob([bytes], { type: record.type })), link = document.createElement("a");
            link.href = url; link.download = record.name || file.name || "артефакт"; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 20000);
            status.textContent = "Файл передан для скачивания";
          } catch (error) { status.textContent = error.status === 401 ? "Войдите в кабинет заново." : error.status === 403 ? "Доступ к файлу закрыт преподавателем. Обновите кабинет." : "Не удалось скачать. Проверьте связь и повторите."; }
          finally { button.disabled = false; }
        }); row.appendChild(button);
      } else {
        const target = new URL(file.file, location.href), files = new URL("content/files/", location.href);
        if (target.origin !== files.origin || !target.pathname.startsWith(files.pathname)) continue;
        const link = document.createElement("a"); link.className = "button quiet"; link.href = target.href; link.download = file.name || ""; link.textContent = "Скачать"; row.appendChild(link);
      }
      row.appendChild(status); section.appendChild(row); count++;
    }
    if (!count) { const note = document.createElement("p"); note.className = "note"; note.textContent = "Здесь появятся файлы с последних стендов открытых модулей."; section.appendChild(note); }
    return section;
  }
  function render(data) {
    $("login-panel").hidden = true; $("cabinet").hidden = false; $("logout").hidden = false; $("who").hidden = false;
    $("who").textContent = data.student.name; $("welcome").textContent = "Здравствуйте, " + data.student.name;
    $("courses").replaceChildren();
    if (!data.courses.length) { const p = document.createElement("p"); p.textContent = "Преподаватель пока не назначил вам курс."; $("courses").appendChild(p); }
    for (const course of data.courses) {
      const card = document.createElement("article"); card.className = "course";
      const head = document.createElement("div"); head.className = "course-head";
      const title = document.createElement("div"), h = document.createElement("h2"), note = document.createElement("p");
      h.textContent = course.label; const opened = course.modules.filter((m) => m.open).length;
      note.textContent = course.open ? "Открыто модулей: " + opened + " из " + course.modules.length : "Доступ к курсу приостановлен преподавателем";
      title.append(h, note); head.appendChild(title);
      if (course.open) { const go = document.createElement("a"); go.className = "button"; go.textContent = "Открыть курс"; go.href = gameLink(data.student, "c:" + encodeURIComponent(course.buildingId) + ":" + encodeURIComponent(course.id)); head.appendChild(go); }
      card.appendChild(head);
      const modules = document.createElement("div"); modules.className = "modules";
      course.modules.forEach((module, index) => {
        const item = document.createElement("section"); item.className = "module" + (module.open ? "" : " locked"); item.dataset.module = module.id;
        const num = document.createElement("span"); num.className = "module-number"; num.textContent = "МОДУЛЬ " + String(index + 1).padStart(2, "0");
        const label = document.createElement("h3"); label.textContent = module.label;
        const status = document.createElement("span"); status.className = module.open ? "status-open" : "status-closed"; status.textContent = module.open ? "Открыт" : "Закрыт";
        item.append(num, label, status);
        if (module.open) { const go = document.createElement("a"); go.className = "button quiet"; go.textContent = "Перейти к модулю"; go.href = gameLink(data.student, encodeURIComponent(module.pavilion)); item.appendChild(go); }
        else { const text = document.createElement("p"); text.className = "note"; text.textContent = "Откроет преподаватель"; item.appendChild(text); }
        modules.appendChild(item);
      });
      card.appendChild(modules); card.appendChild(artifactList(course)); $("courses").appendChild(card);
    }
  }
  async function load() {
    try { render(await request("/student/session")); }
    catch (error) {
      if (error.status === 401) { $("cabinet").hidden = true; $("login-panel").hidden = false; $("logout").hidden = true; $("who").hidden = true; }
      else $("connection-error").textContent = "Не удалось подключиться. Проверьте связь и обновите страницу.";
    }
  }
  $("login-form").addEventListener("submit", async (event) => {
    event.preventDefault(); if (busy) return; busy = true; $("login-button").disabled = true; $("login-error").textContent = "";
    try {
      await request("/student/login", { username: $("username").value.trim(), password: $("password").value }); $("password").value = "";
      const next = new URLSearchParams(location.search).get("next");
      if (next) { const target = new URL(next, location.href), home = new URL("./", location.href); if (target.origin === location.origin && [home.pathname, new URL("index.html", home).pathname].includes(target.pathname)) { location.assign(target.href); return; } }
      await load();
    } catch (error) { $("login-error").textContent = error.status === 429 ? "Слишком много попыток. Подождите минуту." : error.status === 401 ? "Неверный логин или пароль" : "Не удалось войти. Проверьте связь и повторите."; }
    finally { busy = false; $("login-button").disabled = false; }
  });
  $("logout").addEventListener("click", async () => {
    try { await request("/student/logout", {}); $("cabinet").hidden = true; $("login-panel").hidden = false; $("logout").hidden = true; $("who").hidden = true; }
    catch { $("connection-error").textContent = "Не удалось выйти. Повторите при восстановлении связи."; }
  });
  $("password-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if ($("new-password").value !== $("confirm-password").value) { $("password-status").textContent = "Новые пароли не совпадают"; return; }
    try { await request("/student/password", { currentPassword: $("old-password").value, newPassword: $("new-password").value }); $("password-form").reset(); $("password-status").textContent = "Пароль изменён"; }
    catch (error) { $("password-status").textContent = error.status === 401 ? "Текущий пароль неверен" : "Не удалось изменить пароль. Новый пароль должен содержать не менее 8 символов."; }
  });
  load();
  window.addEventListener("pageshow", (event) => { if (event.persisted) load(); });
})();
