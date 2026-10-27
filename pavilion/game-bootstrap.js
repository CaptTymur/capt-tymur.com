(async () => {
  if (window.SKIPI_SYNC) await window.SKIPI_SYNC.start({ editor: false });
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
