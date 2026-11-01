/* Покупка курса. Цена и клиентский токен приходят с собственного сервера (/paddle/config),
   окно оплаты открывает Paddle.js; доступ выдаёт сервер после подтверждения оплаты. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id), base = String(window.SKIPI_SYNC_CONFIG?.url || "").replace(/\/$/, "");
  const COURSE = "b1/captain", STORAGE = "skipi-edu/order";
  let config = null, order = null, initialized = false, busy = false;
  async function request(path, body) {
    const response = await fetch(base + path, { method: body ? "POST" : "GET", credentials: "include", cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : {}, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || "connection_error"), { status: response.status });
    return data;
  }
  const remember = (value) => { try { if (value) localStorage.setItem(STORAGE, JSON.stringify(value)); else localStorage.removeItem(STORAGE); } catch { /* приватный режим */ } };
  const recall = () => { try { return JSON.parse(localStorage.getItem(STORAGE) || "null"); } catch { return null; } };
  const accountUrl = (saved) => new URL("account.html?order=" + encodeURIComponent(saved.orderId) + "&claim=" + encodeURIComponent(saved.claim) + (saved.transactionId ? "&tx=" + encodeURIComponent(saved.transactionId) : ""), location.href).href;
  function renderModules() {
    const course = (window.SKIPI_ACADEMY?.buildings || []).flatMap((b) => (b.courses || []).map((c) => ({ ...c, key: b.id + "/" + c.id }))).find((c) => c.key === COURSE);
    if (!course) return;
    $("course-title").textContent = course.label; $("module-count").textContent = String(course.doors.length);
    for (const door of course.doors) { const li = document.createElement("li"); li.textContent = door.label; $("modules").appendChild(li); }
  }
  function renderResume() {
    const saved = recall();
    if (!saved || !saved.orderId || !saved.claim) { $("resume").hidden = true; return; }
    $("resume").hidden = false; $("resume-link").href = accountUrl(saved);
    $("resume-note").textContent = saved.transactionId ? "Оплата получена: осталось придумать пароль для входа." : "Если вы уже оплатили, перейдите к оформлению; если нет — просто оплатите заново ниже.";
  }
  function paddle() {
    if (!window.Paddle) throw Object.assign(new Error("paddle_js_blocked"), { status: 0 });
    if (!initialized) {
      if (config.environment === "sandbox") window.Paddle.Environment.set("sandbox");
      window.Paddle.Initialize({ token: config.clientToken, eventCallback: onEvent });
      initialized = true;
    }
    return window.Paddle;
  }
  function onEvent(event) {
    const name = event && event.name;
    if (name === "checkout.completed") {
      const transactionId = event.data?.transaction_id || event.data?.id || "";
      const saved = { ...(order || recall() || {}), transactionId };
      remember(saved); $("status").textContent = "Оплата принята. Переходим к оформлению доступа…";
      location.assign(accountUrl(saved));
    } else if (name === "checkout.closed" && !(recall() || {}).transactionId) {
      $("status").textContent = "Окно оплаты закрыто. Оплату можно повторить в любой момент.";
    } else if (name === "checkout.error") {
      $("error").textContent = "Paddle сообщил об ошибке оплаты. Проверьте данные карты и повторите.";
    }
  }
  async function load() {
    renderModules(); renderResume();
    try { config = await request("/paddle/config"); }
    catch { $("error").textContent = "Не удалось получить условия оплаты. Проверьте связь и обновите страницу."; $("pay").disabled = true; return; }
    const offer = (config.courses || []).find((c) => c.key === COURSE);
    if (!config.enabled || !offer) { $("price").textContent = "—"; $("price-note").textContent = "Оплата временно недоступна. Напишите нам, и мы откроем доступ вручную."; $("pay").disabled = true; return; }
    $("sandbox-badge").hidden = config.environment !== "sandbox";
    $("price").textContent = offer.price ? offer.price.display : "Цена в окне оплаты";
    if (offer.price) { const small = document.createElement("small"); small.textContent = " " + offer.price.currency + " · разовый платёж"; $("price").appendChild(small); }
  }
  $("buy-form").addEventListener("submit", async (event) => {
    event.preventDefault(); if (busy || !config) return;
    busy = true; $("pay").disabled = true; $("error").textContent = ""; $("status").textContent = "Готовим оплату…";
    try {
      order = await request("/paddle/checkout", { course: COURSE, email: $("email").value.trim(), name: $("name").value.trim() });
      remember({ orderId: order.orderId, claim: order.claim, email: order.email });
      paddle().Checkout.open({
        items: [{ priceId: order.priceId, quantity: 1 }],
        customer: { email: order.email },
        customData: { order_id: order.orderId, course: order.course },
        settings: { displayMode: "overlay", theme: "dark", locale: "ru", allowLogout: false, showAddDiscounts: false, successUrl: accountUrl({ orderId: order.orderId, claim: order.claim }) }
      });
      $("status").textContent = "Откройте окно оплаты Paddle. После оплаты вы вернётесь сюда и зададите пароль.";
      renderResume();
    } catch (error) {
      $("status").textContent = "";
      $("error").textContent = error.message === "invalid_email" ? "Проверьте адрес e-mail." : error.message === "invalid_name" ? "Укажите имя." : error.message === "paddle_js_blocked" ? "Не загрузился модуль оплаты Paddle. Отключите блокировщик и обновите страницу."
        : error.status === 503 ? "Оплата временно недоступна." : "Не удалось начать оплату. Проверьте связь и повторите.";
    } finally { busy = false; $("pay").disabled = false; }
  });
  load();
})();
