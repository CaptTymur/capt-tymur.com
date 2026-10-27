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
      card.appendChild(modules); $("courses").appendChild(card);
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
