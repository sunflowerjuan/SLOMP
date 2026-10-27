# Mockups de Slompsim (SL-153)

Mockups estáticos del chat de Slompsim, los mismos de la página [Diseño de Slompsim](https://trabajodecampo.atlassian.net/wiki/spaces/SLO/pages/10092545). Son la referencia visual para construir el chat en SL-156.

- Usan el CSS real del panel (tokens, layout y componentes). Lo único nuevo es el CSS del chat, en `slompsim.css`.
- Todos los datos son ficticios.
- No forman parte de la aplicación: el build solo toma `apps/frontend/index.html`.

## Cómo verlos

```bash
pnpm --filter frontend run dev
```

Abre `http://localhost:5173/mockups/slompsim/?state=vacio` y cambia `state` por el estado que quieras ver. Para ver la versión móvil, usa el modo de dispositivo del navegador a 390 px.

| `state`         | Estado (sección de la página)                      |
| --------------- | -------------------------------------------------- |
| `cerrado`       | 5.1 Cerrado                                        |
| `vacio`         | 5.2 Abierto vacío                                  |
| `escribiendo`   | 5.3 Escribiendo                                    |
| `esperando`     | 5.4 Esperando respuesta                            |
| `respuesta`     | 5.5 Respuesta de texto (nivel 1)                   |
| `nivel2`        | 5.6 Propuesta de nivel 2                           |
| `nivel3`        | 5.7 Propuesta de nivel 3                           |
| `aplicando`     | 5.8 Aplicando                                      |
| `aplicado`      | 5.9 Aplicado con resumen                           |
| `rechazado`     | 5.10 Cambio rechazado por una regla del dominio    |
| `error`         | 5.11 Error del asistente o sin conexión            |
| `sesion`        | 5.12 Sesión vencida                                |
| `entrada-aviso` | 5.13 Entrada desde la carga de mandamientos: aviso |
| `entrada-chat`  | 5.13 Entrada desde la carga de mandamientos: chat  |

## Para SL-156

- Las clases `sl-*` son solo de los mockups. Al construir el chat, cada parte pasa a su componente con su propio CSS.
- El primer bloque de `slompsim.css` apaga las animaciones para que las capturas salgan quietas. Ese bloque no se copia: el movimiento del panel está en la sección 3 de la página.
