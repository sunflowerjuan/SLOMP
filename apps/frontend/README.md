# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

## Caché de los estáticos

El sitio se sirve desde el sitio estático de un Storage Account, sin CDN. La política es:

| Archivos | `Cache-Control` | Por qué |
| --- | --- | --- |
| `assets/*` (JS, CSS y fuentes con hash en el nombre) | `public, max-age=31536000, immutable` | El nombre cambia cuando cambia el contenido, así que nunca se invalidan. |
| `favicon.svg`, `icons.svg` | `public, max-age=3600` | Sin hash, pero casi no cambian. |
| `index.html` | `no-cache` | Siempre se revalida: una versión nueva aparece de inmediato y apunta a los `assets/` nuevos. |

- `pnpm preview` aplica la misma política (plugin `cache-policy` en `vite.config.ts`).
- `pnpm check:cache http://localhost:4173` comprueba los encabezados que de verdad entrega un sitio (también sirve contra el endpoint publicado).
- `STORAGE_ACCOUNT=<cuenta> pnpm deploy:static` sube `dist/` con esos encabezados: primero `assets/`, al final `index.html`, para que nadie reciba un índice que apunte a archivos que aún no existen. `DRY_RUN=1` imprime los comandos sin ejecutarlos.
- Las fuentes se importan solo en el subconjunto `latin` (cubre el español); el resto de subconjuntos solo sumaba archivos al despliegue.
