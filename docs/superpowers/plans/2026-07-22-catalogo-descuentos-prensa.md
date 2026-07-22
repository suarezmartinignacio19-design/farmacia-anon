# Catálogo de descuentos + sección Prensa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar a la landing farmacia-anon.com un catálogo de productos en descuento (data real de SiFaCo), un carrito que arma un pedido por WhatsApp, y una sección "En los medios" con la nota de Noticias de Salud.

**Architecture:** Un endpoint HTTP **público** nuevo en la API de FarmApp (Railway) devuelve los productos en promo de una farmacia leyendo la tabla `product` (ya alimentada por el sync de SiFaCo cada ~5 min). La landing estática (Cloudflare Pages, HTML + Tailwind CDN, sin build) hace `fetch` a ese endpoint, renderiza un grid de tarjetas, y un carrito en memoria compone un mensaje `wa.me`. La sección Prensa es HTML estático.

**Tech Stack:** Backend: Fastify 4 + Drizzle + Postgres (Neon), Vitest. Frontend: HTML plano + Tailwind Play CDN + JS vanilla (sin build, sin framework).

## Global Constraints

- **Solo venta libre (`sale_condition = 'S'`)** en el endpoint público. Publicar descuentos de bajo-receta al público viola el régimen de publicidad de medicamentos de ANMAT (Ley 16.463). Requisito duro, no negociable. Los otros valores (`N`/`3`/`4`/`1`/null) se excluyen.
- **No exponer** `code`, `costo`, `margen` ni `stock` exacto en la respuesta pública.
- **No tocar `WEB_ORIGINS`** (es CORS credenciado global + origin-check del WebSocket). El endpoint público setea su propio `Access-Control-Allow-Origin: *` (data pública, GET simple sin preflight, sin cookies).
- **`numeric` de Drizzle llega como STRING** — `Number()` antes de cualquier aritmética o de pasar a `promoFor`.
- **Multi-tenancy:** runtime siempre `tdb()` dentro de `withTenant(pharmacyId, ...)` (RLS). `ownerDb` solo para resolve-tenant/scripts.
- **Prohibido em dash (`—`)** en copy visible de la app/landing (regla de marca). Usar `·`, `:` o coma.
- **Deploy API:** tree compartido con WIP ajeno → `git add -p` de hunks propios + `bash scripts/ship.sh --gate` verde antes de deployar. Nunca `railway up` con WIP sin commitear.

---

### Task 0: Obtener el `pharmacy_id` de Farmacia Añón (prod)

La landing necesita el UUID real de Añón para armar la URL del endpoint. Es un dato de prod; se obtiene con una query read-only.

**Files:**
- Create (temporal): `/Users/martinsuarez/Documents/farmapp/apps/api/scripts/print-anon-id.mts`

- [ ] **Step 1: Escribir el script de lectura**

Create `/Users/martinsuarez/Documents/farmapp/apps/api/scripts/print-anon-id.mts`:

```ts
import { db } from "../src/db/client.js";
import { pharmacy } from "../src/db/schema.js";
import { ilike } from "drizzle-orm";

const rows = await db
  .select({ id: pharmacy.id, name: pharmacy.name })
  .from(pharmacy)
  .where(ilike(pharmacy.name, "%añ%"));
console.log(rows);
process.exit(0);
```

- [ ] **Step 2: Correrlo y anotar el UUID**

Run:
```bash
cd /Users/martinsuarez/Documents/farmapp/apps/api
node --env-file=../../.env --import tsx scripts/print-anon-id.mts
```
Expected: imprime `[{ id: '<uuid>', name: 'Farmacia Añón' }]` (o similar). **Anotar ese UUID** — se usa literal en Task 4. Si aparece más de una farmacia, elegir la de Añón por nombre.

- [ ] **Step 3: Borrar el script temporal**

Run:
```bash
rm /Users/martinsuarez/Documents/farmapp/apps/api/scripts/print-anon-id.mts
```
Expected: sin output. No se commitea nada en este task.

---

### Task 1: Mapper puro `buildPromoItem` (product row → item de respuesta)

**Files:**
- Create: `/Users/martinsuarez/Documents/farmapp/apps/api/src/catalog/public-catalog.service.ts`
- Test: `/Users/martinsuarez/Documents/farmapp/apps/api/src/catalog/public-catalog.service.test.ts`

**Interfaces:**
- Consumes: `promoFor(price:number, offerPct:number|null, offerMinQty:number|null): PromoInfo|null` de `../ai/pricing.js`.
- Produces:
  - `interface PromoItem { name:string; depto:number|null; kind:"universal"|"nx"; promoLabel:string; priceOriginal:number; promoPrice:number; bundleQty:number|null; imageId:string|null }`
  - `interface PromoRow { id:string; name:string; depto:number|null; price:string; offerPct:string|null; offerMinQty:number|null; imagePath:string|null }`
  - `buildPromoItem(row: PromoRow): PromoItem | null`

- [ ] **Step 1: Escribir el test que falla**

Create `public-catalog.service.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildPromoItem } from "./public-catalog.service.js";

const base = { id: "11111111-1111-4111-8111-111111111111", name: "PROTECTOR X", depto: 2, imagePath: null };

describe("buildPromoItem", () => {
  it("promo universal: precio unitario con descuento y label -N%", () => {
    const item = buildPromoItem({ ...base, price: "1000", offerPct: "20", offerMinQty: null });
    expect(item).not.toBeNull();
    expect(item!.kind).toBe("universal");
    expect(item!.priceOriginal).toBe(1000);
    expect(item!.promoPrice).toBe(800);
    expect(item!.promoLabel).toBe("-20%");
    expect(item!.bundleQty).toBeNull();
    expect(item!.imageId).toBeNull();
  });

  it("promo 2x1 (pct 100): promoPrice = total del combo (pagás 1), label 2x1", () => {
    const item = buildPromoItem({ ...base, price: "1000", offerPct: "100", offerMinQty: 2 });
    expect(item!.kind).toBe("nx");
    expect(item!.bundleQty).toBe(2);
    expect(item!.promoPrice).toBe(1000);
    expect(item!.promoLabel).toBe("2x1");
  });

  it("nx con pct < 100: label indica descuento en la 2da, no 2x1", () => {
    const item = buildPromoItem({ ...base, price: "1000", offerPct: "50", offerMinQty: 2 });
    expect(item!.kind).toBe("nx");
    expect(item!.promoPrice).toBe(1500); // 1 a $1000 + la 2da a $500
    expect(item!.promoLabel).toBe("2da -50%");
  });

  it("imageId = product.id SOLO cuando hay imagePath", () => {
    const item = buildPromoItem({ ...base, price: "1000", offerPct: "10", offerMinQty: null, imagePath: "anon/products/x.jpg" });
    expect(item!.imageId).toBe(base.id);
  });

  it("offerPct 0 o null → null (defensivo)", () => {
    expect(buildPromoItem({ ...base, price: "1000", offerPct: "0", offerMinQty: null })).toBeNull();
    expect(buildPromoItem({ ...base, price: "1000", offerPct: null, offerMinQty: null })).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que FALLA**

Run:
```bash
cd /Users/martinsuarez/Documents/farmapp/apps/api
pnpm exec vitest run src/catalog/public-catalog.service.test.ts
```
Expected: FAIL con "Cannot find module './public-catalog.service.js'" (o "buildPromoItem is not a function").

- [ ] **Step 3: Escribir la implementación mínima**

Create `public-catalog.service.ts`:

```ts
import { promoFor } from "../ai/pricing.js";

// Fila cruda de `product` que consume el mapper. `price`/`offerPct` son numeric → Drizzle los da como string.
export interface PromoRow {
  id: string;
  name: string;
  depto: number | null;
  price: string;
  offerPct: string | null;
  offerMinQty: number | null;
  imagePath: string | null;
}

// Item de la respuesta pública. NO incluye code/costo/stock (superficie pública mínima).
// `promoPrice`: universal = precio unitario con descuento; nx = total del combo pagando minQty unidades.
// `imageId`: el UUID del producto SOLO si tiene foto (el front arma `${API_BASE}/media/products/${imageId}`).
export interface PromoItem {
  name: string;
  depto: number | null;
  kind: "universal" | "nx";
  promoLabel: string;
  priceOriginal: number;
  promoPrice: number;
  bundleQty: number | null;
  imageId: string | null;
}

export function buildPromoItem(row: PromoRow): PromoItem | null {
  const price = Number(row.price);
  const offerPct = row.offerPct == null ? 0 : Number(row.offerPct);
  const promo = promoFor(price, offerPct, row.offerMinQty);
  if (!promo) return null; // offerPct <= 0

  const promoLabel =
    promo.kind === "universal"
      ? `-${promo.pct}%`
      : promo.pct >= 100
        ? `${promo.minQty}x${promo.minQty - 1}`
        : `2da -${promo.pct}%`;

  return {
    name: row.name,
    depto: row.depto,
    kind: promo.kind,
    promoLabel,
    priceOriginal: price,
    promoPrice: promo.kind === "nx" ? (promo.bundleTotal as number) : promo.unitPromoPrice,
    bundleQty: promo.bundleQty,
    imageId: row.imagePath ? row.id : null,
  };
}
```

- [ ] **Step 4: Correr el test y verificar que PASA**

Run:
```bash
cd /Users/martinsuarez/Documents/farmapp/apps/api
pnpm exec vitest run src/catalog/public-catalog.service.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/martinsuarez/Documents/farmapp
git add apps/api/src/catalog/public-catalog.service.ts apps/api/src/catalog/public-catalog.service.test.ts
git commit -m "feat(api): mapper puro buildPromoItem para catálogo público de promos"
```

---

### Task 2: Endpoint público `GET /public/catalog/:pharmacyId/promos`

**Files:**
- Create: `/Users/martinsuarez/Documents/farmapp/apps/api/src/catalog/public-catalog.routes.ts`
- Modify: `/Users/martinsuarez/Documents/farmapp/apps/api/src/index.ts` (registrar la ruta en la sección PÚBLICA, ~línea 105 junto a `syncRoutes`)
- Test: `/Users/martinsuarez/Documents/farmapp/apps/api/src/catalog/public-catalog.routes.test.ts`

**Interfaces:**
- Consumes: `buildPromoItem`, `PromoItem` de `./public-catalog.service.js`; `withTenant`, `tdb` de `../db/tenant.js`; `product` de `../db/schema.js`.
- Produces: ruta `GET /public/catalog/:pharmacyId/promos?limit=&depto=` → `{ items: PromoItem[] }`. Header `access-control-allow-origin: *`. Query: `limit` (1..60, default 60), `depto` (int opcional, filtra por rubro).

- [ ] **Step 1: Escribir el test de integración que falla**

Create `public-catalog.routes.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../index.js";
import { db } from "../db/client.js";
import { pharmacy, product } from "../db/schema.js";

describe("GET /public/catalog/:pharmacyId/promos", () => {
  let app: FastifyInstance;
  let phId: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
    const [p] = await db.insert(pharmacy).values({ name: `zzpubpromo${Date.now()}`, lat: "0", lng: "0" }).returning();
    phId = p.id;
    await db.insert(product).values([
      { pharmacyId: phId, name: "PROTECTOR OTC", price: "1000", stock: 10, saleCondition: "S", offerPct: "15", offerMinQty: null, salesMonth: "50", source: "import" },
      { pharmacyId: phId, name: "PSICO BAJO RECETA", price: "2000", stock: 10, saleCondition: "3", offerPct: "30", offerMinQty: null, salesMonth: "99", source: "import" },
      { pharmacyId: phId, name: "SIN PROMO", price: "500", stock: 10, saleCondition: "S", offerPct: null, offerMinQty: null, salesMonth: "10", source: "import" },
      { pharmacyId: phId, name: "PROMO PRECIO CERO", price: "0", stock: 10, saleCondition: "S", offerPct: "20", offerMinQty: null, salesMonth: "10", source: "import" },
      { pharmacyId: phId, name: "PROMO SIN STOCK", price: "800", stock: 0, saleCondition: "S", offerPct: "20", offerMinQty: null, salesMonth: "10", source: "import" },
    ]);
  }, 40000);

  afterAll(async () => { await app.close(); });

  it("devuelve SOLO venta libre en promo, precio>0 y stock>0", async () => {
    const res = await app.inject({ method: "GET", url: `/public/catalog/${phId}/promos` });
    expect(res.statusCode).toBe(200);
    const names = res.json().items.map((i: any) => i.name);
    expect(names).toEqual(["PROTECTOR OTC"]);
  });

  it("setea CORS abierto para la landing", async () => {
    const res = await app.inject({ method: "GET", url: `/public/catalog/${phId}/promos` });
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("pharmacyId que no es UUID → 404", async () => {
    const res = await app.inject({ method: "GET", url: `/public/catalog/not-a-uuid/promos` });
    expect(res.statusCode).toBe(404);
  });

  it("no expone code/stock; forma exacta del item", async () => {
    const res = await app.inject({ method: "GET", url: `/public/catalog/${phId}/promos` });
    const item = res.json().items[0];
    expect(item.code).toBeUndefined();
    expect(item.stock).toBeUndefined();
    expect(Object.keys(item).sort()).toEqual(
      ["bundleQty", "depto", "imageId", "kind", "priceOriginal", "promoLabel", "promoPrice", "name"].sort(),
    );
  });
});
```

- [ ] **Step 2: Correr el test y verificar que FALLA**

Run:
```bash
cd /Users/martinsuarez/Documents/farmapp/apps/api
pnpm exec vitest run src/catalog/public-catalog.routes.test.ts
```
Expected: FAIL — la ruta responde 404 (aún no registrada), `names` queda `[]` ≠ `["PROTECTOR OTC"]`.

- [ ] **Step 3: Escribir la ruta**

Create `public-catalog.routes.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { withTenant, tdb } from "../db/tenant.js";
import { product } from "../db/schema.js";
import { buildPromoItem, type PromoItem } from "./public-catalog.service.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LIMIT = 60;
const CACHE_TTL_MS = 120_000;

type CacheEntry = { at: number; items: PromoItem[] };
const cache = new Map<string, CacheEntry>();

export async function publicCatalogRoutes(app: FastifyInstance) {
  // Catálogo PÚBLICO de promos de una farmacia, para la landing estática (farmacia-anon.com).
  // Sin JWT (patrón /media/products/:id, /sync/*): el pharmacyId es semi-público (UUID v4, no secreto).
  // SOLO venta libre ('S'): publicitar descuentos de bajo-receta al público viola el régimen ANMAT (Ley 16.463).
  // CORS abierto a mano (data pública cacheable, GET simple sin preflight; NO tocar WEB_ORIGINS credenciado).
  // Cache en memoria 120s + rate-limit por IP: `product` no tiene índice por offer_pct.
  const limitCfg = {
    config: { rateLimit: { max: 30, timeWindow: "1 minute", keyGenerator: (req: any) => req.ip } },
  };
  app.get("/public/catalog/:pharmacyId/promos", limitCfg, async (req, reply) => {
    reply.header("access-control-allow-origin", "*");
    reply.header("cache-control", "public, max-age=120");

    const pharmacyId = (req.params as any).pharmacyId as string;
    if (!UUID_RE.test(pharmacyId)) return reply.code(404).send({ error: "farmacia inexistente" });

    const q = req.query as any;
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(q.limit) || MAX_LIMIT));
    const depto =
      q.depto != null && q.depto !== "" && Number.isInteger(Number(q.depto)) ? Number(q.depto) : null;

    const cacheKey = `${pharmacyId}:${depto ?? ""}:${limit}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { items: hit.items };

    const rows = await withTenant(pharmacyId, async () =>
      tdb()
        .select({
          id: product.id,
          name: product.name,
          depto: product.depto,
          price: product.price,
          offerPct: product.offerPct,
          offerMinQty: product.offerMinQty,
          imagePath: product.imagePath,
        })
        .from(product)
        .where(
          and(
            eq(product.pharmacyId, pharmacyId),
            eq(product.active, true),
            eq(product.saleCondition, "S"),
            sql`${product.offerPct}::numeric > 0`,
            sql`${product.price}::numeric > 0`,
            gt(product.stock, 0),
            ...(depto != null ? [eq(product.depto, depto)] : []),
          ),
        )
        .orderBy(desc(product.salesMonth))
        .limit(limit),
    );

    const items = rows.map(buildPromoItem).filter((x): x is PromoItem => x != null);
    cache.set(cacheKey, { at: Date.now(), items });
    return { items };
  });
}
```

- [ ] **Step 4: Registrar la ruta en `index.ts`**

En `/Users/martinsuarez/Documents/farmapp/apps/api/src/index.ts`, agregar el import junto a los otros de rutas (cerca de donde se importa `syncRoutes`) y registrar la ruta en la sección PÚBLICA, justo después de la línea `await app.register(syncRoutes);` (~línea 105):

Import (agregar arriba con los demás imports de rutas):
```ts
import { publicCatalogRoutes } from "./catalog/public-catalog.routes.js";
```

Registro (después de `await app.register(syncRoutes);`):
```ts
  await app.register(publicCatalogRoutes); // PÚBLICA (antes de requireAuth): catálogo de promos para la landing (CORS abierto, sin JWT)
```

- [ ] **Step 5: Correr el test y verificar que PASA**

Run:
```bash
cd /Users/martinsuarez/Documents/farmapp/apps/api
pnpm exec vitest run src/catalog/public-catalog.routes.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 6: Gate completo (typecheck + suite)**

Run:
```bash
cd /Users/martinsuarez/Documents/farmapp
bash scripts/ship.sh --gate
```
Expected: gate VERDE (typecheck api+web + suite). Si algo rojo, arreglar antes de seguir. NO deployar todavía.

- [ ] **Step 7: Commit**

```bash
cd /Users/martinsuarez/Documents/farmapp
git add apps/api/src/catalog/public-catalog.routes.ts apps/api/src/catalog/public-catalog.routes.test.ts apps/api/src/index.ts
git commit -m "feat(api): endpoint público de promos por farmacia para la landing"
```

- [ ] **Step 8: Deploy del API (coordinado, tree compartido)**

Verificar que no arrastra WIP ajeno y deployar solo lo commiteado:
```bash
cd /Users/martinsuarez/Documents/farmapp
git status                 # confirmar qué hay sin commitear
bash scripts/ship.sh       # gate + deploy (pide confirmación y muestra git status)
```
Verificar en prod (reemplazar `<ANON_ID>` por el UUID de Task 0):
```bash
curl -s "https://farmapp-api-production.up.railway.app/public/catalog/<ANON_ID>/promos?limit=3"
```
Expected: JSON `{ "items": [ ... ] }` con productos reales de venta libre en promo. Anotar si viene vacío (habría que revisar si Añón tiene promos activas ahora).

---

### Task 3: Sección "En los medios / Novedades" (landing, estática)

Sección HTML pura, sin datos remotos. Se inserta antes de la sección `#visitanos`.

**Files:**
- Modify: `/Users/martinsuarez/Desktop/farmacia-anon/index.html` (nuevo `<section id="prensa">` + link en el `<nav>`)

- [ ] **Step 1: Agregar el link "Novedades" al nav**

En `index.html`, dentro del `<nav>` (líneas ~136-140), agregar antes del link de "Horarios y dirección":
```html
        <a href="#descuentos" class="hover:text-blue">Descuentos</a>
        <a href="#prensa" class="hover:text-blue">Novedades</a>
```
(El `#descuentos` apunta a la sección de la Task 4; se agrega ahora para no volver a tocar el nav.)

- [ ] **Step 2: Insertar la sección Prensa**

En `index.html`, insertar esta sección INMEDIATAMENTE ANTES de `<!-- ===================== HORARIOS + UBICACIÓN ===================== -->`:

```html
  <!-- ===================== EN LOS MEDIOS ===================== -->
  <section id="prensa" class="mx-auto max-w-6xl px-5 py-16 md:py-24">
    <div data-reveal class="max-w-2xl">
      <h2 class="font-display text-3xl font-medium text-ink sm:text-4xl">En los medios</h2>
      <p class="mt-3 text-neutral-600">Novedades y promociones de la farmacia.</p>
    </div>

    <div data-reveal-stagger class="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
      <article class="group flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md">
        <div class="relative h-44 overflow-hidden">
          <img
            src="https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=900&q=80"
            alt="Protectores solares en promoción"
            class="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
          <span class="absolute left-3 top-3 rounded-full bg-green px-3 py-1 text-xs font-semibold text-white shadow-sm">Promo de julio</span>
        </div>
        <div class="flex flex-1 flex-col p-6">
          <p class="text-xs font-semibold uppercase tracking-wide text-blue-dark">Noticias de Salud</p>
          <h3 class="mt-2 font-display text-xl text-ink">15% en protectores solares</h3>
          <p class="mt-2 flex-1 text-[15px] leading-relaxed text-neutral-600">
            Durante todo julio, 15% de descuento en protectores solares de todas las marcas. Consultá por WhatsApp y aprovechá el beneficio.
          </p>
          <div class="mt-5 flex flex-wrap items-center gap-3">
            <a href="#" data-wa class="inline-flex items-center gap-2 rounded-full bg-wa px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-wa-dark">
              Aprovechar por WhatsApp
            </a>
            <a href="https://www.noticiasdesalud.com.ar/farmacia-anon-y-nds-lanzan-promo-con-descuentos-en-protectores-solares/"
               target="_blank" rel="noopener"
               class="inline-flex items-center gap-1.5 text-sm font-semibold text-blue hover:text-blue-dark">
              Leer la nota
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>
            </a>
          </div>
        </div>
      </article>
    </div>
  </section>
```

- [ ] **Step 3: Verificar en el navegador**

Run:
```bash
cd /Users/martinsuarez/Desktop/farmacia-anon
python3 -m http.server 8099
```
Abrir `http://localhost:8099` y verificar:
- La sección "En los medios" aparece con la tarjeta de la promo.
- El botón "Aprovechar por WhatsApp" abre `wa.me/5491165620043` (lo cablea `script.js` vía `data-wa`).
- "Leer la nota" abre la URL de Noticias de Salud en pestaña nueva.
- Los links "Descuentos" y "Novedades" están en el nav.

Detener el server con Ctrl+C.

- [ ] **Step 4: Commit**

```bash
cd /Users/martinsuarez/Desktop/farmacia-anon
git add index.html
git commit -m "feat: sección En los medios con la nota de Noticias de Salud"
```

---

### Task 4: Sección "Descuentos" — markup + fetch + render (tarjetas con fallback)

**Files:**
- Modify: `/Users/martinsuarez/Desktop/farmacia-anon/index.html` (nuevo `<section id="descuentos">`)
- Modify: `/Users/martinsuarez/Desktop/farmacia-anon/script.js` (config + fetch + render)

**Interfaces:**
- Consumes: endpoint `GET ${API_BASE}/public/catalog/${ANON_PHARMACY_ID}/promos` → `{ items: PromoItem[] }` (Task 2).
- Produces (en `script.js`, para la Task 5): estado global `window.__promoState = { items: [], cart: new Map() }`, y funciones `renderCatalog()`, `deptoMeta(depto)`, `fmtARS(n)`, `escapeHtml(s)`.

- [ ] **Step 1: Insertar el markup de la sección Descuentos**

En `index.html`, insertar esta sección INMEDIATAMENTE DESPUÉS del cierre `</section>` de SERVICIOS y ANTES de `<!-- ===================== LA FARMACIA ===================== -->`:

```html
  <!-- ===================== DESCUENTOS ===================== -->
  <section id="descuentos" class="hidden border-t border-neutral-200/70 bg-neutral-50/60">
    <div class="mx-auto max-w-6xl px-5 py-16 md:py-20">
      <div class="max-w-2xl">
        <h2 class="font-display text-3xl font-medium text-ink sm:text-4xl">Descuentos de la semana</h2>
        <p class="mt-3 text-neutral-600">Precios con descuento, actualizados desde la farmacia. Elegí lo que quieras y te armamos el pedido por WhatsApp.</p>
      </div>

      <div id="promo-chips" class="mt-8 flex flex-wrap gap-2"></div>
      <div id="promo-grid" class="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"></div>

      <div class="mt-10 flex justify-center">
        <button id="promo-more" type="button" class="hidden rounded-full border border-neutral-300 px-6 py-3 text-sm font-semibold text-ink transition hover:border-blue hover:text-blue">
          Ver más descuentos
        </button>
      </div>
    </div>
  </section>
```

Nota: la sección arranca `hidden`; `script.js` la muestra solo si el fetch trae items (si falla o viene vacía, queda oculta).

- [ ] **Step 2: Agregar la config y la lógica de fetch/render a `script.js`**

Al FINAL de `/Users/martinsuarez/Desktop/farmacia-anon/script.js`, agregar (reemplazar `PEGAR_UUID_DE_ANON` por el UUID de Task 0):

```js
// =========================================================
// Catálogo de descuentos (data real de la farmacia vía API)
// =========================================================
const API_BASE = "https://farmapp-api-production.up.railway.app";
const ANON_PHARMACY_ID = "PEGAR_UUID_DE_ANON"; // Farmacia Añón (prod) — ver Task 0 del plan
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
function promoPriceBlock(item) {
  if (item.kind === "nx") {
    return `<div class="mt-1">
        <p class="text-sm text-neutral-500">Llevando ${item.bundleQty}</p>
        <p class="font-display text-lg font-semibold text-ink">${fmtARS(item.promoPrice)}</p>
      </div>`;
  }
  return `<div class="mt-1 flex items-baseline gap-2">
      <p class="font-display text-lg font-semibold text-ink">${fmtARS(item.promoPrice)}</p>
      <p class="text-sm text-neutral-400 line-through">${fmtARS(item.priceOriginal)}</p>
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
        <h3 class="mt-0.5 line-clamp-2 text-sm font-semibold text-ink" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</h3>
        ${promoPriceBlock(item)}
        <button type="button" data-add="${idx}"
          class="mt-3 inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition ${inCart ? "bg-green text-white hover:bg-green-soft" : "bg-blue text-white hover:bg-blue-dark"}">
          ${inCart ? "Agregado ✓" : "+ Agregar"}
        </button>
      </div>
    </article>`;
}

function renderChips() {
  const el = document.getElementById("promo-chips");
  if (!el) return;
  const deptos = [...new Set(promoState.items.map((i) => i.depto))];
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
```

- [ ] **Step 3: Verificar el render en el navegador (contra prod)**

Requiere que el endpoint de Task 2 esté deployado (Step 8) y `ANON_PHARMACY_ID` pegado.
Run:
```bash
cd /Users/martinsuarez/Desktop/farmacia-anon
python3 -m http.server 8099
```
Abrir `http://localhost:8099`, y en la consola del navegador (DevTools) verificar:
- La sección "Descuentos de la semana" se hace visible y muestra tarjetas.
- Las tarjetas SIN foto muestran el fallback (ícono+color por rubro), NO un cuadro roto.
- Los badges muestran "-15%", "2x1", etc.
- Si hay más de un rubro, aparecen los chips y filtran al clickear.
- "Ver más descuentos" aparece si hay >12 y agrega tandas.
- Simular fallo: cortar internet o cambiar `API_BASE` a algo inválido → la sección NO aparece y hay un `console.warn`, la landing sigue entera.

Detener con Ctrl+C.

- [ ] **Step 4: Commit**

```bash
cd /Users/martinsuarez/Desktop/farmacia-anon
git add index.html script.js
git commit -m "feat: catálogo de descuentos desde la API (grid + fallback + filtros)"
```

---

### Task 5: Carrito multi-selección → mensaje de WhatsApp

**Files:**
- Modify: `/Users/martinsuarez/Desktop/farmacia-anon/index.html` (barra sticky del carrito)
- Modify: `/Users/martinsuarez/Desktop/farmacia-anon/script.js` (handler de "Agregar" + `renderCart` + armado del `wa.me`)

**Interfaces:**
- Consumes: `promoState` (`.items`, `.cart`), `fmtARS`, `escapeHtml`, `renderCatalog`, y `WHATSAPP_NUMERO` (ya definido arriba en `script.js`).
- Produces: `renderCart()` global (llamada por `renderCatalog`), y el handler de `[data-add]`.

- [ ] **Step 1: Agregar la barra del carrito al HTML**

En `index.html`, insertar justo antes de `</body>` (o antes del botón flotante de WhatsApp si existe, para que no se pisen):

```html
  <!-- Barra del carrito de descuentos (oculta hasta que haya items seleccionados) -->
  <div id="promo-cart-bar" class="fixed inset-x-0 bottom-0 z-50 hidden">
    <div class="mx-auto max-w-6xl px-4 pb-4">
      <div class="flex items-center justify-between gap-4 rounded-2xl bg-ink px-5 py-3.5 text-white shadow-2xl">
        <div class="min-w-0">
          <p class="text-sm font-semibold"><span id="promo-cart-count">0</span> productos elegidos</p>
          <p id="promo-cart-total" class="truncate text-xs text-white/70"></p>
        </div>
        <button id="promo-cart-send" type="button" class="inline-flex shrink-0 items-center gap-2 rounded-full bg-wa px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-wa-dark">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.022z"/></svg>
          Pedir por WhatsApp
        </button>
      </div>
    </div>
  </div>
```

- [ ] **Step 2: Agregar el handler del carrito y `renderCart` a `script.js`**

Al FINAL de `script.js` (después del bloque de la Task 4), agregar:

```js
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
        ? `• ${it.name} (${it.promoLabel}) — llevando ${it.bundleQty}: ${fmtARS(it.promoPrice)}`
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
  countEl.textContent = String(n);
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
```

Nota: `renderCatalog()` (Task 4) ya llama a `renderCart()` si existe, así que al agregar/quitar se actualiza todo junto.

- [ ] **Step 3: Verificar el flujo completo en el navegador**

Requiere el endpoint deployado + `ANON_PHARMACY_ID` pegado.
Run:
```bash
cd /Users/martinsuarez/Desktop/farmacia-anon
python3 -m http.server 8099
```
Abrir `http://localhost:8099` y verificar:
- Al clickear "+ Agregar" en varias tarjetas, el botón pasa a "Agregado ✓" y aparece la barra inferior con el conteo y total aprox.
- Al clickear de nuevo, se quita del carrito.
- No deja agregar más de 15 (muestra el aviso).
- "Pedir por WhatsApp" abre `wa.me/5491165620043` con un mensaje que lista TODOS los productos elegidos con sus precios de promo y el texto "(precios sujetos a confirmación)".
- Verificar que un producto 2x1 aparece como "llevando 2: $X" en el mensaje.

Detener con Ctrl+C.

- [ ] **Step 4: Commit**

```bash
cd /Users/martinsuarez/Desktop/farmacia-anon
git add index.html script.js
git commit -m "feat: carrito de descuentos que arma el pedido por WhatsApp"
```

- [ ] **Step 5: Deploy de la landing**

La landing se sirve desde Cloudflare Pages (deploy automático al pushear, según config del repo). Confirmar el método con el estado del repo:
```bash
cd /Users/martinsuarez/Desktop/farmacia-anon
git push
```
Verificar en `https://www.farmacia-anon.com/` que las tres piezas aparecen y funcionan contra el endpoint de prod.

---

## Notas de cierre

- **Orden de ejecución obligatorio:** Task 0 → 1 → 2 (con deploy del API en Step 8) → 4/5 (necesitan el endpoint vivo + el UUID). La Task 3 (Prensa) es independiente y puede ir en cualquier momento.
- **Si el endpoint viene vacío en prod** (Añón sin promos activas ahora): la sección Descuentos queda oculta por diseño; no es un bug. Revisar `OFERTA2` en SiFaCo si se esperaba data.
- **Fotos:** hoy 0 productos en promo tienen foto → todas las tarjetas usan el fallback. A medida que se carguen fotos (UI de FarmApp → `POST /products/:id/photo`), las tarjetas las toman solas vía `imageId`.
- **Refinamiento de rubros:** el mapa `deptoMeta` (1-5) es best-effort según el nomenclador SiFaCo; ajustar labels si al ver la data real algún rubro no matchea.
