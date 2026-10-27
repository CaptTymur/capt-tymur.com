(() => {
  "use strict";
  const $ = (id) => document.getElementById(id), panel = $("feedback-panel");
  if (!panel) return;
  let context = null, pending = null, busy = false;
  const api = String(window.SKIPI_SYNC_CONFIG?.url || "").replace(/\/$/, "");
  async function request(path, body) {
    const response = await fetch(api + path, { method: body ? "POST" : "GET", credentials: "include", cache: "no-store", headers: body ? { "Content-Type": "application/json" } : {}, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
    const data = await response.json(); if (!response.ok) throw Object.assign(new Error(data.error), { status: response.status }); return data;
  }
  const describe = (c) => [c.courseLabel, c.moduleLabel, c.standLabel].filter(Boolean).join(" → ");
  async function refresh() {
    try {
      const data = await request("/feedback"), list = $("feedback-history"); list.replaceChildren();
      const messages = data.messages.filter((m) => m.context.course === context.course);
      if (!messages.length) { const p = document.createElement("p"); p.textContent = "Вы ещё не отправляли вопросы или отзывы по этому курсу."; list.appendChild(p); }
      for (const message of messages) {
        const item = document.createElement("article"); item.className = "feedback-message"; item.dataset.message = message.id;
        const head = document.createElement("strong"); head.textContent = (message.kind === "question" ? "Вопрос" : "Отзыв") + " · " + (message.reply ? "Есть ответ" : "Ожидает ответа");
        const place = document.createElement("div"); place.className = "feedback-context"; place.textContent = describe(message.context) + " · " + new Date(message.createdAt * 1000).toLocaleString("ru");
        const body = document.createElement("p"); body.textContent = message.text; item.append(head, place, body);
        if (message.reply) { const answer = document.createElement("p"); answer.className = "feedback-reply"; answer.textContent = "Преподаватель: " + message.reply; item.appendChild(answer); }
        list.appendChild(item);
      }
    } catch (error) { $("feedback-status").textContent = error.status === 401 ? "Войдите заново в личный кабинет, чтобы отправить сообщение." : "Не удалось загрузить сообщения. Повторите при восстановлении связи."; }
  }
  window.SKIPI_FEEDBACK = { open(value) {
    if (busy) { if (!panel.open) panel.showModal(); return; }
    const changed = context && JSON.stringify(value) !== JSON.stringify(context);
    if (changed && $("feedback-text").value.trim() && !confirm("Перейти к другому месту курса и очистить черновик?")) return;
    if (changed) { $("feedback-text").value = ""; pending = null; }
    context = value; $("feedback-context").textContent = describe(context); $("feedback-status").textContent = "";
    panel.showModal(); refresh();
  } };
  panel.addEventListener("keydown", (event) => event.stopPropagation());
  $("feedback-close").addEventListener("click", () => panel.close());
  $("feedback-refresh").addEventListener("click", refresh);
  $("feedback-form").addEventListener("submit", async (event) => {
    event.preventDefault(); if (busy || !context) return;
    const text = $("feedback-text").value.trim(), kind = $("feedback-kind").value;
    if (!text) return;
    const signature = JSON.stringify({ context, text, kind });
    if (!pending || pending.signature !== signature) pending = { signature, id: crypto.randomUUID() };
    busy = true; $("feedback-send").disabled = true; $("feedback-status").textContent = "Отправляю…";
    try {
      await request("/feedback", { clientId: pending.id, kind, course: context.course, module: context.module || "", stand: context.stand || "", text });
      $("feedback-text").value = ""; pending = null; $("feedback-status").textContent = "Сообщение отправлено преподавателю. Ответ появится здесь."; await refresh();
    } catch (error) { $("feedback-status").textContent = error.status === 401 ? "Войдите заново в личный кабинет." : error.status === 403 ? "Доступ к этому месту курса изменился. Обновите страницу." : error.status === 429 ? "Слишком много сообщений. Подождите минуту." : "Не удалось отправить. Текст сохранён в форме — повторите отправку."; }
    finally { busy = false; $("feedback-send").disabled = false; }
  });
})();
