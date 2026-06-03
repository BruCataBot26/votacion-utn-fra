# Sistema de Votación en Tiempo Real — UTN FRA 2026

## Arquitectura

```
Celulares (QR) ──→ /form ──→ POST /vote ──→ WebSocket ──→ /tv (pantalla TV)
                                                       └──→ /admin (panel)
```

## URLs del sistema

| Pantalla | URL | Uso |
|----------|-----|-----|
| Formulario | `/form` | QR impreso → celulares |
| Pantalla TV | `/tv` | Computadora conectada a TV (F11 = pantalla completa) |
| Panel Admin | `/admin` | Operador: ver votos, exportar CSV, resetear turnos |
| Imprimir QR | `/qr` | Página para imprimir el cartel con QR |

## Deploy en Railway

1. Subir esta carpeta a GitHub (sin `node_modules/`)
2. railway.app → New Project → Deploy from GitHub
3. Railway detecta Node.js automáticamente
4. URL pública lista en ~2 minutos

## El día de la jornada

1. Abrir `/tv` en la TV (F11 para pantalla completa)
2. Imprimir `/qr` y pegar en los puntos estratégicos
3. Al terminar cada turno: Admin → "Cerrar turno y resetear" → exportar CSV
4. Los datos se guardan en `data.json` — no se pierden si el servidor reinicia

## Editar preguntas o chips

- **Preguntas:** buscar el texto en `public/form.html` y `public/tv.html`
- **Chips de sugerencias:** sección `<div class="chips">` en `public/form.html`
