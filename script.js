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

// ---- Destacados de la vitrina ----
// Dos productos elegidos a mano por la farmacia. `match` es el nombre EXACTO como lo manda SiFaCo
// (el endpoint público no expone id de producto, así que el nombre es el único enganche estable).
// `title` es el nombre legible que se muestra SOLO en la tarjeta grande: el crudo ("TUKOL FORTE
// jbex150 ml") se lee mal en tipografía grande. En la grilla el producto sigue con su nombre crudo.
// Cambiar los destacados = editar estas dos líneas y pushear.
const FEATURED = [
  { match: "TUKOL FORTE jbex150 ml", title: "Tukol Forte jarabe 150 ml" },
  { match: "BUCOANGIN FORTE caramx9", title: "Bucoangin Forte caramelos x9" },
];

// cart: Map<índice del item en items[], cantidad>. La cantidad es SIEMPRE >= 1;
// llegar a 0 significa sacar el producto del pedido (no queda una entrada en 0).
const promoState = { items: [], filter: null, search: "", shown: PROMO_PAGE, cart: new Map() };
window.__promoState = promoState; // la sección del carrito lee de acá

const MAX_CART_ITEMS = 15; // productos DISTINTOS: mensajes wa.me muy largos se truncan en algunos teléfonos
const MAX_QTY_PER_ITEM = 10; // tope por producto; se comunica deshabilitando el "+", sin alert

const fmtARS = (n) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---- Cantidades del carrito (nadie toca el Map directo salvo para vaciarlo) ----
const getQty = (idx) => promoState.cart.get(idx) || 0;

// Devuelve la cantidad que quedó. Clampea a [0, MAX_QTY_PER_ITEM] y valida el tope de
// productos distintos solo al ALTA (subir la cantidad de algo ya elegido nunca se bloquea).
function setQty(idx, q) {
  const prev = getQty(idx);
  const next = Math.max(0, Math.min(MAX_QTY_PER_ITEM, Math.round(q)));
  if (next === prev) return prev;
  if (next === 0) { promoState.cart.delete(idx); return 0; }
  if (!prev && promoState.cart.size >= MAX_CART_ITEMS) {
    alert(`Podés elegir hasta ${MAX_CART_ITEMS} productos. Mandá este pedido y seguimos por WhatsApp.`);
    return prev;
  }
  promoState.cart.set(idx, next);
  return next;
}

const cartUnits = () => { let n = 0; for (const q of promoState.cart.values()) n += q; return n; };

// Total de un ítem según cuántas CAJAS lleve. En un nx cada `bundleQty` cajas cuestan `promoPrice`
// (el combo con el % off) y las cajas sueltas que sobran van a precio unitario normal → el descuento
// recién se realiza al completar el combo: llevás 1 = precio normal, 2 = 2x1, 3 = combo + 1 normal.
// En universal el `promoPrice` ya es unitario con el descuento, así que es lineal.
function itemLineTotal(item, qty) {
  if (item.kind === "nx" && item.bundleQty > 0) {
    const bundles = Math.floor(qty / item.bundleQty);
    const loose = qty % item.bundleQty;
    return bundles * item.promoPrice + loose * item.priceOriginal;
  }
  return (item.promoPrice || 0) * qty;
}

const cartTotal = () => {
  let t = 0;
  for (const [idx, q] of promoState.cart) {
    const it = promoState.items[idx];
    if (it) t += itemLineTotal(it, q);
  }
  return t;
};

// ---- Animaciones: todo pasa por acá para respetar "prefiero menos movimiento" en un solo lugar ----
const EASE_OUT = "cubic-bezier(.16,.84,.44,1)";
const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

function anim(el, keyframes, opts) {
  if (!el || typeof el.animate !== "function" || reduceMotion()) return null;
  return el.animate(keyframes, opts);
}

// Latido corto: para números que cambian (cantidad, badge, total).
const pulse = (el) =>
  anim(el, [{ transform: "scale(1)" }, { transform: "scale(1.28)" }, { transform: "scale(1)" }], {
    duration: 260,
    easing: "ease-out",
  });

// Íconos del stepper (Lucide, mismo trazo que el resto de la landing).
const ICON_MINUS = '<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"/></svg>';
const ICON_PLUS = '<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>';
const ICON_TRASH = '<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

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

// Microcopy que explica el mecanismo de un nx en la card/carrito (el precio titular es el unitario
// normal; el ahorro se realiza al completar el combo). Si el badge quedó "NxM" decimos "Llevando N
// pagás M"; si cayó al "-pct%" (combo no entero) alcanza con aclarar la cantidad ("Llevando N").
function promoMechanic(item) {
  if (item.kind !== "nx" || !item.bundleQty || !(item.priceOriginal > 0)) return "";
  if (promoBadge(item) !== item.promoLabel) {
    const m = Math.round(item.promoPrice / item.priceOriginal);
    return `Llevando ${item.bundleQty} pagás ${m}`;
  }
  return `Llevando ${item.bundleQty}`;
}

// Nombres comparables: SiFaCo cambia mayúsculas y espaciado sin avisar, y eso no debería
// desenganchar un destacado.
const normName = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// % de descuento, para ordenar el fallback. Sale del label del backend ("-30%"); un nx cuyo badge
// es "2x1" igual tiene promoLabel "-50%". Lo que no matchea vale 0 y queda último.
const offPct = (item) => {
  const m = /-\s*(\d+)\s*%/.exec(String(item?.promoLabel ?? ""));
  return m ? Number(m[1]) : 0;
};

// Índices (en promoState.items) de los destacados a mostrar. Primero los elegidos a mano que estén
// en el feed; los que falten (sin stock, sin promo, sin foto, o nombre cambiado en SiFaCo) se
// completan con el mayor descuento disponible. Así la banda siempre muestra 2, nunca queda un
// hueco, y ningún dato sale de otro lado que no sea el feed.
function featuredIdxs() {
  const used = new Set();
  const out = [];
  for (const f of FEATURED) {
    const want = normName(f.match);
    const idx = promoState.items.findIndex((it, i) => !used.has(i) && normName(it.name) === want);
    if (idx === -1) {
      console.warn(`[promos] destacado fuera del feed: "${f.match}". Entra el de mayor descuento.`);
      continue;
    }
    used.add(idx);
    out.push({ idx, title: f.title });
  }
  // Relleno por mayor descuento para los que no se encontraron.
  if (out.length < FEATURED.length) {
    const rest = promoState.items
      .map((_, i) => i)
      .filter((i) => !used.has(i))
      .sort((a, b) => offPct(promoState.items[b]) - offPct(promoState.items[a]));
    for (const i of rest) {
      if (out.length >= FEATURED.length) break;
      used.add(i);
      out.push({ idx: i, title: null }); // sin title: usa el nombre crudo del feed
    }
  }
  return out;
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
function promoThumb(item, size = "sm") {
  const m = deptoMeta(item.depto);
  if (item.imageId) {
    // Skeleton debajo + fade de la foto al cargar (onload marca el contenedor; onerror deja el
    // skeleton quieto en gris en vez de brillar para siempre por una imagen que no existe).
    return `<div class="thumb relative aspect-square overflow-hidden bg-white p-2">
        <span class="thumb-skel absolute inset-0" aria-hidden="true"></span>
        <img src="${API_BASE}/media/products/${item.imageId}" alt="${escapeHtml(item.name)}" loading="lazy" decoding="async"
             onload="this.closest('.thumb').classList.add('is-ready')"
             onerror="this.closest('.thumb').classList.add('thumb-error')"
             class="thumb-img relative h-full w-full object-contain group-hover:scale-105" /></div>`;
  }
  return `<div class="flex aspect-square items-center justify-center ring-1 ${m.ring}">
      <svg class="${size === "lg" ? "h-16 w-16" : "h-12 w-12"} ${m.color}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${m.iconPath}</svg>
    </div>`;
}

// Bloque de precio: universal = original tachado + promo; nx = "Llevando N: $total".
// Alto fijo + contenido pegado abajo (justify-end) para que la línea de precio quede a la MISMA
// altura en todas las tarjetas, tengan o no la línea "Llevando N".
function promoPriceBlock(item, size = "sm") {
  // En la tarjeta grande el precio manda, y no hace falta el alto fijo que alinea la grilla.
  const priceClass = size === "lg" ? "text-2xl sm:text-3xl" : "text-lg";
  const boxClass = size === "lg" ? "mt-2 flex flex-col" : "mt-1 flex min-h-[3rem] flex-col justify-end";
  // En la grande el precio es tan ancho que en celular no entra en la misma línea que el tachado:
  // que baje en vez de empujar la tarjeta. La chica no se toca (ya entra y está aprobada así).
  const rowClass = size === "lg" ? "flex flex-wrap items-baseline gap-x-2" : "flex items-baseline gap-2";
  if (item.kind === "nx") {
    // Titular = precio NORMAL de una caja (lo que se paga por la 1ª); NO tachamos nada, porque una caja
    // suelta no tiene descuento. El 2x1 se realiza en el carrito al completar el combo; la microcopy
    // explica el mecanismo. Verde cuando es un "NxM" (value prop), neutro cuando el badge ya dice "-pct%".
    const combo = promoBadge(item) !== item.promoLabel;
    const mechClass = combo ? "text-green" : "text-neutral-500";
    return `<div class="${boxClass}">
        <div class="${rowClass}">
          <p class="font-display ${priceClass} font-bold text-ink">${fmtARS(item.priceOriginal)}</p>
        </div>
        <p class="text-sm font-semibold ${mechClass}">${promoMechanic(item)}</p>
      </div>`;
  }
  return `<div class="${boxClass}">
      <div class="${rowClass}">
        <p class="font-display ${priceClass} font-bold text-ink">${fmtARS(item.promoPrice)}</p>
        <p class="text-sm text-neutral-400 line-through">${fmtARS(item.priceOriginal)}</p>
      </div>
    </div>`;
}

// Control de la tarjeta: botón "+ Agregar" si no está en el pedido, stepper "− n +" si ya está.
// Se re-renderiza solo (sin tocar la foto) cuando cambia la cantidad.
function cardControlHtml(idx) {
  const qty = getQty(idx);
  if (!qty) {
    return `<button type="button" data-add="${idx}"
        class="flex w-full items-center justify-center gap-1.5 rounded-full bg-blue px-3 py-3 text-sm font-semibold text-white transition hover:bg-blue-dark active:scale-95">
        + Agregar
      </button>`;
  }
  const atMax = qty >= MAX_QTY_PER_ITEM;
  // En 1, el "−" es un tacho: deja claro que el próximo toque saca el producto del pedido.
  return `<div class="flex items-center justify-between rounded-full bg-green px-1 py-1 text-white">
      <button type="button" data-qty-dec="${idx}" aria-label="${qty === 1 ? "Quitar del pedido" : "Quitar uno"}"
        class="grid h-11 w-11 place-items-center rounded-full transition hover:bg-white/20 active:scale-90">${qty === 1 ? ICON_TRASH : ICON_MINUS}</button>
      <span data-qty-value="${idx}" aria-live="polite" class="min-w-[2ch] text-center text-base font-bold tabular-nums">${qty}</span>
      <button type="button" data-qty-inc="${idx}" aria-label="Agregar uno" ${atMax ? "disabled" : ""}
        class="grid h-11 w-11 place-items-center rounded-full transition hover:bg-white/20 active:scale-90 ${atMax ? "cursor-not-allowed opacity-40" : ""}">${ICON_PLUS}</button>
    </div>`;
}

// Tarjeta destacada: horizontal, foto grande a la izquierda. Comparte `data-cart-ctl="${idx}"` con
// su gemela de la grilla, así syncCard mantiene los dos controles en el mismo estado sin código extra.
function featuredCard(item, idx, title) {
  const badge = promoBadge(item);
  const badgeClass = /%/.test(String(badge)) ? "bg-sale" : "bg-green";
  // `title` es el nombre limpio elegido a mano; si el producto entró por fallback no hay, y va el crudo.
  const shown = title || item.name;
  return `<article class="promo-card group flex overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div class="relative w-2/5 shrink-0 self-start">
        ${promoThumb(item, "lg")}
        <span class="absolute left-2 top-2 rounded-full ${badgeClass} px-3 py-1 text-sm font-bold text-white shadow-sm">${escapeHtml(badge)}</span>
      </div>
      <div class="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
        <p class="text-xs font-medium text-neutral-400">${escapeHtml(deptoMeta(item.depto).label)}</p>
        <h3 class="mt-1 break-words font-display text-lg font-bold leading-tight text-ink sm:text-xl" title="${escapeHtml(item.name)}">${escapeHtml(shown)}</h3>
        ${promoPriceBlock(item, "lg")}
        <div class="mt-auto pt-4" data-cart-ctl="${idx}">${cardControlHtml(idx)}</div>
      </div>
    </article>`;
}

// La banda es editorial y fija: cuando el visitante busca o filtra por rubro está en modo búsqueda,
// y dos productos clavados arriba serían ruido. Vuelve al tocar "Todos" o al vaciar el buscador.
function renderFeatured() {
  const host = document.getElementById("promo-featured");
  if (!host) return;
  const browsing = promoState.filter === null && !promoState.search.trim();
  const picks = promoState.items.length && browsing ? featuredIdxs() : [];
  host.classList.toggle("hidden", !picks.length);
  host.innerHTML = picks.length
    ? `<div class="grid gap-3 sm:gap-4 md:grid-cols-2">${picks
        .map(({ idx, title }) => featuredCard(promoState.items[idx], idx, title))
        .join("")}</div>`
    : "";
}

function promoCard(item, idx, pos = 0) {
  const badge = promoBadge(item);
  // "% OFF" en rojo de descuento (señal marketplace); combos "NxM" en verde de marca.
  const badgeClass = /%/.test(String(badge)) ? "bg-sale" : "bg-green";
  // Entrada escalonada, con tope: la tanda 9+ no puede esperar medio segundo para aparecer.
  const delay = Math.min(pos, 7) * 45;
  return `<article style="animation-delay:${delay}ms" class="promo-card group flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div class="relative">
        ${promoThumb(item)}
        <span class="absolute left-2 top-2 rounded-full ${badgeClass} px-2.5 py-1 text-xs font-bold text-white shadow-sm">${escapeHtml(badge)}</span>
      </div>
      <div class="flex flex-1 flex-col p-3">
        <p class="text-xs font-medium text-neutral-400">${escapeHtml(deptoMeta(item.depto).label)}</p>
        <h3 class="mt-0.5 line-clamp-2 min-h-[2.5rem] text-sm font-semibold text-ink" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</h3>
        ${promoPriceBlock(item)}
        <div class="mt-4" data-cart-ctl="${idx}">${cardControlHtml(idx)}</div>
      </div>
    </article>`;
}

// Refresca SOLO el control de una tarjeta (o de todas). Clave: cambiar la cantidad no vuelve a
// pintar la grilla entera, así la foto no se recarga ni se re-dispara la animación de entrada.
function syncCard(idx) {
  // querySelectorAll y no querySelector: si mañana el mismo producto aparece dos veces
  // (grilla + destacado del hero), los dos controles quedan en el mismo estado.
  document.querySelectorAll(`[data-cart-ctl="${idx}"]`).forEach((host) => {
    host.innerHTML = cardControlHtml(idx);
  });
}

function syncAllCards() {
  document.querySelectorAll("[data-cart-ctl]").forEach((host) => {
    host.innerHTML = cardControlHtml(Number(host.getAttribute("data-cart-ctl")));
  });
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

let gridSig = null; // firma (filtro|búsqueda) del último render, para distinguir "ver más" de un filtro nuevo

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

  // "Ver más" con el mismo filtro/búsqueda: agregamos SOLO la tanda nueva. Repintar todo
  // recargaría las fotos ya visibles y volvería a animar tarjetas que el usuario ya vio.
  const sig = `${promoState.filter}|${q}`;
  const rendered = grid.children.length;
  if (sig === gridSig && rendered && visible.length > rendered) {
    const delta = visible.slice(rendered).map(({ item, idx }, i) => promoCard(item, idx, i)).join("");
    grid.insertAdjacentHTML("beforeend", delta);
  } else {
    grid.innerHTML = visible.map(({ item, idx }, i) => promoCard(item, idx, i)).join("");
  }
  gridSig = sig;

  if (moreBtn) moreBtn.classList.toggle("hidden", filtered.length <= promoState.shown);
}

function renderCatalog() {
  const tools = document.getElementById("promo-tools");
  const hasItems = promoState.items.length > 0;
  // Buscador + chips solo tienen sentido si hay promos cargadas.
  if (tools) tools.classList.toggle("hidden", !hasItems);
  renderChips();
  renderFeatured();
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
    // renderFeatured y no renderCatalog: la banda tiene que esconderse al buscar, pero repintar los
    // chips en cada tecla es al pedo (y hace parpadear el chip activo).
    renderFeatured();
    renderGrid();
  });
})();

loadPromos();

// =========================================================
// "Mi pedido": carrito de ofertas → mensaje de WhatsApp
// =========================================================
// Una línea por producto: qué se lleva y cuánto. SIN precios, a propósito: el precio lo
// confirma la farmacia al responder, así el mensaje no queda atado a un número que puede
// haber cambiado. Con cantidad 1 no aparece el "xN"; en combos aclaramos las unidades.
function cartLines() {
  const lines = [];
  for (const [idx, qty] of promoState.cart) {
    const it = promoState.items[idx];
    if (!it) continue;
    const badge = promoBadge(it);
    // La cantidad ya cuenta CAJAS. El badge ("2x1"/"-30%") le dice a la farmacia qué promo aplica;
    // el total exacto lo confirma la farmacia al responder (por eso el mensaje no lleva precios).
    lines.push(qty === 1 ? `• ${it.name} (${badge})` : `• ${it.name} (${badge}) x${qty}`);
  }
  return lines;
}

// Mensaje de WhatsApp con todo el pedido (o null si está vacío).
function buildCartMessage() {
  const lines = cartLines();
  if (!lines.length) return null;
  return "¡Hola Farmacia Añon! Quiero aprovechar estos descuentos:\n" + lines.join("\n");
}

let barWasVisible = false; // para animar la barra mobile solo cuando APARECE

function renderCart() {
  const bar = document.getElementById("promo-cart-bar");
  const countEl = document.getElementById("promo-cart-count");
  const totalEl = document.getElementById("promo-cart-total");
  const headerBadge = document.getElementById("header-cart-count");
  const mobileCta = document.getElementById("mobile-cta");
  const n = cartUnits(); // unidades totales, no productos distintos

  // Total orientativo (nx: el 2x1 se realiza por cada combo de cajas completo; ver itemLineTotal).
  const total = cartTotal();

  // Badge del botón "Mi pedido" en el header.
  if (headerBadge) {
    headerBadge.textContent = String(n);
    headerBadge.classList.toggle("hidden", n === 0);
  }

  // Barra inferior (SOLO mobile): con items muestra "Enviar pedido"; sin items, CTA de consulta.
  // El flotante de WhatsApp queda siempre en desktop (ya no colisiona con la barra).
  if (bar) {
    bar.classList.toggle("hidden", n === 0);
    if (n > 0 && !barWasVisible) anim(bar, [{ transform: "translateY(115%)" }, { transform: "none" }], { duration: 340, easing: EASE_OUT });
    barWasVisible = n > 0;
  }
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

// Cuerpo de una fila del drawer (todo menos la foto): datos + stepper. Se parchea solo cuando
// cambia la cantidad, así la <img> nunca se vuelve a pedir ni parpadea.
function cartRowBodyHtml(idx) {
  const it = promoState.items[idx];
  if (!it) return "";
  const qty = getQty(idx);
  const badge = promoBadge(it);
  const badgeClass = /%/.test(String(badge)) ? "text-sale" : "text-green";
  // nx: el efectivo por caja varía según cuántos combos se completen, así que en vez de "(x c/u)"
  // mostramos el mecanismo ("Llevando 2 pagás 1"). Universal: precio unitario constante → "(x c/u)".
  const sub =
    it.kind === "nx"
      ? ` <span class="text-xs text-neutral-500">${promoMechanic(it)}</span>`
      : qty > 1
        ? ` <span class="text-xs text-neutral-500">(${fmtARS(it.promoPrice)} c/u)</span>`
        : "";
  const atMax = qty >= MAX_QTY_PER_ITEM;
  return `<div class="min-w-0 flex-1">
      <p class="line-clamp-2 text-sm font-semibold text-ink">${escapeHtml(it.name)}</p>
      <p class="mt-0.5 text-sm"><span class="font-semibold text-ink">${fmtARS(itemLineTotal(it, qty))}</span> <span class="text-xs font-bold ${badgeClass}">${escapeHtml(badge)}</span>${sub}</p>
    </div>
    <div class="flex shrink-0 items-center gap-1 rounded-full bg-neutral-100 p-1">
      <button type="button" data-qty-dec="${idx}" aria-label="${qty === 1 ? "Quitar del pedido" : "Quitar uno"}"
        class="grid h-11 w-11 place-items-center rounded-full text-neutral-500 transition hover:bg-white hover:text-sale hover:shadow-sm active:scale-90">${qty === 1 ? ICON_TRASH : ICON_MINUS}</button>
      <span data-qty-value="${idx}" aria-live="polite" class="min-w-[2ch] text-center text-base font-bold tabular-nums text-ink">${qty}</span>
      <button type="button" data-qty-inc="${idx}" aria-label="Agregar uno" ${atMax ? "disabled" : ""}
        class="grid h-11 w-11 place-items-center rounded-full text-neutral-500 transition hover:bg-white hover:text-blue hover:shadow-sm active:scale-90 ${atMax ? "cursor-not-allowed opacity-40" : ""}">${ICON_PLUS}</button>
    </div>`;
}

let drawerKeys = ""; // qué productos hay pintados en el drawer; si no cambian, parcheamos en vez de repintar

// Contenido del drawer "Mi pedido": lista con stepper por item + total.
function renderCartDrawer(total) {
  const list = document.getElementById("cart-drawer-list");
  const countEl = document.getElementById("cart-drawer-count");
  const totalEl = document.getElementById("cart-drawer-total");
  const clearBtn = document.getElementById("cart-clear");
  if (!list) return;
  const n = promoState.cart.size;
  const units = cartUnits();
  if (countEl) countEl.textContent = units ? `· ${units} producto${units === 1 ? "" : "s"}` : "";
  if (totalEl) {
    const next = fmtARS(total || 0);
    if (totalEl.textContent !== next && units) pulse(totalEl);
    totalEl.textContent = next;
  }
  if (clearBtn) clearBtn.classList.toggle("hidden", n === 0);

  if (!n) {
    list.innerHTML = `<li class="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <span class="grid h-12 w-12 place-items-center rounded-full bg-neutral-100 text-neutral-400">
          <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
        </span>
        <p class="text-[15px] font-medium text-ink">Todavía no elegiste ofertas</p>
        <a href="#descuentos" data-cart-goto class="text-sm font-semibold text-blue hover:text-blue-dark">Ver ofertas de la semana</a>
      </li>`;
    drawerKeys = "";
    return;
  }

  // Mismos productos que en el último pintado: solo cambió alguna cantidad → parche quirúrgico.
  const keys = [...promoState.cart.keys()].join(",");
  if (keys === drawerKeys) {
    for (const idx of promoState.cart.keys()) {
      const body = list.querySelector(`[data-cart-row="${idx}"] [data-row-body]`);
      if (body) body.innerHTML = cartRowBodyHtml(idx);
    }
    return;
  }

  const prev = new Set(drawerKeys ? drawerKeys.split(",").map(Number) : []);
  const rows = [];
  for (const idx of promoState.cart.keys()) {
    const it = promoState.items[idx];
    if (!it) continue;
    rows.push(`<li data-cart-row="${idx}" class="flex items-center gap-3 py-4">
        <div class="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-neutral-200">${promoThumb(it)}</div>
        <div data-row-body class="flex min-w-0 flex-1 items-center gap-3">${cartRowBodyHtml(idx)}</div>
      </li>`);
  }
  list.innerHTML = rows.join("");
  drawerKeys = keys;

  // Entra solo lo NUEVO: si agregás un producto con el drawer abierto, las filas que ya estaban no parpadean.
  for (const idx of promoState.cart.keys()) {
    if (prev.has(idx)) continue;
    anim(list.querySelector(`[data-cart-row="${idx}"]`), [
      { opacity: 0, transform: "translateY(10px)" },
      { opacity: 1, transform: "none" },
    ], { duration: 340, easing: EASE_OUT });
  }
}

// Apertura / cierre del drawer.
(function () {
  const overlay = document.getElementById("cart-overlay");
  const drawer = document.getElementById("cart-drawer");
  const closeBtn = document.getElementById("cart-close");
  if (!overlay || !drawer) return;
  let hideTimer = null; // el overlay se oculta recién cuando termina el fade
  const open = () => {
    clearTimeout(hideTimer);
    overlay.classList.remove("hidden");
    requestAnimationFrame(() => overlay.classList.add("is-open")); // un frame para que el fade arranque en 0
    drawer.classList.remove("translate-x-full");
    document.body.style.overflow = "hidden";
    if (closeBtn) closeBtn.focus();
    // Las filas entran escalonadas detrás del drawer, como si se acomodaran solas.
    drawer.querySelectorAll("#cart-drawer-list > li").forEach((li, i) =>
      anim(li, [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], {
        duration: 360,
        delay: 90 + Math.min(i, 6) * 50,
        easing: EASE_OUT,
        fill: "backwards",
      }),
    );
  };
  const close = () => {
    clearTimeout(hideTimer);
    overlay.classList.remove("is-open");
    drawer.classList.add("translate-x-full");
    document.body.style.overflow = "";
    hideTimer = setTimeout(() => overlay.classList.add("hidden"), reduceMotion() ? 0 : 320);
  };
  window.__openCart = open;
  document.getElementById("cart-open")?.addEventListener("click", open);
  document.getElementById("cart-open-bar")?.addEventListener("click", open);
  if (closeBtn) closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  drawer.addEventListener("click", (e) => { if (e.target.closest("[data-cart-goto]")) close(); });
})();

// =========================================================
// Mutaciones del carrito (grilla + drawer comparten handlers)
// =========================================================

// Envuelve una acción para que corra UNA sola vez, la dispare la animación o la red de seguridad.
const once = (fn) => { let done = false; return () => { if (done) return; done = true; fn(); }; };

// La fila colapsa (alto + padding a 0) y se va hacia la derecha antes de desaparecer del DOM.
function animateRowOut(li, delay = 0) {
  const h = li.getBoundingClientRect().height;
  if (!h) return null;
  li.style.overflow = "hidden";
  return anim(li, [
    { height: `${h}px`, opacity: 1, transform: "none", paddingTop: "1rem", paddingBottom: "1rem" },
    { height: "0px", opacity: 0, transform: "translateX(28px)", paddingTop: "0px", paddingBottom: "0px" },
  ], { duration: 260, delay, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
}

const pulseQty = (idx) => document.querySelectorAll(`[data-qty-value="${idx}"]`).forEach(pulse);
const pulseCartBadge = () => pulse(document.getElementById("header-cart-count"));

function addToCart(idx) {
  if (setQty(idx, 1) !== 1) return; // no entró: tope de productos distintos (setQty ya avisó)
  syncCard(idx);
  renderCart();
  // El botón se convierte en stepper: un pop chiquito para que el ojo siga el cambio.
  anim(document.querySelector(`[data-cart-ctl="${idx}"]`), [
    { transform: "scale(.88)", opacity: 0.35 },
    { transform: "scale(1)", opacity: 1 },
  ], { duration: 240, easing: EASE_OUT });
  pulseCartBadge();
  // La primera vez abrimos el drawer para enseñar dónde vive el pedido.
  if (!window.__cartHinted) { window.__cartHinted = true; window.__openCart?.(); }
}

function changeQty(idx, delta, srcEl) {
  const prev = getQty(idx);
  if (prev + delta <= 0) { removeFromCart(idx, srcEl); return; }
  if (setQty(idx, prev + delta) === prev) return; // topeado: nada que re-pintar
  syncCard(idx);
  renderCart();
  pulseQty(idx);
  pulseCartBadge();
}

function removeFromCart(idx, srcEl) {
  const apply = once(() => { setQty(idx, 0); syncCard(idx); renderCart(); });
  const li = srcEl?.closest?.("li[data-cart-row]") || document.querySelector(`li[data-cart-row="${idx}"]`);
  const out = li ? animateRowOut(li) : null;
  if (!out) { apply(); return; }
  out.onfinish = apply;
  setTimeout(apply, 400); // red de seguridad: si la animación se cancela, el item se saca igual
}

function clearCart() {
  const rows = [...document.querySelectorAll("li[data-cart-row]")];
  const apply = once(() => { promoState.cart.clear(); syncAllCards(); renderCart(); });
  if (!rows.length || reduceMotion()) { apply(); return; }
  rows.forEach((li, i) => animateRowOut(li, Math.min(i, 6) * 45));
  setTimeout(apply, 260 + Math.min(rows.length - 1, 6) * 45 + 40);
}

document.addEventListener("click", (e) => {
  const t = e.target;
  const inc = t.closest?.("[data-qty-inc]");
  if (inc) { changeQty(Number(inc.getAttribute("data-qty-inc")), 1, inc); return; }
  const dec = t.closest?.("[data-qty-dec]");
  if (dec) { changeQty(Number(dec.getAttribute("data-qty-dec")), -1, dec); return; }
  const add = t.closest?.("[data-add]");
  if (add) { addToCart(Number(add.getAttribute("data-add"))); return; }
  if (t.closest?.("#cart-clear")) clearCart();
});

// El envío ya NO usa window.open: los botones [data-cart-send] son <a> cuyo href setea renderCart().
