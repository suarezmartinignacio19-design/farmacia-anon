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

// =========================================================
// Catálogo de descuentos (data real de la farmacia vía API)
// =========================================================
const API_BASE = "https://farmapp-api-production.up.railway.app";
const ANON_PHARMACY_ID = "f6664341-2449-4cf8-92a5-cfabcf1b83a6"; // Farmacia Añón (prod)
const PROMO_PAGE = 12; // cuántas tarjetas mostrar por tanda ("ver más")

const promoState = { items: [], filter: null, shown: PROMO_PAGE, cart: new Map() };
window.__promoState = promoState; // la Task 5 (carrito) lee de acá

const fmtARS = (n) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Rubro (depto SiFaCo) → etiqueta + color + ícono (SVG Lucide inline, mismo estilo que la landing).
// 0 = medicamentos (venta libre); 1-5 = no-medicamento. Fallback conservador para null/desconocido.
function deptoMeta(depto) {
  const map = {
    0: { label: "Farmacia", color: "text-blue", ring: "ring-blue/15 bg-blue/5" },
    1: { label: "Perfumería", color: "text-green", ring: "ring-green/15 bg-green/5" },
    2: { label: "Dermocosmética", color: "text-cyan", ring: "ring-cyan/15 bg-cyan/5" },
    3: { label: "Cuidado personal", color: "text-blue", ring: "ring-blue/15 bg-blue/5" },
    4: { label: "Dietética", color: "text-green", ring: "ring-green/15 bg-green/5" },
    5: { label: "Varios", color: "text-neutral-500", ring: "ring-neutral-300/40 bg-neutral-100" },
  };
  const meta = map[depto] || { label: "Promo", color: "text-neutral-500", ring: "ring-neutral-300/40 bg-neutral-100" };
  // Ícono: pastilla para farmacia (depto 0), gota para dermo (depto 2), etiqueta para el resto.
  const icons = {
    pill: '<path d="M10.5 20.5 21 10a5 5 0 0 0-7-7L3.5 13.5a5 5 0 0 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
    droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
    tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><path d="M7 7h.01"/>',
  };
  const path = depto === 0 ? icons.pill : depto === 2 ? icons.droplet : icons.tag;
  return { ...meta, iconPath: path };
}

// Bloque visual de la tarjeta: foto real si hay imageId, si no un fallback con ícono+color por rubro.
function promoThumb(item) {
  const m = deptoMeta(item.depto);
  if (item.imageId) {
    return `<div class="aspect-square overflow-hidden bg-white">
        <img src="${API_BASE}/media/products/${item.imageId}" alt="${escapeHtml(item.name)}" loading="lazy"
             class="h-full w-full object-contain" /></div>`;
  }
  return `<div class="flex aspect-square items-center justify-center ring-1 ${m.ring}">
      <svg class="h-12 w-12 ${m.color}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${m.iconPath}</svg>
    </div>`;
}

// Bloque de precio: universal = original tachado + promo; nx = "Llevando N: $total".
// Alto fijo + contenido pegado abajo (justify-end) para que la línea de precio quede a la MISMA
// altura en todas las tarjetas, tengan o no la línea "Llevando N".
function promoPriceBlock(item) {
  if (item.kind === "nx") {
    // "Llevando N": el promoPrice ya es el total de las N unidades con el % off aplicado al total.
    // Tachamos el total original (N × precio) para que se vea el ahorro real.
    return `<div class="mt-1 flex min-h-[3rem] flex-col justify-end">
        <p class="text-sm text-neutral-500">Llevando ${item.bundleQty}</p>
        <div class="flex items-baseline gap-2">
          <p class="font-display text-lg font-semibold text-ink">${fmtARS(item.promoPrice)}</p>
          <p class="text-sm text-neutral-400 line-through">${fmtARS(item.priceOriginal * item.bundleQty)}</p>
        </div>
      </div>`;
  }
  return `<div class="mt-1 flex min-h-[3rem] flex-col justify-end">
      <div class="flex items-baseline gap-2">
        <p class="font-display text-lg font-semibold text-ink">${fmtARS(item.promoPrice)}</p>
        <p class="text-sm text-neutral-400 line-through">${fmtARS(item.priceOriginal)}</p>
      </div>
    </div>`;
}

function promoCard(item, idx) {
  const inCart = promoState.cart.has(idx);
  return `<article class="flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div class="relative">
        ${promoThumb(item)}
        <span class="absolute left-2 top-2 rounded-full bg-green px-2.5 py-1 text-xs font-bold text-white shadow-sm">${escapeHtml(item.promoLabel)}</span>
      </div>
      <div class="flex flex-1 flex-col p-3">
        <p class="text-xs font-medium text-neutral-400">${escapeHtml(deptoMeta(item.depto).label)}</p>
        <h3 class="mt-0.5 line-clamp-2 min-h-[2.5rem] text-sm font-semibold text-ink" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</h3>
        ${promoPriceBlock(item)}
        <button type="button" data-add="${idx}"
          class="mt-4 inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition ${inCart ? "bg-green text-white hover:bg-green-soft" : "bg-blue text-white hover:bg-blue-dark"}">
          ${inCart ? "Agregado ✓" : "+ Agregar"}
        </button>
      </div>
    </article>`;
}

function renderChips() {
  const el = document.getElementById("promo-chips");
  if (!el) return;
  // Excluimos depto null/undefined: no tiene rubro real y su chip ("") colisiona con el de "Todos".
  const deptos = [...new Set(promoState.items.map((i) => i.depto))].filter((d) => d !== null && d !== undefined);
  if (deptos.length < 2) { el.innerHTML = ""; return; } // sin chips si hay un solo rubro
  const chip = (label, val, active) =>
    `<button type="button" data-chip="${val === null ? "" : val}" class="rounded-full px-4 py-1.5 text-sm font-semibold transition ${active ? "bg-ink text-white" : "border border-neutral-300 text-neutral-600 hover:border-blue hover:text-blue"}">${escapeHtml(label)}</button>`;
  let html = chip("Todos", null, promoState.filter === null);
  for (const d of deptos) html += chip(deptoMeta(d).label, d, promoState.filter === d);
  el.innerHTML = html;
}

function renderGrid() {
  const grid = document.getElementById("promo-grid");
  const moreBtn = document.getElementById("promo-more");
  if (!grid) return;
  const filtered = promoState.items
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => promoState.filter === null || item.depto === promoState.filter);
  const visible = filtered.slice(0, promoState.shown);
  grid.innerHTML = visible.map(({ item, idx }) => promoCard(item, idx)).join("");
  if (moreBtn) moreBtn.classList.toggle("hidden", filtered.length <= promoState.shown);
}

function renderCatalog() {
  renderChips();
  renderGrid();
  if (typeof renderCart === "function") renderCart(); // definido en la Task 5
}
window.renderCatalog = renderCatalog;

async function loadPromos() {
  const section = document.getElementById("descuentos");
  if (!section || !ANON_PHARMACY_ID || ANON_PHARMACY_ID === "PEGAR_UUID_DE_ANON") return;
  try {
    const res = await fetch(`${API_BASE}/public/catalog/${ANON_PHARMACY_ID}/promos?limit=60`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) return; // vacío → la sección queda hidden
    promoState.items = items;
    section.classList.remove("hidden");
    renderCatalog();
  } catch (err) {
    console.warn("[promos] no se pudo cargar el catálogo de descuentos:", err);
    // la sección queda hidden, la landing sigue funcionando normal
  }
}

// Delegación de eventos: chips, "ver más" y "+ Agregar" (el handler de Agregar se completa en la Task 5).
document.addEventListener("click", (e) => {
  const chip = e.target.closest?.("[data-chip]");
  if (chip) {
    const v = chip.getAttribute("data-chip");
    promoState.filter = v === "" ? null : Number(v);
    promoState.shown = PROMO_PAGE;
    renderCatalog();
    return;
  }
  if (e.target.closest?.("#promo-more")) {
    promoState.shown += PROMO_PAGE;
    renderGrid();
  }
});

loadPromos();

// =========================================================
// Carrito de descuentos → mensaje de WhatsApp
// =========================================================
const MAX_CART_ITEMS = 15; // cap: mensajes wa.me muy largos se truncan en algunos teléfonos

function cartLines() {
  const lines = [];
  for (const idx of promoState.cart.keys()) {
    const it = promoState.items[idx];
    if (!it) continue;
    lines.push(
      it.kind === "nx"
        ? `• ${it.name} (${it.promoLabel}), llevando ${it.bundleQty}: ${fmtARS(it.promoPrice)}`
        : `• ${it.name} (${it.promoLabel}): ${fmtARS(it.promoPrice)}`,
    );
  }
  return lines;
}

function renderCart() {
  const bar = document.getElementById("promo-cart-bar");
  const countEl = document.getElementById("promo-cart-count");
  const totalEl = document.getElementById("promo-cart-total");
  if (!bar || !countEl || !totalEl) return;
  const n = promoState.cart.size;
  bar.classList.toggle("hidden", n === 0);
  // Con la barra visible ocultamos el botón flotante de WhatsApp para que no se solapen (ambos fixed abajo).
  const waFloat = document.getElementById("wa-float");
  if (waFloat) waFloat.classList.toggle("hidden", n > 0);
  countEl.textContent = `${n} producto${n === 1 ? "" : "s"} elegido${n === 1 ? "" : "s"}`;
  // Total orientativo (para nx usamos el total del combo).
  let total = 0;
  for (const idx of promoState.cart.keys()) total += promoState.items[idx]?.promoPrice || 0;
  totalEl.textContent = n ? `Total aprox. ${fmtARS(total)} · precios sujetos a confirmación` : "";
}
window.renderCart = renderCart;

// Handler del botón "+ Agregar" de cada tarjeta (usa el índice del item en promoState.items).
document.addEventListener("click", (e) => {
  const btn = e.target.closest?.("[data-add]");
  if (!btn) return;
  const idx = Number(btn.getAttribute("data-add"));
  if (promoState.cart.has(idx)) {
    promoState.cart.delete(idx);
  } else {
    if (promoState.cart.size >= MAX_CART_ITEMS) {
      alert(`Podés elegir hasta ${MAX_CART_ITEMS} productos. Mandá este pedido y seguimos por WhatsApp.`);
      return;
    }
    promoState.cart.set(idx, true);
  }
  renderCatalog(); // re-render para reflejar "Agregado ✓" + actualizar la barra
});

// Enviar: arma el mensaje con todos los productos elegidos y abre WhatsApp.
document.addEventListener("click", (e) => {
  if (!e.target.closest?.("#promo-cart-send")) return;
  const lines = cartLines();
  if (!lines.length) return;
  const msg =
    "¡Hola Farmacia Añon! Quiero aprovechar estos descuentos:\n" +
    lines.join("\n") +
    "\n\n(precios sujetos a confirmación)";
  const url = "https://wa.me/" + WHATSAPP_NUMERO + "?text=" + encodeURIComponent(msg);
  window.open(url, "_blank", "noopener");
});
