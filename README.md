# Farmacia Añon — Landing

Landing page estática de Farmacia Añon (San Isidro, Buenos Aires).

- `index.html` — la página (HTML + Tailwind vía CDN)
- `script.js` — link de WhatsApp + animaciones de entrada
- `assets/logo.png` — logo

## Contacto configurado
- WhatsApp: 11 6562-0043
- Teléfono fijo: 11 4723-7441

## Desplegar en Cloudflare Pages
Es un sitio estático, **no requiere build**. Al conectar el repo en Cloudflare Pages:

| Campo | Valor |
|-------|-------|
| Framework preset | None |
| Build command | *(vacío)* |
| Build output directory | `/` |

Listo: cada push a `main` se publica automáticamente.

## Editar el número de WhatsApp
En `script.js`, variable `WHATSAPP_NUMERO` (formato `54 9 11` + número, sin espacios).
