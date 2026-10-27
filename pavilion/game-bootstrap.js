(async () => {
  let hasKey = false, play = true;
  try { hasKey = !!localStorage.getItem("skipi-studio/key"); play = localStorage.getItem("skipi-edu/mode") === "play"; } catch { /* просмотр */ }
  const editor = !new URLSearchParams(location.search).get("g") && hasKey && !play;
  window.SKIPI_FORCE_PLAY = !!window.SKIPI_SYNC_CONFIG?.url && !editor;
  if (window.SKIPI_SYNC) await window.SKIPI_SYNC.start({ editor });
  if (window.SKIPI_SYNC_CONFIG?.url && !window.SKIPI_SYNC?.enabled) {
    const button = document.getElementById("start");
    button.textContent = "Повторить подключение"; button.onclick = () => location.reload();
    const note = document.querySelector("#title .title-note");
    if (note) note.textContent = "Не удалось получить актуальное наполнение. Проверьте связь и повторите подключение.";
    return;
  }
  const script = document.createElement("script"); script.src = "game.js";
  document.body.appendChild(script);
})();
