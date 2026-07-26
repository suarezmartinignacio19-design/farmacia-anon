# Dos productos destacados al inicio del catálogo: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poner dos tarjetas grandes, elegidas a mano, arriba del catálogo de ofertas de farmacia-anon.com.

**Architecture:** Un bloque nuevo `#promo-featured` en `index.html` y una función `renderFeatured()` en `script.js` que corre junto a `renderChips()` y `renderGrid()`. Los destacados se enganchan por nombre exacto contra el feed que ya trae `loadPromos()`; no se toca el endpoint, ni la grilla, ni el carrito. Las piezas visuales existentes (`promoThumb`, `promoPriceBlock`, `cardControlHtml`) se reusan parametrizando el tamaño.

**Tech Stack:** HTML estático + Tailwind Play CDN + JavaScript vanilla. Sin build, sin bundler, sin framework de tests. Deploy = `git push origin main` a Cloudflare Pages.

## Global Constraints

- **Sin build:** todo tiene que funcionar abriendo `index.html` directo en el browser. No agregar dependencias, imports ni pasos de compilación.
- **Cero em dash (`—`) en copy visible.** Aplica a todo texto que vea un cliente en la landing.
- **Ningún precio escrito a mano.** Todo dato visible sale del endpoint `/public/catalog/:pharmacyId/promos`. Si el dato no está, la tarjeta no se muestra.
- **No tocar la API.** El endpoint público queda exactamente como está.
- **El feed no trae id de producto.** Los campos disponibles por item son: `name`, `depto`, `kind`, `promoLabel`, `priceOriginal`, `promoPrice`, `bundleQty`, `imageId`.
- **`idx` es sagrado:** el índice de un producto es su posición en `promoState.items`. El carrito (`promoState.cart`) se referencia por ese índice. Una tarjeta destacada usa el mismo `idx` que su gemela de la grilla, nunca uno nuevo.
- **Verificación en browser, no unitaria.** El proyecto no tiene framework de tests. Cada tarea se valida corriendo la landing contra el feed real de producción.

---

### Task 0: Dejar el rediseño marketplace en su propio commit

El working tree tiene 311 líneas sin commitear (`index.html`, `script.js`) del rediseño marketplace, más su spec sin trackear. El dueño ya decidió que sale al aire junto con los destacados. Se commitea **antes** de empezar, para que los cambios de destacados queden legibles encima en vez de mezclados con el rediseño.

**Files:**
- Commit: `index.html`, `script.js`, `docs/superpowers/specs/2026-07-22-marketplace-redesign-design.md`

**Interfaces:**
- Consumes: nada.
- Produces: un working tree limpio sobre el que aplicar los destacados.

- [ ] **Step 1: Confirmar que el sitio carga antes de congelar el estado**

Abrir `index.html` en el browser y verificar que la vitrina de ofertas pinta tarjetas con foto y precio (el feed de producción está vivo).

Si la vitrina aparece vacía o la consola tira errores, **parar y avisar**: el WIP está roto y no hay que commitearlo así.

- [ ] **Step 2: Commit**

```bash
git add index.html script.js docs/superpowers/specs/2026-07-22-marketplace-redesign-design.md
git commit -m "feat(landing): rediseño marketplace de la vitrina (buscador, chips, estados vacíos)"
```

- [ ] **Step 3: Verificar que el tree quedó limpio**

Run: `git status --short`
Expected: sin salida.

---

### Task 1: Selección de los destacados

La lógica pura: qué dos productos van, con el fallback cuando alguno no está en el feed. Todavía no dibuja nada.

**Files:**
- Modify: `script.js` (constante nueva después de `PROMO_PAGE` en la línea 92; helpers nuevos después de `promoMechanic`, que termina en la línea 195)

**Interfaces:**
- Consumes: `promoState.items` (array del feed), `item.name`, `item.promoLabel`.
- Produces:
  - `FEATURED: Array<{match: string, title: string}>`
  - `normName(s: unknown) => string`
  - `offPct(item) => number`
  - `featuredIdxs() => Array<{idx: number, title: string|null}>` con exactamente `FEATURED.length` entradas mientras el feed tenga al menos esa cantidad de items.

- [ ] **Step 1: Agregar la constante `FEATURED`**

En `script.js`, inmediatamente después de la línea `const PROMO_PAGE = 12; // cuántas tarjetas mostrar por tanda ("ver más")`:

```js

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
```

- [ ] **Step 2: Agregar los helpers de selección**

En `script.js`, después de la función `promoMechanic` (termina con `}` en la línea 195) y antes del comentario `// Rubro (depto SiFaCo) → etiqueta + color + ícono`:

```js

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
```

- [ ] **Step 3: Verificar que el archivo sigue siendo JavaScript válido**

Run: `node --check script.js`
Expected: sin salida (exit 0). Cualquier salida es un error de sintaxis que hay que arreglar antes de seguir.

- [ ] **Step 4: Verificar la selección contra el feed real, en el browser**

Abrir `index.html`, esperar que cargue la vitrina, y correr en la consola:

```js
featuredIdxs().map(({idx, title}) => ({ idx, title, name: __promoState.items[idx].name, off: __promoState.items[idx].promoLabel }))
```

Expected: dos entradas, con `name` = `"TUKOL FORTE jbex150 ml"` y `"BUCOANGIN FORTE caramx9"`, y `title` con los nombres limpios. Sin `console.warn`.

- [ ] **Step 5: Verificar el fallback**

En la misma consola, romper a propósito uno de los matches y volver a pedir la selección:

```js
FEATURED[0].match = "PRODUCTO QUE NO EXISTE";
featuredIdxs().map(({idx, title}) => ({ title, name: __promoState.items[idx].name, off: __promoState.items[idx].promoLabel }));
```

Expected: sigue devolviendo dos entradas. La primera es BUCOANGIN (el destacado que sí está) y la segunda es un producto con el descuento más alto del feed (`-50%`), con `title: null`. Aparece el `console.warn` con el nombre buscado.

Después recargar la página para descartar el cambio.

- [ ] **Step 6: Commit**

```bash
git add script.js
git commit -m "feat(landing): selección de los 2 destacados con fallback por mayor descuento"
```

---

### Task 2: La tarjeta destacada y su render

Dibuja la banda. Al terminar esta tarea los destacados se ven en la landing.

**Files:**
- Modify: `script.js` (`promoThumb` línea 220, `promoPriceBlock` línea 240, `renderCatalog` línea 409; funciones nuevas antes de `promoCard` en la línea 283)
- Modify: `index.html` (bloque nuevo entre las líneas 266 y 268)

**Interfaces:**
- Consumes: `featuredIdxs()`, `promoBadge(item)`, `deptoMeta(depto)`, `cardControlHtml(idx)`, `escapeHtml(s)`, `promoState`.
- Produces:
  - `promoThumb(item, size?: "sm"|"lg")` (el segundo parámetro es nuevo; los llamadores existentes no cambian)
  - `promoPriceBlock(item, size?: "sm"|"lg")` (idem)
  - `featuredCard(item, idx, title) => string`
  - `renderFeatured() => void`

- [ ] **Step 1: Parametrizar el tamaño en `promoThumb`**

En `script.js`, cambiar la firma y el ícono del fallback. Reemplazar:

```js
function promoThumb(item) {
  const m = deptoMeta(item.depto);
```

por:

```js
function promoThumb(item, size = "sm") {
  const m = deptoMeta(item.depto);
```

y en la misma función reemplazar:

```js
        <svg class="h-12 w-12 ${m.color}"
```

por:

```js
        <svg class="${size === "lg" ? "h-16 w-16" : "h-12 w-12"} ${m.color}"
```

- [ ] **Step 2: Parametrizar el tamaño en `promoPriceBlock`**

Reemplazar la firma:

```js
function promoPriceBlock(item) {
  if (item.kind === "nx") {
```

por:

```js
function promoPriceBlock(item, size = "sm") {
  // En la tarjeta grande el precio manda, y no hace falta el alto fijo que alinea la grilla.
  const priceClass = size === "lg" ? "text-2xl sm:text-3xl" : "text-lg";
  const boxClass = size === "lg" ? "mt-2 flex flex-col" : "mt-1 flex min-h-[3rem] flex-col justify-end";
  if (item.kind === "nx") {
```

Después, dentro de esa misma función, reemplazar las dos aperturas de bloque y las dos líneas de precio. La rama `nx`:

```js
    return `<div class="mt-1 flex min-h-[3rem] flex-col justify-end">
        <div class="flex items-baseline gap-2">
          <p class="font-display text-lg font-bold text-ink">${fmtARS(item.priceOriginal)}</p>
        </div>
        <p class="text-sm font-semibold ${mechClass}">${promoMechanic(item)}</p>
      </div>`;
```

pasa a:

```js
    return `<div class="${boxClass}">
        <div class="flex items-baseline gap-2">
          <p class="font-display ${priceClass} font-bold text-ink">${fmtARS(item.priceOriginal)}</p>
        </div>
        <p class="text-sm font-semibold ${mechClass}">${promoMechanic(item)}</p>
      </div>`;
```

y la rama universal:

```js
  return `<div class="mt-1 flex min-h-[3rem] flex-col justify-end">
      <div class="flex items-baseline gap-2">
        <p class="font-display text-lg font-bold text-ink">${fmtARS(item.promoPrice)}</p>
        <p class="text-sm text-neutral-400 line-through">${fmtARS(item.priceOriginal)}</p>
      </div>
    </div>`;
```

pasa a:

```js
  return `<div class="${boxClass}">
      <div class="flex items-baseline gap-2">
        <p class="font-display ${priceClass} font-bold text-ink">${fmtARS(item.promoPrice)}</p>
        <p class="text-sm text-neutral-400 line-through">${fmtARS(item.priceOriginal)}</p>
      </div>
    </div>`;
```

- [ ] **Step 3: Agregar `featuredCard` y `renderFeatured`**

En `script.js`, justo antes de `function promoCard(item, idx, pos = 0) {` (línea 283):

```js
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
      <div class="flex flex-1 flex-col p-4 sm:p-5">
        <p class="text-xs font-medium text-neutral-400">${escapeHtml(deptoMeta(item.depto).label)}</p>
        <h3 class="mt-1 font-display text-lg font-bold leading-tight text-ink sm:text-xl" title="${escapeHtml(item.name)}">${escapeHtml(shown)}</h3>
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
```

- [ ] **Step 4: Engancharlo en `renderCatalog`**

En `renderCatalog` (línea 409), reemplazar:

```js
  renderChips();
  renderGrid();
```

por:

```js
  renderChips();
  renderFeatured();
  renderGrid();
```

- [ ] **Step 5: Agregar el contenedor en `index.html`**

Entre el `</div>` que cierra el encabezado (línea 266) y el comentario `<!-- Herramientas de la vitrina...` (línea 268), insertar:

```html

    <!-- Destacados: 2 tarjetas grandes elegidas a mano (constante FEATURED en script.js) -->
    <div id="promo-featured" class="mt-6 hidden"></div>
```

El contenedor lleva `hidden` (no `grid`) porque las dos clases pelean por `display`. El grid va en el div interno que inyecta `renderFeatured`.

- [ ] **Step 6: Verificar sintaxis**

Run: `node --check script.js`
Expected: sin salida (exit 0).

- [ ] **Step 7: Verificar en el browser**

Abrir `index.html`. Expected:
- Arriba de la sección "Ofertas de la semana", antes del buscador, se ven dos tarjetas anchas.
- La izquierda es TUKOL con badge `-30%`, la derecha BUCOANGIN con badge `-40%`.
- Los nombres se leen "Tukol Forte jarabe 150 ml" y "Bucoangin Forte caramelos x9", no los crudos.
- Cada una muestra foto real, precio grande con el original tachado, y botón "+ Agregar" abajo.
- La grilla de abajo quedó igual que antes, con sus tarjetas chicas.
- Consola sin errores.

Sacar screenshot para el review.

- [ ] **Step 8: Commit**

```bash
git add script.js index.html
git commit -m "feat(landing): banda de 2 productos destacados arriba del catálogo"
```

---

### Task 3: Verificación de comportamiento

Todo lo que puede romperse pero no se ve en un screenshot: el carrito compartido, el ocultamiento en modo búsqueda, y el responsive.

**Files:**
- Ninguno nuevo. Se corrigen `script.js` / `index.html` si algo falla.

**Interfaces:**
- Consumes: todo lo de las tareas 1 y 2.
- Produces: la feature verificada, lista para deploy.

- [ ] **Step 1: Verificar que el carrito queda sincronizado entre destacado y grilla**

En el browser, con la landing cargada:
1. Escribir "tukol" en el buscador para ubicar la tarjeta de TUKOL FORTE en la grilla, y borrarlo.
2. Tocar "+ Agregar" en la tarjeta **destacada** de TUKOL.

Expected: el control del destacado pasa a stepper verde con `1`, **y la tarjeta chica de TUKOL en la grilla también**. La barra del carrito abajo dice "1 producto elegido".

3. Subir a `3` desde el stepper de la **grilla**.

Expected: el stepper del destacado también dice `3`.

4. Bajar a `0` desde el destacado.

Expected: los dos vuelven a "+ Agregar" y la barra del carrito desaparece.

Si los dos controles no se mueven juntos, el `idx` de la tarjeta destacada no es el índice real en `promoState.items`. Revisar `renderFeatured`.

- [ ] **Step 2: Verificar que la banda se esconde en modo búsqueda**

1. Escribir "geniol" en el buscador. Expected: la banda de destacados desaparece; la grilla muestra los resultados.
2. Borrar el buscador. Expected: la banda vuelve, con los mismos dos productos.
3. Tocar el chip "Perfumería". Expected: la banda desaparece.
4. Tocar el chip "Todos". Expected: la banda vuelve.

- [ ] **Step 3: Verificar que agregar al carrito no repinta la banda**

Con la banda visible, tocar "+ Agregar" en un destacado y mirar la foto.

Expected: la foto no parpadea ni se recarga (el cambio de cantidad pasa por `syncCard`, que solo reemplaza el control). Si parpadea, algo está llamando a `renderCatalog` de más.

- [ ] **Step 4: Verificar el responsive**

Achicar la ventana a ancho de celular (375px).

Expected: las dos tarjetas destacadas se apilan una arriba de la otra, la foto y el texto siguen legibles, el botón "+ Agregar" ocupa el ancho de su columna, y nada se desborda horizontalmente.

Sacar screenshot mobile para el review.

- [ ] **Step 5: Verificar el degradado sin feed**

En la consola:

```js
__promoState.items = []; renderCatalog();
```

Expected: la banda de destacados desaparece por completo (no queda un div vacío con borde), y aparece el estado "Las ofertas de la semana salen pronto" que ya existía. Recargar después.

- [ ] **Step 6: Commit de cualquier corrección**

Si algún paso obligó a tocar código:

```bash
git add script.js index.html
git commit -m "fix(landing): <qué se corrigió>"
```

Si no hubo correcciones, no hay commit y se pasa al deploy.

---

## Deploy

No forma parte de las tareas: se hace **después** de que el dueño apruebe los screenshots.

```bash
git push origin main
```

Cloudflare Pages deploya solo desde `main`. Este push publica también el rediseño marketplace de la Task 0, según lo decidido.

Verificar en `https://www.farmacia-anon.com` que la banda aparece con los dos productos y que el carrito sigue funcionando.
