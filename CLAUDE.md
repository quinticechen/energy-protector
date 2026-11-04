# Energy Protector

Whitelist-based YouTube playlists for elderly parents. A daily job picks videos from
trusted channels and writes them into private playlists on the parents' account; the
admin edits the whitelist and filters in a web UI.

- Product: `PRD｜HandPicked App.md` (Chinese)
- Design and decisions: `docs/mvp-design.md`
- Manual setup (accounts, secrets): `docs/setup.md`

## Layout

- `supabase/functions/_shared/` — all domain logic, plain TypeScript with explicit `.ts`
  imports and no dependencies, so it runs in Deno (Edge Functions), Node (CLI, tests)
  and the browser (filter preview). Keep it dependency-free.
- `supabase/functions/daily-sync`, `add-source` — Edge Functions (Deno).
- `supabase/migrations/` — schema and RLS. Admin access = row in `admins`.
- `cli/ep.ts` — one-time tasks: `link`, `import-subs`, `add-admin`, `sync`.
- `tests/` — `node:test` suites; `fakes.ts` holds in-memory YouTube and store fakes.

## Conventions

- UI text: Traditional Chinese by default via i18n; code, comments and docs in English.
- YouTube playlist names stay Chinese (今日精選, 好劇｜…): the parents see them.
- Never call the real YouTube API from tests; quota is 10,000 units/day.
- Node 22 runs TypeScript with `--experimental-strip-types`: no enums, no parameter
  properties, use `import type` for types.

## Verification (run after every change)

```sh
npm test            # node:test suites; passing = "# fail 0"
npm run typecheck   # tsc; needs typescript + @types/node installed
```

Until dev dependencies are installed, type-check with an existing compiler:
`../vista-content/node_modules/.bin/tsc -p tsconfig.json --typeRoots ../vista-content/node_modules/@types`.
