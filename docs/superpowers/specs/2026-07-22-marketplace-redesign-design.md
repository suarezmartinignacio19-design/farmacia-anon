# Rediseño marketplace — Farmacia Añón (2026-07-22)

## Objetivo
Rearmar la landing de farmacia-anon.com para que **se lea como un marketplace** (referencia: selmadigital.com) manteniendo el modelo real del negocio: farmacia de barrio, pedido por **WhatsApp**, y **feed de solo-promos** (sin catálogo completo ni checkout).

## Principio rector (post-review Fable)
Copiar la **piel** de marketplace, no sus **supuestos**. Todo lo que dependa de "catálogo/checkout" (buscador central, banda de departamentos, carrito de pago) se **degrada con honestidad**; todo lo que dependa de "servicio de barrio por WhatsApp" (el negocio real) se **asciende** de botón repetido a camino diseñado. Ningún camino termina en callejón sin salida.

## Decisiones
- **Vitrina marketplace completa** con paleta Añón (azul #1b75bb, cyan #29abe2, verde #3a9d4e, ink #16242f, wa #25d366). Stack sin cambios: HTML estático + vanilla JS + Tailwind Play CDN.
- **Grilla = solo promos** vía API (`/public/catalog/{id}/promos`). **NO se esconde si no hay**: muestra estado vacío honesto (delta B aprobado).
- **Buscador filtra promos**, pero vive en la **cabecera de la vitrina**, no en el header (delta A). El header queda estable, nada depende del feed.
- **Sin barra verde de departamentos** estilo Selma: nav institucional limpia (delta C). El filtrado por depto vive en chips de la vitrina, generados del feed (solo deptos con ≥1 promo).

## Estructura
1. **Barra utilitaria** fina (1 mensaje; mobile corto).
2. **Header sticky estable**: logo · nav institucional (Ofertas · Servicios · La farmacia · Horarios) · **"Mi pedido"** (contador) · WhatsApp. Mobile: logo + hamburguesa + WhatsApp.
3. **Hero compacto**: banner de marca ("desde 1950", CTA WhatsApp) + 1 tile útil ("¿algo que no está en oferta? Pedilo por WhatsApp").
4. **Vitrina "Ofertas de la semana"**: vigencia + buscador ("Buscá en las ofertas") + chips del feed + cards estilo marketplace (badge % OFF rojo / NxM verde, precio + tachado, botón agregar siempre visible).
   - **Estado vacío de búsqueda = conversor**: "No tenemos [X] en oferta esta semana, pero seguro lo tenemos en el local — consultá por WhatsApp" con el término precargado.
   - **Estado sin feed**: "Las ofertas de la semana salen pronto. Consultá cualquier producto por WhatsApp."
5. **Cómo pedir en 3 pasos** (Escribís → Confirmamos stock y total → Te lo llevamos hoy).
6. **Franja de confianza** (sin duplicar claims del hero).
7. **Servicios** como tiles.
8. **La farmacia** (absorbe Novedades/Prensa).
9. **Horarios + Mapa**.
10. **CTA final + Footer**.

## Mobile
Una **sola barra inferior sticky que muta**: 0 ítems = "Consultá por WhatsApp"; ≥1 ítem = "Enviar pedido (N)". El botón flotante de WhatsApp queda solo en desktop cuando el carrito está vacío. Cards con botón agregar siempre visible (sin depender de hover).

## Cambios técnicos (sin backend nuevo)
- `promoState.search` + filtro por nombre en `renderGrid`; input en la vitrina.
- Estados vacíos (sin feed / búsqueda sin resultado con CTA precargado a WhatsApp).
- Sección de ofertas siempre visible (se saca `hidden`); render maneja los estados.
- Contador de "Mi pedido" en el header dentro de `renderCart`.
- Coexistencia barra pedido / CTA mobile / flotante desktop en `renderCart`.
