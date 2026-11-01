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
  /* После оплаты: ?order=…&claim=…&tx=… — покупатель задаёт пароль один раз и сразу входит. */
  const params = new URLSearchParams(location.search), claimOrder = params.get("order") || "", claimToken = params.get("claim") || "", claimTx = params.get("tx") || "";
  const claimQuery = () => "/paddle/order?orderId=" + encodeURIComponent(claimOrder) + "&claim=" + encodeURIComponent(claimToken) + (claimTx ? "&transactionId=" + encodeURIComponent(claimTx) : "");
  function finishClaim() {
    try { localStorage.removeItem("skipi-edu/order"); } catch { /* приватный режим */ }
    history.replaceState(null, "", "account.html"); $("claim-panel").hidden = true;
  }
  async function claimFlow() {
    $("login-panel").hidden = true; $("claim-panel").hidden = false;
    let status = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { status = await request(claimQuery()); }
      catch (error) {
        $("claim-title").textContent = "Заказ не найден"; $("claim-text").textContent = error.status === 404 || error.status === 403 ? "Ссылка оформления недействительна или устарела. Если вы оплатили курс, напишите нам — доступ откроем вручную." : "Нет связи с сервером. Обновите страницу позже: ссылка оформления остаётся действительной.";
        $("claim-login-link").hidden = false; return;
      }
      if (status.status !== "pending") break;
      $("claim-note").textContent = "Подтверждение ещё не пришло… попытка " + (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    $("claim-note").textContent = "";
    if (!status || status.status === "pending") { $("claim-title").textContent = "Оплата ещё не подтверждена"; $("claim-text").textContent = "Paddle пока не подтвердил платёж. Откройте эту же ссылку через несколько минут — она сохранена в браузере на странице покупки."; $("claim-login-link").hidden = false; return; }
    if (status.status === "refunded") { $("claim-title").textContent = "Платёж возвращён"; $("claim-text").textContent = "По этому заказу оформлен возврат, доступ к курсу закрыт."; $("claim-login-link").hidden = false; return; }
    if (status.claimed || status.accountReady) { $("claim-title").textContent = "Пароль уже задан"; $("claim-text").textContent = "Войдите с логином " + (status.username || status.email) + " и паролем, который вы придумали."; $("claim-login-link").hidden = false; finishClaimLater(status.username || status.email); return; }
    $("claim-title").textContent = "Оплата подтверждена"; $("claim-text").textContent = "Курс «" + status.courseLabel + "» оплачен. Придумайте пароль: логин — ваш e-mail.";
    $("claim-username").value = status.email; $("claim-form").hidden = false;
  }
  function finishClaimLater(username) { $("claim-login-link").querySelector("a").addEventListener("click", (event) => { event.preventDefault(); finishClaim(); $("login-panel").hidden = false; $("username").value = username; }); }
  $("claim-form").addEventListener("submit", async (event) => {
    event.preventDefault(); if (busy) return;
    if ($("claim-password").value !== $("claim-confirm").value) { $("claim-error").textContent = "Пароли не совпадают"; return; }
    busy = true; $("claim-button").disabled = true; $("claim-error").textContent = "";
    try {
      await request("/paddle/claim", { orderId: claimOrder, claim: claimToken, username: $("claim-username").value.trim(), password: $("claim-password").value });
      $("claim-password").value = ""; $("claim-confirm").value = ""; finishClaim(); await load();
    } catch (error) {
      $("claim-error").textContent = error.message === "username_taken" ? "Этот логин уже занят, укажите другой." : error.message === "password_length" ? "Пароль должен содержать не менее 8 символов." : error.message === "already_claimed" ? "Пароль уже был задан. Перейдите ко входу." : error.message === "order_not_paid" ? "Оплата ещё не подтверждена. Подождите минуту и повторите." : "Не удалось сохранить пароль. Проверьте связь и повторите.";
    } finally { busy = false; $("claim-button").disabled = false; }
  });
  if (claimOrder && claimToken) claimFlow(); else load();
  window.addEventListener("pageshow", (event) => { if (event.persisted && !(claimOrder && claimToken)) load(); });
})();
