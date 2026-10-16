# Expensely web app

The React, TypeScript, and Vite dashboard for Expensely.

## Local development

```bash
npm ci
cp .env.example .env.development.local
npm start
```

The development server runs at <http://localhost:3000> and proxies `/api`
requests to `http://127.0.0.1:8001`.

`VITE_API_BASE_URL` may be either `/api` for the development proxy or a
fully qualified deployed API URL ending in `/api`. Environment values are
embedded at build time; rebuild after changing production configuration.

When accessing the development server through a private network or reverse
proxy, set `VITE_ALLOWED_HOSTS` in `.env.development.local` to a comma-separated
list of trusted hostnames. Keep machine-specific hostnames out of committed
configuration.

## Checks

```bash
npm run test:ci
npm run build
```

`npm test` remains available for interactive watch mode while developing.
Production files are emitted to `dist/`.
