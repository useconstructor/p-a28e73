# Menú y Pedidos

Spanish demonstration ordering application using Next.js 16, Tailwind 4, local Inter/Barlow Condensed fonts, Radix/shadcn controls, and server-only Turso/libSQL persistence.

## Run

`npm install`, `npm run dev`; production: `npm run build` then `npm start`.

Required server environment: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`. No client credentials, browser storage persistence or alternate database fallback. Schema and example initialization run in an atomic transaction. Existing platform catalog and order records are preserved.

Optional deployment configuration: `NEXT_PUBLIC_APP_URL` is the canonical HTTPS app origin; `ALLOWED_ORIGINS` is an explicit comma-separated list of additional trusted origins. Vercel canonical URLs and the request app host are accepted. Cross-site embedding makes same-origin app API requests; private cookies are Secure, HttpOnly, SameSite=None and Partitioned in production. Use HTTPS for deployed and cross-site embedded testing. HTTP loopback hosts localhost and 127.0.0.1 use HttpOnly SameSite=Lax cookies for local QA; this exception never applies to a deployed host.

Routes: `/`, `/pedido`, `/confirmacion`. API: GET `/api/menu`, GET/PATCH `/api/borrador`, POST `/api/pedidos`, GET `/api/confirmacion`. Sessions authorize exclusively via cookies. Draft revisions reject stale writes; orders use atomic snapshot insertion and a unique idempotency key per session.

Example prices and product details are fictitious catalog records and explicitly labelled throughout the UI. Resource provenance is recorded in ASSETS.md.
