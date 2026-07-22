/* =========================================================
   Farmacia Añon — script
   ========================================================= */

// ⬇️⬇️⬇️  CAMBIÁ ESTE NÚMERO POR EL WHATSAPP REAL  ⬇️⬇️⬇️
// Formato: código de país + 9 + área SIN 0 + número, todo junto.
// Ejemplo CABA/GBA:  54 9 11 1234-5678  ->  "5491112345678"
const WHATSAPP_NUMERO = "5491165620043"; // 11 6562-0043

// Mensaje con el que se abre el chat por defecto
const WHATSAPP_MENSAJE = "¡Hola Farmacia Añon! Quería hacer una consulta.";

// Arma un link wa.me con un mensaje arbitrario
const waHref = (message) =>
  "https://wa.me/" + WHATSAPP_NUMERO + "?text=" + encodeURIComponent(message);

// ---------------------------------------------------------
// Aplica el link wa.me por defecto a todos los botones [data-wa]
const waLink = waHref(WHATSAPP_MENSAJE);
document.querySelectorAll("[data-wa]").forEach(function (el) {
  el.setAttribute("href", waLink);
  el.setAttribute("target", "_blank");
  el.setAttribute("rel", "noopener");
});

// Año dinámico en el footer
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ---------------------------------------------------------
// Menú mobile (hamburguesa)
(function () {
  const toggle = document.getElementById("menu-toggle");
  const menu = document.getElementById("menu-mobile");
  if (!toggle || !menu) return;
  toggle.addEventListener("click", () => menu.classList.toggle("hidden"));
  // Al tocar un link del menú, se cierra.
  menu.addEventListener("click", (e) => {
    if (e.target.closest("a")) menu.classList.add("hidden");
  });
})();

// ---------------------------------------------------------
// Animación de entrada: revela los bloques con fade + subida
// a medida que entran en pantalla (el hero, al cargar).
(function () {
  const els = document.querySelectorAll("[data-reveal], [data-reveal-stagger]");
  if (!els.length) return;

  // Revela un bloque de forma ROBUSTA: la clase is-in dispara la animación CSS, y además
  // seteamos opacity/transform inline (que siempre ganan la cascada) para que el contenido
  // NUNCA quede invisible aunque una regla externa interfiera. Para stagger, sobre cada hijo.
  const show = (el) => {
    el.classList.add("is-in");
    el.style.opacity = "1";
    el.style.transform = "none";
    if (el.hasAttribute("data-reveal-stagger")) {
      for (const c of el.children) { c.style.opacity = "1"; c.style.transform = "none"; }
    }
  };

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) {
    els.forEach(show);
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const delay = el.getAttribute("data-reveal-delay");
        if (delay) el.style.transitionDelay = delay + "ms";
        show(el);
        io.unobserve(el);
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -6% 0px" }
  );

  els.forEach((el) => io.observe(el));
  // Failsafe: si el observer no dispara (o algo lo bloquea), a los 1200ms mostramos todo igual.
  setTimeout(() => els.forEach(show), 1200);
})();

// =========================================================
// Vitrina de ofertas (data real de la farmacia vía API)
// =========================================================
const API_BASE = "https://farmapp-api-production.up.railway.app";
const ANON_PHARMACY_ID = "f6664341-2449-4cf8-92a5-cfabcf1b83a6"; // Farmacia Añón (prod)
const PROMO_PAGE = 12; // cuántas tarjetas mostrar por tanda ("ver más")

const promoState = { items: [], filter: null, search: "", shown: PROMO_PAGE, cart: new Map() };
window.__promoState = promoState; // la sección del carrito lee de acá

const fmtARS = (n) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Etiqueta de la promo. Un nx cuyo total equivale a pagar M unidades enteras (M = total / precio unitario,
// entero limpio) se muestra como "NxM" (ej. "2x1", "3x2") — más claro que "-50%". Si no da entero (ej. 30% off
// llevando 2 = 1.4 unidades) usamos el label del backend ("-30%").
function promoBadge(item) {
  if (item.kind === "nx" && item.bundleQty && item.priceOriginal > 0) {
    const mExact = item.promoPrice / item.priceOriginal;
    const m = Math.round(mExact);
    if (m >= 1 && m < item.bundleQty && Math.abs(mExact - m) < 0.03) {
      return `${item.bundleQty}x${m}`;
    }
  }
  return item.promoLabel;
}

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
    return `<div class="aspect-square overflow-hidden bg-white p-2">
        <img src="${API_BASE}/media/products/${item.imageId}" alt="${escapeHtml(item.name)}" loading="lazy"
             class="h-full w-full object-contain transition duration-500 group-hover:scale-105" /></div>`;
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
    // El promoPrice ya es el total de las N unidades con el % off aplicado al total; tachamos el total
    // original (N × precio) para mostrar el ahorro. Si el badge ya dice "2x1"/"NxM", NO repetimos "Llevando N"
    // (redundante); solo lo mostramos cuando el badge cae al "-pct%" y hace falta aclarar la cantidad.
    const combo = promoBadge(item) !== item.promoLabel;
    const lead = combo ? "" : `<p class="text-sm text-neutral-500">Llevando ${item.bundleQty}</p>`;
    return `<div class="mt-1 flex min-h-[3rem] flex-col justify-end">
        ${lead}
        <div class="flex items-baseline gap-2">
          <p class="font-display text-lg font-bold text-ink">${fmtARS(item.promoPrice)}</p>
          <p class="text-sm text-neutral-400 line-through">${fmtARS(item.priceOriginal * item.bundleQty)}</p>
        </div>
      </div>`;
  }
  return `<div class="mt-1 flex min-h-[3rem] flex-col justify-end">
      <div class="flex items-baseline gap-2">
        <p class="font-display text-lg font-bold text-ink">${fmtARS(item.promoPrice)}</p>
        <p class="text-sm text-neutral-400 line-through">${fmtARS(item.priceOriginal)}</p>
      </div>
    </div>`;
}

function promoCard(item, idx) {
  const inCart = promoState.cart.has(idx);
  const badge = promoBadge(item);
  // "% OFF" en rojo de descuento (señal marketplace); combos "NxM" en verde de marca.
  const badgeClass = /%/.test(String(badge)) ? "bg-sale" : "bg-green";
  return `<article class="group flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div class="relative">
        ${promoThumb(item)}
        <span class="absolute left-2 top-2 rounded-full ${badgeClass} px-2.5 py-1 text-xs font-bold text-white shadow-sm">${escapeHtml(badge)}</span>
      </div>
      <div class="flex flex-1 flex-col p-3">
        <p class="text-xs font-medium text-neutral-400">${escapeHtml(deptoMeta(item.depto).label)}</p>
        <h3 class="mt-0.5 line-clamp-2 min-h-[2.5rem] text-sm font-semibold text-ink" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</h3>
        ${promoPriceBlock(item)}
        <button type="button" data-add="${idx}"
          class="mt-4 inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-sm font-semibold transition ${inCart ? "bg-green text-white hover:bg-green-soft" : "bg-blue text-white hover:bg-blue-dark"}">
          ${inCart ? "Agregado ✓" : "+ Agregar"}
        </button>
      </div>
    </article>`;
}

// ---- Estados vacíos (convierten la falta de resultado en un camino a WhatsApp) ----
function emptyNoFeedHtml() {
  const href = waHref("¡Hola Farmacia Añon! Quería consultar el precio de un producto.");
  return `<div class="rounded-3xl border border-dashed border-neutral-300 bg-white px-6 py-14 text-center">
      <div class="mx-auto grid h-12 w-12 place-items-center rounded-full bg-blue/10 text-blue">
        <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><path d="M7 7h.01"/></svg>
      </div>
      <h3 class="mt-4 font-display text-lg font-semibold text-ink">Las ofertas de la semana salen pronto</h3>
      <p class="mx-auto mt-1.5 max-w-md text-[15px] text-neutral-600">Mientras tanto, consultá cualquier producto y te pasamos precio y disponibilidad al toque.</p>
      <a href="${href}" target="_blank" rel="noopener" class="mt-5 inline-flex items-center gap-2 rounded-full bg-wa px-6 py-3 text-sm font-semibold text-white transition hover:bg-wa-dark">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.022z"/></svg>
        Consultá por WhatsApp
      </a>
    </div>`;
}

function emptySearchHtml(term) {
  const href = waHref(`¡Hola Farmacia Añon! ¿Tienen ${term}? ¿Me pasan precio y disponibilidad?`);
  const safe = escapeHtml(term);
  return `<div class="rounded-3xl border border-neutral-200 bg-white px-6 py-12 text-center">
      <h3 class="font-display text-lg font-semibold text-ink">No encontramos “${safe}” entre las ofertas de esta semana</h3>
      <p class="mx-auto mt-1.5 max-w-md text-[15px] text-neutral-600">Pero seguro lo tenemos en el local. Consultá precio por WhatsApp y te respondemos hoy.</p>
      <a href="${href}" target="_blank" rel="noopener" class="mt-5 inline-flex items-center gap-2 rounded-full bg-wa px-6 py-3 text-sm font-semibold text-white transition hover:bg-wa-dark">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.022z"/></svg>
        Consultar “${safe}” por WhatsApp
      </a>
    </div>`;
}

function renderChips() {
  const el = document.getElementById("promo-chips");
  if (!el) return;
  // Excluimos depto null/undefined: no tiene rubro real y su chip ("") colisiona con el de "Todos".
  const deptos = [...new Set(promoState.items.map((i) => i.depto))].filter((d) => d !== null && d !== undefined);
  if (deptos.length < 2) { el.innerHTML = ""; return; } // sin chips si hay un solo rubro
  const chip = (label, val, active) =>
    `<button type="button" data-chip="${val === null ? "" : val}" class="shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition ${active ? "bg-ink text-white" : "border border-neutral-300 bg-white text-neutral-600 hover:border-blue hover:text-blue"}">${escapeHtml(label)}</button>`;
  let html = chip("Todos", null, promoState.filter === null);
  for (const d of deptos) html += chip(deptoMeta(d).label, d, promoState.filter === d);
  el.innerHTML = html;
}

function renderGrid() {
  const grid = document.getElementById("promo-grid");
  const empty = document.getElementById("promo-empty");
  const moreBtn = document.getElementById("promo-more");
  if (!grid || !empty) return;

  // Sin feed: estado "salen pronto" → deriva a WhatsApp.
  if (!promoState.items.length) {
    grid.innerHTML = "";
    empty.innerHTML = emptyNoFeedHtml();
    if (moreBtn) moreBtn.classList.add("hidden");
    return;
  }

  const q = promoState.search.trim().toLowerCase();
  const filtered = promoState.items
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => promoState.filter === null || item.depto === promoState.filter)
    .filter(({ item }) => !q || String(item.name).toLowerCase().includes(q));

  // Búsqueda sin resultados: CTA precargado a WhatsApp con el término.
  if (!filtered.length) {
    grid.innerHTML = "";
    empty.innerHTML = q ? emptySearchHtml(promoState.search.trim()) : "";
    if (moreBtn) moreBtn.classList.add("hidden");
    return;
  }

  empty.innerHTML = "";
  const visible = filtered.slice(0, promoState.shown);
  grid.innerHTML = visible.map(({ item, idx }) => promoCard(item, idx)).join("");
  if (moreBtn) moreBtn.classList.toggle("hidden", filtered.length <= promoState.shown);
}

function renderCatalog() {
  const tools = document.getElementById("promo-tools");
  const vig = document.getElementById("promo-vigencia");
  const hasItems = promoState.items.length > 0;
  // Buscador + chips y el badge de vigencia solo tienen sentido si hay promos cargadas.
  if (tools) tools.classList.toggle("hidden", !hasItems);
  if (vig) {
    vig.classList.toggle("hidden", !hasItems);
    vig.classList.toggle("inline-flex", hasItems);
  }
  renderChips();
  renderGrid();
  if (typeof renderCart === "function") renderCart(); // definido más abajo
}
window.renderCatalog = renderCatalog;

async function loadPromos() {
  if (!ANON_PHARMACY_ID || ANON_PHARMACY_ID === "PEGAR_UUID_DE_ANON") { renderCatalog(); return; }
  try {
    // withPhoto=1: por ahora mostramos solo productos con foto real (el resto se ocultan hasta cargarles foto).
    const res = await fetch(`${API_BASE}/public/catalog/${ANON_PHARMACY_ID}/promos?limit=120&withPhoto=1`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    promoState.items = Array.isArray(data.items) ? data.items : [];
  } catch (err) {
    console.warn("[promos] no se pudo cargar el catálogo de descuentos:", err);
    promoState.items = []; // → estado vacío honesto, la landing sigue funcionando
  }
  renderCatalog();
}

// Delegación de eventos: chips y "ver más".
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

// Buscador de la vitrina: filtra las promos cargadas en vivo.
(function () {
  const input = document.getElementById("promo-search");
  if (!input) return;
  input.addEventListener("input", () => {
    promoState.search = input.value;
    promoState.shown = PROMO_PAGE;
    renderGrid();
  });
})();

loadPromos();

// =========================================================
// "Mi pedido": carrito de ofertas → mensaje de WhatsApp
// =========================================================
const MAX_CART_ITEMS = 15; // cap: mensajes wa.me muy largos se truncan en algunos teléfonos

function cartLines() {
  const lines = [];
  for (const idx of promoState.cart.keys()) {
    const it = promoState.items[idx];
    if (!it) continue;
    const badge = promoBadge(it);
    const combo = it.kind === "nx" && badge !== it.promoLabel; // badge ya dice "2x1"/"NxM"
    lines.push(
      it.kind === "nx" && !combo
        ? `• ${it.name} (${badge}), llevando ${it.bundleQty}: ${fmtARS(it.promoPrice)}`
        : `• ${it.name} (${badge}): ${fmtARS(it.promoPrice)}`,
    );
  }
  return lines;
}

// Mensaje de WhatsApp con todo el pedido (o null si está vacío).
function buildCartMessage() {
  const lines = cartLines();
  if (!lines.length) return null;
  return (
    "¡Hola Farmacia Añon! Quiero aprovechar estos descuentos:\n" +
    lines.join("\n") +
    "\n\n(precios sujetos a confirmación)"
  );
}

function renderCart() {
  const bar = document.getElementById("promo-cart-bar");
  const countEl = document.getElementById("promo-cart-count");
  const totalEl = document.getElementById("promo-cart-total");
  const headerBadge = document.getElementById("header-cart-count");
  const mobileCta = document.getElementById("mobile-cta");
  const n = promoState.cart.size;

  // Total orientativo (para nx usamos el total del combo).
  let total = 0;
  for (const idx of promoState.cart.keys()) total += promoState.items[idx]?.promoPrice || 0;

  // Badge del botón "Mi pedido" en el header.
  if (headerBadge) {
    headerBadge.textContent = String(n);
    headerBadge.classList.toggle("hidden", n === 0);
  }

  // Barra inferior (SOLO mobile): con items muestra "Enviar pedido"; sin items, CTA de consulta.
  // El flotante de WhatsApp queda siempre en desktop (ya no colisiona con la barra).
  if (bar) bar.classList.toggle("hidden", n === 0);
  if (mobileCta) mobileCta.classList.toggle("hidden", n > 0);

  if (countEl) countEl.textContent = `${n} producto${n === 1 ? "" : "s"} elegido${n === 1 ? "" : "s"}`;
  if (totalEl) totalEl.textContent = n ? `Total aprox. ${fmtARS(total)}` : "";

  // Link de envío ROBUSTO: anchor <a> con href fresco en cada render (sin window.open → no lo bloquea el navegador).
  const msg = buildCartMessage();
  document.querySelectorAll("[data-cart-send]").forEach((a) => {
    a.href = msg ? waHref(msg) : "#";
    a.classList.toggle("pointer-events-none", !msg);
    a.classList.toggle("opacity-50", !msg);
  });

  renderCartDrawer(total);
}
window.renderCart = renderCart;

// Contenido del drawer "Mi pedido": lista con quitar por item + total.
function renderCartDrawer(total) {
  const list = document.getElementById("cart-drawer-list");
  const countEl = document.getElementById("cart-drawer-count");
  const totalEl = document.getElementById("cart-drawer-total");
  const clearBtn = document.getElementById("cart-clear");
  if (!list) return;
  const n = promoState.cart.size;
  if (countEl) countEl.textContent = n ? `· ${n} producto${n === 1 ? "" : "s"}` : "";
  if (totalEl) totalEl.textContent = fmtARS(total || 0);
  if (clearBtn) clearBtn.classList.toggle("hidden", n === 0);

  if (!n) {
    list.innerHTML = `<li class="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <span class="grid h-12 w-12 place-items-center rounded-full bg-neutral-100 text-neutral-400">
          <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
        </span>
        <p class="text-[15px] font-medium text-ink">Todavía no elegiste ofertas</p>
        <a href="#descuentos" data-cart-goto class="text-sm font-semibold text-blue hover:text-blue-dark">Ver ofertas de la semana</a>
      </li>`;
    return;
  }

  const rows = [];
  for (const idx of promoState.cart.keys()) {
    const it = promoState.items[idx];
    if (!it) continue;
    const badge = promoBadge(it);
    const combo = it.kind === "nx" && badge !== it.promoLabel;
    const lead = it.kind === "nx" && !combo ? `<p class="text-xs text-neutral-500">Llevando ${it.bundleQty}</p>` : "";
    const badgeClass = /%/.test(String(badge)) ? "text-sale" : "text-green";
    rows.push(`<li class="flex items-center gap-3 py-4">
        <div class="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-neutral-200">${promoThumb(it)}</div>
        <div class="min-w-0 flex-1">
          <p class="line-clamp-2 text-sm font-semibold text-ink">${escapeHtml(it.name)}</p>
          ${lead}
          <p class="mt-0.5 text-sm"><span class="font-semibold text-ink">${fmtARS(it.promoPrice)}</span> <span class="text-xs font-bold ${badgeClass}">${escapeHtml(badge)}</span></p>
        </div>
        <button type="button" data-remove="${idx}" aria-label="Quitar" class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-400 transition hover:bg-sale/10 hover:text-sale">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </li>`);
  }
  list.innerHTML = rows.join("");
}

// Apertura / cierre del drawer.
(function () {
  const overlay = document.getElementById("cart-overlay");
  const drawer = document.getElementById("cart-drawer");
  const closeBtn = document.getElementById("cart-close");
  if (!overlay || !drawer) return;
  const open = () => {
    overlay.classList.remove("hidden");
    drawer.classList.remove("translate-x-full");
    document.body.style.overflow = "hidden";
    if (closeBtn) closeBtn.focus();
  };
  const close = () => {
    overlay.classList.add("hidden");
    drawer.classList.add("translate-x-full");
    document.body.style.overflow = "";
  };
  window.__openCart = open;
  document.getElementById("cart-open")?.addEventListener("click", open);
  document.getElementById("cart-open-bar")?.addEventListener("click", open);
  if (closeBtn) closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  drawer.addEventListener("click", (e) => { if (e.target.closest("[data-cart-goto]")) close(); });
})();

// Quitar un item / vaciar, desde el drawer.
document.addEventListener("click", (e) => {
  const rm = e.target.closest?.("[data-remove]");
  if (rm) {
    promoState.cart.delete(Number(rm.getAttribute("data-remove")));
    renderCatalog();
    return;
  }
  if (e.target.closest?.("#cart-clear")) {
    promoState.cart.clear();
    renderCatalog();
  }
});

// Handler del botón "+ Agregar" (en la grilla y en el hero). Usa el índice del item en promoState.items.
document.addEventListener("click", (e) => {
  const btn = e.target.closest?.("[data-add]");
  if (!btn) return;
  const idx = Number(btn.getAttribute("data-add"));
  let added = false;
  if (promoState.cart.has(idx)) {
    promoState.cart.delete(idx);
  } else {
    if (promoState.cart.size >= MAX_CART_ITEMS) {
      alert(`Podés elegir hasta ${MAX_CART_ITEMS} productos. Mandá este pedido y seguimos por WhatsApp.`);
      return;
    }
    promoState.cart.set(idx, true);
    added = true;
  }
  renderCatalog(); // re-render para reflejar "Agregado ✓" + actualizar barras + drawer
  if (added) {
    // Feedback: pulso del badge del header; la primera vez, abrir el drawer para enseñar dónde vive el pedido.
    const badge = document.getElementById("header-cart-count");
    badge?.animate?.(
      [{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }],
      { duration: 260, easing: "ease-out" },
    );
    if (!window.__cartHinted) { window.__cartHinted = true; window.__openCart?.(); }
  }
});

// El envío ya NO usa window.open: los botones [data-cart-send] son <a> cuyo href setea renderCart().
