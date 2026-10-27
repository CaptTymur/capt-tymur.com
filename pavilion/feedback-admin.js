(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  let messages = [], loading = false;
  const drafts = new Map();
  const contextText = (c) => [c.courseLabel, c.moduleLabel, c.standLabel].filter(Boolean).join(" → ");
  function render() {
    const count = messages.filter((m) => !m.reply).length;
    $("feedback-unanswered-count").textContent = String(count);
    const list = $("feedback-inbox-list"); list.replaceChildren();
    const filtered = messages.filter((m) => (!$("feedback-unanswered").checked || !m.reply) && (!$("feedback-student").value || m.studentId === $("feedback-student").value) && (!$("feedback-filter-kind").value || m.kind === $("feedback-filter-kind").value));
    if (!filtered.length) { const p = document.createElement("p"); p.textContent = "Нет обращений по выбранному фильтру."; list.appendChild(p); }
    for (const message of filtered) {
      const item = document.createElement("article"); item.className = "feedback-message"; item.dataset.message = message.id;
      const heading = document.createElement("strong"); heading.textContent = message.studentName + " · " + (message.kind === "question" ? "Вопрос" : "Отзыв") + " · " + (message.reply ? "Отвечено" : "Без ответа");
      const place = document.createElement("p"); place.className = "feedback-context"; place.textContent = contextText(message.context) + " · " + new Date(message.createdAt * 1000).toLocaleString("ru");
      const link = document.createElement("a"), c = message.context;
      link.textContent = c.stand ? "Открыть стенд" : "Открыть курс"; link.target = "_blank"; link.rel = "noopener";
      const [building, course] = c.course.split("/"); link.href = "index.html#go=" + (c.module ? encodeURIComponent(c.module) + (c.stand ? "/" + encodeURIComponent(c.stand) : "") : "c:" + encodeURIComponent(building) + ":" + encodeURIComponent(course));
      const text = document.createElement("p"); text.textContent = message.text;
      const form = document.createElement("form"), answer = document.createElement("textarea"), button = document.createElement("button"), status = document.createElement("p");
      answer.value = drafts.has(message.id) ? drafts.get(message.id) : message.reply; answer.addEventListener("input", () => drafts.set(message.id, answer.value)); answer.maxLength = 6000; answer.required = true; answer.rows = 3; answer.setAttribute("aria-label", "Ответ студенту " + message.studentName);
      button.textContent = message.reply ? "Сохранить ответ" : "Ответить"; button.type = "submit"; status.setAttribute("role", "status");
      form.append(answer, button, status); form.addEventListener("submit", async (event) => {
        event.preventDefault(); if (button.disabled || !answer.value.trim()) return; button.disabled = true;
        try { const data = await window.SKIPI_SYNC.request("/feedback/reply", { id: message.id, reply: answer.value.trim() }); messages = messages.map((m) => m.id === message.id ? data.message : m); drafts.delete(message.id); render(); }
        catch { status.textContent = "Не удалось отправить ответ. Текст оставлен в форме — повторите."; button.disabled = false; }
      });
      item.append(heading, place, link, text, form); list.appendChild(item);
    }
  }
  async function refresh() {
    if (loading) return; loading = true; $("feedback-inbox-status").textContent = "Загрузка…";
    try {
      const data = await window.SKIPI_SYNC.request("/feedback"); messages = data.messages;
      const selected = $("feedback-student").value; $("feedback-student").replaceChildren(new Option("Все студенты", ""));
      for (const [id, name] of new Map(messages.map((m) => [m.studentId, m.studentName]))) $("feedback-student").add(new Option(name, id));
      $("feedback-student").value = selected; if (!$("feedback-student").value) $("feedback-student").value = "";
      render(); $("feedback-inbox-status").textContent = "Обращения загружены. Ответы видны студенту в курсе.";
    } catch { $("feedback-inbox-status").textContent = "Не удалось загрузить обращения. Повторите подключение."; }
    finally { loading = false; }
  }
  window.SKIPI_TEACHER_FEEDBACK = { start() {
    if (!window.SKIPI_SYNC?.teacherAuthenticated) return;
    $("feedback-inbox").hidden = false;
    for (const id of ["feedback-unanswered", "feedback-student", "feedback-filter-kind"]) $(id).addEventListener("change", render);
    $("feedback-inbox-refresh").addEventListener("click", refresh); refresh();
  } };
})();
