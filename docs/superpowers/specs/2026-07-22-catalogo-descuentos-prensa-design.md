# Spec: Catálogo de descuentos + sección Prensa en farmacia-anon.com

**Fecha:** 2026-07-22
**Estado:** Aprobado (diseño), revisado adversarialmente con Fable

## Objetivo
En la landing estática de farmacia-anon.com (Cloudflare Pages, HTML plano + Tailwind CDN, venta 100% por WhatsApp):
1. **Catálogo de productos en descuento** alimentado desde SiFaCo (data real, ya sincronizada a Neon).
2. Al elegir productos (carrito multi-selección), armar **un mensaje de WhatsApp con todo lo que el cliente eligió**.
3. Sección **"En los medios / Novedades"** con la nota de Noticias de Salud (promo protectores solares -15%) como primera tarjeta, escalable.

## Contexto verificado (evidencia)
- Landing: `/Users/martinsuarez/Desktop/farmacia-anon/` — `index.html` (HTML plano, Tailwind CDN, sin build), `script.js` dinamiza links `wa.me` vía atributos `data-wa` (`script.js:8-24`). Colores custom: blue/cyan/green/ink/wa. Deploy Cloudflare Pages.
- La data de descuentos YA EXISTE y se sincroniza sola:
  - SiFaCo `productos.dbf` `OFERTA2` → `tools/sync-agent/sifaco.py:154` → `product.offerPct`. Cada ~5 min.
  - `product.offerMinQty` (dígito final de COLOR): 2 = 2x1, null = universal.
  - Cálculo de precio: `apps/api/src/ai/pricing.ts:106-120` `promoFor(price, offerPct, offerMinQty)` — **función pura, sin acoplamiento** (no toca DB/convenio/contexto). Devuelve `{ kind, pct, minQty, unitPromoPrice, bundleQty, bundleTotal, nota }`.
  - Schema: `apps/api/src/db/schema.ts:271-303` tabla `product`. `price`/`offerPct` son `numeric` → **Drizzle los devuelve como STRING**, hay que `Number()` antes de `promoFor`.
- Imágenes: `product.imagePath`, servidas público por `GET /media/products/:id` (`apps/api/src/media/media.routes.ts:56`, rate-limit propio, cache 7d, helmet `crossOriginResourcePolicy: cross-origin` → no bloquea `<img>` cross-origin).
- Auth: `requireAuth()` no instala hook global, solo decora `app.auth`/`app.tenantAuth` (`apps/api/src/auth/auth.routes.ts:263-274`). Una ruta sin `preHandler` = pública (precedente vivo: `media.routes.ts`). `withTenant(pharmacyId, fn)` (`apps/api/src/db/tenant.ts:28`) setea tenant sin exigir JWT; precedente exacto: `apps/api/src/sync/sync.routes.ts` (rutas públicas por API key que llaman `withTenant`).
- CORS hoy: allowlist única `WEB_ORIGINS` **con `credentials: true`**, y el mismo env alimenta el origin-check del WebSocket (`apps/api/src/index.ts:79-80, 109`). El rate-limit global está `global: false` (`index.ts:87`) → cada ruta define el suyo.

## Datos reales (verificados contra Neon prod, read-only, 2026-07-22)
- Promos activas con stock: **323**. Con foto: **0**. Precio ≤ 0: **2**.
- Por `sale_condition`: S(venta libre)=254, N=57, lista-III=10, otros=2.
- `category` (PSI) = códigos ("0"=226, null=86, "A"=10), NO nombres → inservible para UI.
- Productos 2x1 (`offerMinQty>=2`): 56.

## Decisiones (usuario)
- **Solo venta libre** (`sale_condition = 'S'`) — requisito duro, no negociable (legal).
- Fotos: el usuario cargará fotos con el tiempo; el diseño usa **foto real si existe, si no un fallback bien diseñado** (ícono por rubro + color de marca, que se vea intencional).
- Click: **carrito multi-selección** → un solo mensaje wa.me con todos los ítems.
- Noticia: sección **"En los medios / Novedades"** escalable; NDS = primera tarjeta.
- Cantidad: **top por más vendidos (`salesMonth desc`) + chips por rubro + "ver más"**.

## Requisitos duros surgidos de la revisión (Fable) — NO opcionales
1. **`sale_condition = 'S'`** — publicar descuentos de bajo-receta (67 productos, incl. 10 lista III) en web abierta viola el régimen de publicidad de medicamentos ANMAT (Ley 16.463). BLOQUEANTE. Los otros valores raros (`'1'`, null) se excluyen por conservadurismo.
2. **`price > 0`** — el sync incremental re-activa sin el guard de cuarentena $0 (`catalog-sync.service.ts:78,118,130`); hay 2 promos en $0 hoy. Espejar `isValidCatalogPrice`.
3. **CORS acotado a la ruta pública, SIN credentials** — NO agregar la landing a `WEB_ORIGINS` (le daría CORS credenciado a toda la API + WS). Usar `Access-Control-Allow-Origin` propio en la ruta (data pública, GET simple sin preflight) o un scope Fastify encapsulado con su `@fastify/cors`.
4. **`limit` en la respuesta** + rate-limit propio bajo (~30/min) + **cache server-side en memoria (~120s)** — la tabla `product` tiene ~78k filas sin índice por `offer_pct`; es un endpoint público que pega a Neon en cada hit.
5. **Usar `depto`** (0=med, 1-5=perfumería/dermo/bazar/dietética/alcohol, `schema.ts:288-292`) para íconos/chips, con mapa código→label/ícono hardcodeado en el front. NO exponer ni usar `category`/PSI.
6. **Tarjeta 2x1 distinta**: en `kind:"nx"`, `unitPromoPrice === price` (la unidad NO baja). Mostrar "Llevando 2: $X" con badge, sin precio tachado. La tarjeta universal sí muestra tachado + promoPrice.
7. **Sacar `code`** de la respuesta; `Number()` sobre `price`/`offerPct` antes de `promoFor`; **no reusar `promoFor().nota`** como label de UI (es copy para el agente) — derivar `promoLabel` de `kind`/`pct`/`minQty`.
8. Comparación `offerPct > 0` con `numeric`: usar `sql\`offer_pct::numeric > 0\`` o cast equivalente (el typing string de Drizzle da vacío silencioso si se compara mal).

## Arquitectura

### Componente 1 — Backend: endpoint público de promos (FarmApp API)
- `GET /public/catalog/:pharmacyId/promos?limit=&depto=` — sin JWT, sin `preHandler` de auth.
- Resuelve tenant con `withTenant(pharmacyId, ...)` + `tdb()` (RLS protege de un bug de `where`).
- WHERE: `offer_pct::numeric > 0 AND sale_condition = 'S' AND price::numeric > 0 AND stock > 0 AND active = true`, scope pharmacy_id.
- ORDER BY `salesMonth desc`, `LIMIT` (default acotado; `depto` opcional filtra por rubro).
- Por producto computa con `promoFor(Number(price), Number(offerPct), offerMinQty)`:
  - `promoPrice` (unitario para universal), `promoLabel` ("-N%" o "2x1"), `kind`.
- Respuesta JSON: `{ name, depto, priceOriginal, offerPct, offerMinQty, kind, promoPrice, promoLabel, imageUrl|null }`. `imageUrl` = URL absoluta a `/media/products/:id` si hay `imagePath`, si no null.
- CORS propio a `farmacia-anon.com` + `www.farmacia-anon.com` sin credentials. Rate-limit `config.rateLimit` ~30/min. Cache en memoria ~120s (clave: pharmacyId+depto+limit).
- Error handler global ya sanitiza 5xx (`index.ts:65-72`).

### Componente 2 — Frontend: sección "Descuentos" (index.html + script.js)
- Nueva sección `#descuentos`. On-load `fetch` al endpoint.
  - Loading = skeleton cards. Error o lista vacía = **ocultar la sección entera** (nunca mostrar roto); log a consola.
- Grid responsive (Tailwind). Chips por rubro (`depto` → label ES) que aparecen solo si hay >1 rubro. Botón "ver más" para el resto.
- Tarjeta:
  - Imagen: `imageUrl` si existe; si no, fallback = bloque con color por rubro + ícono SVG **de Tabler inline** (sin build step; no dibujar a mano). Diseñado para verse intencional.
  - Nombre; badge de promo.
  - Universal: precio original tachado + `promoPrice` + badge "-N%".
  - 2x1 (`kind:"nx"`): "Llevando 2: $bundleTotal" + badge "2x1", sin tachado.
  - Botón "+ Agregar" (toggle add/remove).
- Carrito (estado en memoria, array): barra sticky inferior "Mi pedido (N) — [Pedir por WhatsApp]".
  - Click arma texto: lista de ítems (nombre + precio/label) + "(precios sujetos a confirmación)"; abre `wa.me/<numAñón>?text=<encoded>`. Cap de ítems (p.ej. 15) para no pasar el límite de `wa.me`.

### Componente 3 — Frontend: sección "En los medios / Novedades" (index.html)
- Sección estática `#prensa`, grid de notas. Primera tarjeta:
  - Imagen, título ("Descuentos en protectores solares"), resumen ("15% en protectores solares, todo julio"), botón "Aprovechar por WhatsApp" + link "Leer nota en Noticias de Salud" → `https://www.noticiasdesalud.com.ar/farmacia-anon-y-nds-lanzan-promo-con-descuentos-en-protectores-solares/`.
- Estructura preparada para sumar más tarjetas de notas.

## Data flow
SiFaCo (`OFERTA2`, ~5 min) → sync-agent → Neon `product.offerPct` → endpoint público `/public/catalog/:id/promos` → fetch en landing → grid + carrito → `wa.me` con el pedido.

## Riesgos / notas
- Staleness de precio: entre sync (5 min) + cache (120s) + tiempo hasta el click, el precio del mensaje puede diferir → mitigado con "(precios sujetos a confirmación)".
- Deploy compartido: el Componente 1 toca la API de prod (tree compartido con WIP ajeno). Deploy con `git add -p` de hunks propios + `ship.sh --gate`, coordinado aparte del deploy de la landing (Cloudflare Pages).
- Identificador de Añón: usar su `pharmacy_id` (UUID, semi-público, no secreto) en la URL/JS de la landing.
- Fotos: hoy 0/254; el catálogo arranca 100% fallback y mejora a medida que el usuario carga fotos (las tarjetas las toman solas).

## Alternativas consideradas
- (A) Live fetch al endpoint público [ELEGIDA] — simple, fresco, requiere CORS + endpoint.
- (B) Snapshot JSON estático por cron a Pages — más resiliente si la API cae, pero más plumbing + staleness. Descartada salvo que el endpoint público resulte problemático.
- (C) Carrito uno-por-uno — descartada; el usuario quiere multi-selección.
