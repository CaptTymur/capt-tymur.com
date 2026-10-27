/* ──────────────────────────────────────────────────────────────────────────
   АКАДЕМИЯ: УЛИЦА → КОРПУСА → КУРСЫ → РАЗДЕЛЫ

   Четыре уровня, каждый следующий лежит внутри предыдущего:

     улица       набережная, вдоль неё учебные корпуса
     корпус      дом; внутри вестибюль с дверями курсов
     курс        внутри вестибюль с дверями разделов
     раздел      коридор со стендами; содержание в content/<pavilion>.js

   Открыта только та дверь, у которой open: true.
   У раздела pavilion — имя файла содержания без расширения.
   ────────────────────────────────────────────────────────────────────────── */

window.SKIPI_ACADEMY = {
  title: "Морская академия Skipi",
  place: "Набережная",

  buildings: [
    {
      id: "b1",
      label: "Учебный корпус 1",
      address: "ул. Седова, 8",
      style: "corpus",
      open: true,
      courses: [
        {
          id: "captain",
          label: "Капитан гражданского судна",
          sub: "Курс",
          open: true,
          doors: [
            { label: "Вступление",                       open: true,  pavilion: "intro" },
            { label: "Коммуникация",                     open: true,  pavilion: "communication" },
            { label: "Коммерческий менеджмент",          open: false, pavilion: "commercial" },
            { label: "Технический менеджмент",           open: false },
            { label: "Администрирование судна",          open: false },
            { label: "Оценка рисков и принятие решений", open: false },
            { label: "Операции",                         open: false },
            { label: "Аварийные и нештатные ситуации",   open: false },
            { label: "Приём дел и начало работы",        open: false }
          ]
        },
        { id: "chief",  label: "Старший помощник",  open: false },
        {
          id: "cargo",
          label: "Грузовой офицер: балкер / сухогруз",
          sub: "Курс",
          open: true,
          doors: [
            { label: "Раздел 1", open: true, pavilion: "cargo" }
          ]
        },
        { id: "lng",    label: "LNG",               open: false },
        { id: "sailor", label: "Моряк",             open: false }
      ]
    },
    { id: "b2", label: "Учебный корпус 2", address: "ул. Седова, 10", style: "arches", open: false, courses: [] },
    { id: "b3", label: "Тренажёрный центр", address: "Береговая, 1",  style: "hall",   open: false, courses: [] }
  ]
};
