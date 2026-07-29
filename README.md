## MyEscrow Web

React/Next.js frontend for the MyEscrow MVP. The goal is to reproduce the interactive wireframes with production-ready tooling so we can progressively hook in live escrow APIs, authentication, and payment rails.

### Requirements

- Node.js `>=20`
- npm `>=10` (the repo relies on `npx` + workspace-aware scripts)

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Visit `http://localhost:3000` to use the app. Start building screens inside `src/app` using the design tokens we port from the wireframes.

### Quality gates

```bash
npm run lint    # ESLint (Next.js config)
npm run build   # type-check + production bundle
npm test        # Vitest + MSW integration coverage
```

### Notes

- Dependencies are pinned (`save-exact`) via `.npmrc`; use `npm install <pkg>@<version> --save` to add packages.
- Keep `.env.local` for secrets; it is ignored by Git by default.
- Use the `@/*` path alias (configured in `tsconfig.json`) for imports within `src/`.
- Mock dashboard responses live under `src/app/api/dashboard/*` and draw from `src/lib/mockDashboard.ts`. Swap those handlers to call the real backend (or keep them enabled with `NEXT_PUBLIC_USE_MOCKS=true`) depending on your environment.
- Buyer/seller chat is shown on every escrow detail view and in the slim live dashboard. The latest messages poll every three seconds; sends use idempotency keys and the composer remains available after disputes or escrow closure once both parties have joined.
- Support/admin arbitration alerts link to a printable and downloadable PDF case record. The affected buyer and seller receive the same report link in their dispute workspace; other users cannot retrieve the report or its exhibits. Reports exist only after arbitration is requested and combine the signed agreement, party identities, dispute/work evidence, complete timestamped chat, ledger, chronology, and integrity hash.
- A download verifies the canonical report-data SHA-256 and every managed file's byte count and SHA-256, then embeds each original unchanged as a PDF attachment. Report pages contain exhibit metadata covers only; exhibit content is not parsed, rendered, converted, or imported. `Arbitration-Report-Data.json` preserves an exact-Unicode machine-readable copy of the report data in the same PDF.
- Generation stops for a missing or mismatched file, more than 100 managed files, or more than `100,000,000` managed-evidence bytes. The final PDF is not digitally signed. Exhibits are not malware-scanned and must be treated as untrusted when extracted or opened. Legacy metadata-only references remain visible in the manifest but have no bytes to embed unless they match a managed file from the arbitration.
- The React Query hooks call `apiFetch` (see `src/lib/apiClient.ts`). Set `NEXT_PUBLIC_API_BASE_URL` to point at a staging/production API and flip `NEXT_PUBLIC_USE_MOCKS=false` to route traffic directly to it; when mocks are disabled, the built-in API handlers proxy requests to the backend so `/api/*` still works without extra CORS setup.
- `NEXT_PUBLIC_LIVE_DASHBOARD=true` enables the slim production dashboard. Leave it unset/false to keep the immersive demo UI while still hitting a real backend.

### Switching between mocks and staging

1. Create or edit `.env.local` and set `NEXT_PUBLIC_API_BASE_URL` to your staging API.
2. Toggle `NEXT_PUBLIC_USE_MOCKS` to `false` to bypass the mock handlers; the `/api/*` routes will now proxy the payloads to the backend using the base URL above.
3. Set `NEXT_PUBLIC_LIVE_DASHBOARD=true` **only** when you want the production dashboard layout; keep it `false` (default) to retain the immersive mock UI while still pointing at staging APIs.
4. Optionally set `NEXT_PUBLIC_API_TOKEN=<bearer token>`; `apiFetch` injects it as an `Authorization` header on every staging request so you can hit authenticated routes without modifying each hook.
5. Leave `NEXT_PUBLIC_USE_MOCKS=true` when working offline—the React Query hooks will fall back to the mock handlers automatically.

### Authentication

- Navigate to `/signup` to create a demo account or `/login` to use an existing one; successful auth redirects to the dashboard.
- Signup enforces fintech-style passwords: at least 12 characters with upper, lower, number, and symbol (common passwords such as `password123` are blocked).
- After submitting the signup form we redirect to `/verify-email`, which accepts the 6-digit code sent by the API (`useVerifyEmailMutation`). You can request a new code from the same screen via `useResendVerificationMutation`. When the backend sets `AUTH_DEBUG_CODES=true`, the verification page will prefill the code for local testing.
- Mock mode (`NEXT_PUBLIC_USE_MOCKS=true`) skips verification entirely because tokens never leave the browser.
- `AuthProvider` (wrapping the app) stores the current user + token in memory/localStorage and updates the `Authorization` header via `apiFetch`.
- The dashboard requires authentication and redirects unauthenticated visitors back to `/login`.
