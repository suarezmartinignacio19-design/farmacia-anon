# Dos productos destacados al inicio del catálogo

**Fecha:** 2026-07-26
**Estado:** aprobado, pendiente de implementar

## Problema

El catálogo de ofertas (`#descuentos`) pinta las 71 promos con foto todas iguales, en una grilla plana, en el orden que manda el backend. No hay jerarquía: nada empuja al visitante hacia un producto en particular, y la farmacia no tiene forma de decir "mirá esto primero".

## Qué se construye

Una banda de dos tarjetas destacadas, más grandes que las de la grilla, arriba de todo dentro de la sección de ofertas. Los dos productos los elige la farmacia a mano, editando el código.

## Decisiones

### Ubicación y forma

Bloque nuevo `#promo-featured` en `index.html`, entre el encabezado "Ofertas de la semana" y el bloque `#promo-tools` (buscador + chips). La grilla, los chips, el buscador, los estados vacíos y el carrito quedan intactos.

Cada tarjeta es horizontal: foto cuadrada a la izquierda (~40% del ancho), y a la derecha rubro, nombre, precio y botón. Badge de descuento arriba a la izquierda de la foto, más grande que el de la grilla. En celular las dos tarjetas se apilan; desde `md` van lado a lado.

### Selección de los destacados

Constante al tope de `script.js`:

```js
const FEATURED = [
  { match: "TUKOL FORTE jbex150 ml",  title: "Tukol Forte jarabe 150 ml" },
  { match: "BUCOANGIN FORTE caramx9", title: "Bucoangin Forte caramelos x9" },
];
```

El endpoint público **no devuelve id de producto** (los campos son `name`, `depto`, `kind`, `promoLabel`, `priceOriginal`, `promoPrice`, `bundleQty`, `imageId`). Por eso el enganche es por `name` exacto, normalizado (trim + minúsculas + espacios colapsados) para tolerar cambios de espaciado en SiFaCo.

`title` existe porque el nombre crudo de SiFaCo ("TUKOL FORTE jbex150 ml") se lee mal en tipografía grande. Es opcional: si falta, se usa `item.name`. La grilla siempre muestra el nombre crudo; solo la tarjeta destacada usa el nombre limpio.

Cambiar los destacados es editar esas dos líneas y hacer `git push`.

### Resiliencia

Si un `match` no aparece en el feed (sin stock, sin promo, sin foto, o le cambiaron el nombre en SiFaCo), su lugar lo toma el producto con mayor porcentaje de descuento del feed que no esté ya destacado. El porcentaje se parsea de `promoLabel` con `/-(\d+)\s*%/`; los que no matchean valen 0.

Consecuencias: siempre hay exactamente 2 destacados, nunca queda un hueco, y **nunca se muestra un precio escrito a mano**. Todo dato visible sale del endpoint. Si el feed viene vacío o la API está caída, no hay banda y aplica el estado vacío que ya existe.

Cuando un `match` no se encuentra, se emite `console.warn` con el nombre buscado, para poder diagnosticarlo desde el browser.

### Interacción con la grilla

**El destacado sigue apareciendo también en la grilla.** Sacarlo haría que alguien que filtra por "Farmacia" o busca "tukol" no lo encuentre. `syncCard` (`script.js:305`) ya usa `querySelectorAll` sobre `[data-cart-ctl="idx"]`, así que los dos controles del mismo producto quedan sincronizados solos: agregar desde el destacado actualiza la tarjeta de la grilla y viceversa. El `idx` de la tarjeta destacada es su índice real en `promoState.items`, no uno nuevo.

**Al buscar o filtrar por rubro, la banda se oculta.** El visitante pasó a modo búsqueda y dos productos fijos arriba serían ruido. Vuelve al tocar "Todos" o al vaciar el buscador. La condición es `promoState.filter === null && !promoState.search.trim()`.

**Sin encabezado propio**, para no encadenar dos títulos.

## Implementación

Se reusan las piezas existentes en vez de duplicarlas, parametrizando el tamaño:

- `promoThumb(item)` y `promoPriceBlock(item)` reciben una variante de tamaño (`"sm"` por defecto, `"lg"` para el destacado).
- `cardControlHtml(idx)` se usa tal cual: el botón ya es de ancho completo.
- `renderFeatured()` se llama desde `renderCatalog()`, junto a `renderChips()` y `renderGrid()`.

Ambos archivos tocados (`index.html`, `script.js`) ya tienen cambios sin commitear del rediseño marketplace. Decisión del dueño: el rediseño y los destacados salen juntos en el mismo deploy.

## Verificación

El proyecto no tiene build ni suite de tests (HTML estático + Tailwind CDN). La verificación es en browser contra el feed real de producción:

1. La banda muestra TUKOL FORTE y BUCOANGIN FORTE, con foto, precio correcto y badge.
2. Agregar un destacado al carrito actualiza también su tarjeta en la grilla (y al revés).
3. Al escribir en el buscador la banda desaparece; al borrar, vuelve.
4. Al tocar un chip de rubro la banda desaparece; al tocar "Todos", vuelve.
5. Forzando un `match` inexistente, entra el fallback por mayor descuento y aparece el `console.warn`.
6. Screenshot en desktop y en viewport de celular.

Recién con eso verde se pushea a `main` (deploy automático a Cloudflare Pages).

## Fuera de alcance

- Flag "destacado" en FarmApp con soporte en la API. Se evaluó y se descartó por ahora: requiere migración, cambios en el endpoint público y en el panel. La selección a mano en el código alcanza para el volumen actual.
- Rotación automática o programada de destacados.
- Cualquier cambio en el endpoint `/public/catalog/:pharmacyId/promos`.
