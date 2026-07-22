# Cantidad por producto en el carrito de la landing

Fecha: 2026-07-22
Alcance: `script.js` (la landing de Farmacia Añón, HTML/JS plano, sin build).

## Problema

Hoy el carrito de ofertas es binario: `promoState.cart` es un `Map<idx, true>`, así que un
producto está o no está en el pedido. Si alguien quiere dos unidades del mismo producto tiene
que aclararlo por WhatsApp después de mandar el pedido, lo que rompe el flujo que la landing
justamente quiere cerrar.

## Solución

Cantidad por producto, con stepper `− [n] +` en la tarjeta de la grilla y en cada fila del
drawer "Mi pedido".

### 1. Estado

`promoState.cart` pasa de `Map<idx, true>` a `Map<idx, qty>` con `qty >= 1` entero.

Dos helpers concentran toda la mutación (nadie toca el `Map` directo salvo `clear()`):

- `getQty(idx)` → cantidad actual, `0` si no está en el carrito.
- `setQty(idx, q)` → clampea a `[0, MAX_QTY_PER_ITEM]`; con `q <= 0` hace `cart.delete(idx)`;
  al pasar de `0` a `>= 1` valida el tope de productos distintos.

Consecuencia: el valor del `Map` ya no es `true`. Todo lugar que hoy asume "valor booleano"
usa `.has()` o `.keys()`, así que sigue funcionando, pero se revisa uno por uno.

### 2. Tarjeta de producto (`promoCard`)

- `qty === 0`: botón `+ Agregar`, exactamente como hoy (azul, mismo tamaño).
- `qty >= 1`: en el mismo lugar y con el mismo alto/radio, un stepper verde de marca:
  `[−] [n] [+]`. `−` en `1` saca el producto y la tarjeta vuelve a `+ Agregar`.
  `+` en `MAX_QTY_PER_ITEM` queda deshabilitado (opacidad + `disabled`), sin `alert()`.

### 3. Drawer "Mi pedido" (`renderCartDrawer`)

Cada fila suma el mismo stepper debajo de la línea de precio. El tacho se mantiene para
borrar el producto de una. Con `qty > 1` la fila muestra precio unitario y total de línea
(`$500 c/u · $1.000`); con `qty === 1` queda como hoy.

### 4. Combos "nx" (2x1, "llevando N")

La cantidad cuenta **combos**, no unidades sueltas: `qty = 2` de un 2x1 son 2 combos, o sea
4 unidades. `item.promoPrice` ya es el total del combo, así que el total de línea es
`promoPrice * qty` sin lógica extra.

### 5. Mensaje de WhatsApp (`cartLines`)

El mensaje va **sin precios y sin el "(precios sujetos a confirmación)"**: dice qué se lleva
y cuánto, y el precio lo confirma la farmacia al responder. Así el pedido no queda atado a un
número que puede haber cambiado, y el cierre de precio pasa en la conversación.

```
¡Hola Farmacia Añon! Quiero aprovechar estos descuentos:
• Ibuprofeno 400mg (2x1) x2 (4 unidades)
• Protector Solar SPF50 (-20%)
```

- `qty === 1`: sin `xN`. En un `nx` que no es combo limpio, se mantiene el `, llevando N`.
- `qty > 1`: sufijo `xN`, y en combos el total de unidades entre paréntesis.

En la landing los precios se siguen mostrando (tarjeta, fila del drawer y "Total aprox.");
lo que sale sin precios es el mensaje.

### 6. Contadores y topes

- Badge del header y `"N productos elegidos"`: suman **unidades totales** (`Σ qty`).
- `MAX_CART_ITEMS = 15` se mantiene, pero pasa a ser explícitamente el tope de **productos
  distintos** (`cart.size`). El `alert()` actual solo aparece al intentar agregar un producto
  nuevo número 16, igual que hoy.
- `MAX_QTY_PER_ITEM = 10`: tope por producto. Se comunica deshabilitando el `+`, no con alert.
- Total aprox. = `Σ promoPrice * qty`, en las tres vistas (barra mobile, drawer, header).

### 7. Accesibilidad

- Botones del stepper con `aria-label` ("Quitar uno", "Agregar uno") y `type="button"`.
- La cantidad visible en un `<span aria-live="polite">` para que el cambio se anuncie.
- El `+` topado usa `disabled` real, no solo estilo.

### 8. Movimiento (transiciones del catálogo y del carrito)

Todo el movimiento pasa por un helper único (`anim()`) que no hace nada si el sistema pide
"prefiero menos movimiento", y por un bloque de CSS acotado en el `<style>` de `index.html`.

- **Foto**: skeleton con shimmer mientras la imagen viaja; al cargar, fade + un pelín de
  zoom-out. Si la imagen falla, el skeleton se queda gris y quieto en vez de brillar para siempre.
- **Tarjetas**: entran con fade + subida, escalonadas de a 45 ms y con tope en la octava
  (nadie espera medio segundo por la fila de abajo). `animation-fill-mode: backwards` para no
  pisar el `hover:-translate-y` de la tarjeta cuando la animación termina.
- **Agregar**: el botón se convierte en stepper con un pop corto; el badge del header late.
- **Cambiar cantidad**: late el número (en la tarjeta y en la fila del drawer) y el total.
- **Quitar**: la fila del drawer colapsa (alto y padding a 0) y se va hacia la derecha; el
  estado se aplica al terminar, con una red de seguridad por si la animación se cancela.
- **Vaciar**: las filas salen escalonadas y recién ahí se limpia el carrito.
- **Drawer**: el overlay entra y sale con fade (antes aparecía de golpe) y las filas se
  acomodan escalonadas detrás del panel.
- **Barra mobile**: sube desde abajo solo cuando aparece, no en cada cambio de cantidad.

### 9. Render quirúrgico (requisito de las animaciones)

Hoy cualquier cambio del carrito llama a `renderCatalog()`, que repinta la grilla entera con
`innerHTML`: eso recarga las fotos y re-dispara la animación de entrada de tarjetas que el
usuario ya estaba mirando. Con cantidades se toca el carrito mucho más seguido, así que:

- La tarjeta expone `[data-cart-ctl]` y solo se re-renderiza ese control (`syncCard`).
- La fila del drawer expone `[data-row-body]`; si el conjunto de productos no cambió, se
  parchea solo el cuerpo (cantidad y precios) y la `<img>` ni se entera.
- En el drawer, solo animan las filas **nuevas**.
- "Ver más" agrega únicamente la tanda nueva (`insertAdjacentHTML`) en vez de repintar todo;
  un cambio de filtro o de búsqueda sí repinta de cero.

## Implementación

Todo el cambio vive en `script.js`. **No se toca `index.html`**: el stepper se genera desde
JS, y el archivo tiene cambios sin commitear de otro trabajo (rediseño marketplace).

Puntos de edición:

| Zona | Qué cambia |
| --- | --- |
| `promoState` / helpers (~l.94) | `cart: Map<idx, qty>`, `getQty`, `setQty`, `cartUnits()`, `cartTotal()` |
| `promoCard` (~l.178) | botón → stepper cuando `qty >= 1` |
| `cartLines` (~l.341) | sufijo `xN` y `(N unidades)` cuando `qty > 1` |
| `renderCart` (~l.368) | badge/contador por unidades, total por `qty` |
| `renderCartDrawer` (~l.407) | stepper por fila + precio unitario y total de línea |
| handlers (~l.479 y ~l.493) | `[data-qty-inc]` / `[data-qty-dec]` además de `[data-add]` y `[data-remove]` |

## Verificación

No hay suite de tests en el proyecto (`npm run build` es un `echo`). La verificación es
manual en el navegador, sobre la landing servida localmente:

1. Agregar un producto → la tarjeta muestra `− 1 +`, badge del header en `1`.
2. `+` tres veces → tarjeta y drawer muestran `4`, badge `4`, total = `4 × precio`.
3. `−` hasta `0` → el producto sale del pedido y la tarjeta vuelve a `+ Agregar`.
4. `+` hasta 10 → el `+` queda deshabilitado y no sube más.
5. Un producto con `qty = 1` → el mensaje de WhatsApp es carácter por carácter el de hoy.
6. Un combo 2x1 con `qty = 2` → la línea dice `x2 (4 unidades)` y el precio es el doble.
7. Vaciar el carrito → drawer vacío, barra mobile oculta, link de envío deshabilitado.

## Fuera de alcance

- Persistir el carrito entre visitas (localStorage).
- Cantidades en el lado del bot/API: el mensaje sigue siendo texto libre a WhatsApp.
- Cualquier cambio de layout en `index.html`.
