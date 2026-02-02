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
- The React Query hooks call `apiFetch` (see `src/lib/apiClient.ts`). Set `NEXT_PUBLIC_API_BASE_URL` to point at a staging/production API and flip `NEXT_PUBLIC_USE_MOCKS=false` to route traffic directly to it; when mocks are disabled, the built-in API handlers proxy requests to the backend so `/api/*` still works without extra CORS setup.

### Switching between mocks and staging

1. Create or edit `.env.local` and set `NEXT_PUBLIC_API_BASE_URL` to your staging API.
2. Toggle `NEXT_PUBLIC_USE_MOCKS` to `false` to bypass the mock handlers; the `/api/*` routes will now proxy the payloads to the backend using the base URL above.
3. Optionally set `NEXT_PUBLIC_API_TOKEN=<bearer token>`; `apiFetch` injects it as an `Authorization` header on every staging request so you can hit authenticated routes without modifying each hook.
4. Leave `NEXT_PUBLIC_USE_MOCKS=true` when working offline—the React Query hooks will fall back to the mock handlers automatically.

### Authentication

- Navigate to `/signup` to create a demo account or `/login` to use an existing one; successful auth redirects to the dashboard.
- `AuthProvider` (wrapping the app) stores the current user + token in memory/localStorage and updates the `Authorization` header via `apiFetch`.
- The dashboard requires authentication and redirects unauthenticated visitors back to `/login`.
