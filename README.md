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
- Mock dashboard responses live under `src/app/api/dashboard/*` and draw from `src/lib/mockDashboard.ts`. Swap those handlers to call the real backend (or disable them) when wiring to production services.
- The React Query hooks call `apiFetch` (see `src/lib/apiClient.ts`). Set `NEXT_PUBLIC_API_BASE_URL` to point at a staging/production API and flip `NEXT_PUBLIC_USE_MOCKS=false` to route traffic directly to it; when mocks are disabled, the built-in API handlers short-circuit with 404s so you can verify that the real backend is being used.
