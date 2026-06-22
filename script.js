/* =========================================================
   Farmacia Añon — script
   ========================================================= */

// ⬇️⬇️⬇️  CAMBIÁ ESTE NÚMERO POR EL WHATSAPP REAL  ⬇️⬇️⬇️
// Formato: código de país + 9 + área SIN 0 + número, todo junto.
// Ejemplo CABA/GBA:  54 9 11 1234-5678  ->  "5491112345678"
const WHATSAPP_NUMERO = "5491165620043"; // 11 6562-0043

// Mensaje con el que se abre el chat
const WHATSAPP_MENSAJE = "¡Hola Farmacia Añon! Quería hacer una consulta.";

// ---------------------------------------------------------
// Arma el link wa.me y lo aplica a todos los botones [data-wa]
const waLink =
  "https://wa.me/" + WHATSAPP_NUMERO +
  "?text=" + encodeURIComponent(WHATSAPP_MENSAJE);

document.querySelectorAll("[data-wa]").forEach(function (el) {
  el.setAttribute("href", waLink);
  el.setAttribute("target", "_blank");
  el.setAttribute("rel", "noopener");
});

// Año dinámico en el footer
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ---------------------------------------------------------
// Animación de entrada: revela los bloques con fade + subida
// a medida que entran en pantalla (el hero, al cargar).
(function () {
  const els = document.querySelectorAll("[data-reveal], [data-reveal-stagger]");
  if (!els.length) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("is-in"));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const delay = el.getAttribute("data-reveal-delay");
        if (delay) el.style.transitionDelay = delay + "ms";
        el.classList.add("is-in");
        io.unobserve(el);
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -6% 0px" }
  );

  els.forEach((el) => io.observe(el));
})();
