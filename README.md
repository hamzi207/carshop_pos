# carshop_pos

A multi-tenant B2B **POS & quoting engine** for automotive accessory shops: window film, vinyl wrap, PPF, car audio and aftermarket parts, with optional installation/labor services.

Each shop is its own tenant. Row-level security in Postgres keeps every shop's inventory, customers and quotes separate.

The full product and architecture spec is in [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md).

## Tech stack

- **Next.js 16** (App Router, React 19, TypeScript)
- **Supabase**: Postgres, Auth, Storage, Row Level Security
- **Tailwind CSS 4** + **shadcn/ui** (Radix) components
- **react-hook-form** + **zod** for forms and validation

## Getting started

**Prerequisites:** Node.js 20+ and access to the Supabase project (`atjbxwhvtattwiivrqbe`).

```bash
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev                  # http://localhost:3000
```

### Environment variables (`.env.local`)

| Variable | Where to find it | Used by |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | Browser + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys (publishable key) | Browser + server |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys (secret) | Server-only admin scripts |
| `SUPABASE_DB_URL` | Supabase → Connect → Session pooler | `db:push` / `db:types` only |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` locally | Auth email redirects |

`.env.local` is git-ignored. Never commit real keys.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (also type-checks) |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run db:push` | Apply `supabase/migrations/` to the database (needs `SUPABASE_DB_URL`) |
| `npm run db:types` | Regenerate `src/lib/types/database.types.ts` from the live schema |
| `npm run seed:vehicles` | Load Year/Make/Model data (2015–2026, top 20 makes) from NHTSA into `vehicles`. Safe to re-run; add `-- --dry-run` to preview without writing |

The database can also be managed through the Supabase MCP server configured in `.mcp.json`. See [`docs/supabase-mcp-setup.md`](docs/supabase-mcp-setup.md).

## Project layout

```
carshop_pos/
├── src/
│   ├── app/
│   │   ├── api/vehicles/     Year → Make → Model lookup API
│   │   ├── (auth)/           login & register pages
│   │   ├── (dashboard)/      signed-in app shell + dashboard
│   │   └── auth/callback/    Supabase email-confirmation handler
│   ├── components/
│   │   ├── auth/             auth forms
│   │   ├── shared/           sidebar, top bar, branding, user menu
│   │   └── ui/               shadcn/ui primitives
│   ├── lib/
│   │   ├── actions/          server actions
│   │   ├── supabase/         browser / server / middleware clients
│   │   ├── types/            generated database types
│   │   └── validations/      zod schemas
│   └── proxy.ts              session refresh + route protection
├── supabase/
│   ├── config.toml
│   └── migrations/           schema, RLS policies, payment procedure
├── scripts/
│   ├── db.mjs                db:push / db:types helper
│   └── seed-vehicles.mts     NHTSA vehicle seed (npm run seed:vehicles)
├── public/                   static assets
├── docs/                     spec, founder guide, MCP setup, phase notes
└── design/figma-ui/          Figma UI export (visual reference only, not built)
```

Root-level config files (`package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `components.json`, `.mcp.json`, `AGENTS.md`, `skills-lock.json`) must stay at the root, because the tools only look for them there.

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Auth, shop registration, multi-tenant schema + RLS, dashboard shell | Done |
| 2 | NHTSA vehicle catalog: seed script + `/api/vehicles` Year → Make → Model lookups | Built, in testing |
| 3+ | Inventory, customers/WhatsApp CRM, quoting, PDFs | See [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md) |

## License

See [`LICENSE`](LICENSE).
