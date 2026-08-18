# WorldReborn

WorldReborn evolves the existing Aetheris/WorldReborn map into a self-hosted worldbuilding and campaign-management application without replacing the authoritative legacy data. Legacy table rows, IDs, map assets, relationship labels and worldbuilding content remain preserved.

## Canonical person model

The most important domain rule is documented in [`docs/data-model.md`](docs/data-model.md):

- `npcs` is the shared **person base**;
- `npcs.n_id` is the canonical person ID;
- `charakters` is the normal Character/NPC subtype;
- `gods` is the God subtype;
- `chars` assigns a Character person to a `users` player;
- `char_id` and `g_id` are subtype-row IDs, never universal person IDs;
- generic person references are persisted as `person + n_id`.

For the supplied Aetheris dump the acceptance baseline is 130 persons = 114 Character/NPC persons + 16 Gods, with 0 Player Characters before new/test data.

## Requirements

- Node.js 24 for the CI/reference environment
- npm
- PostgreSQL 17 or a client/server combination able to restore the supplied custom archive
- a verified database backup before applying migrations

## Repository layout

- legacy map/site assets: repository root, `map/`, `icons/`, `scripts/`
- Next.js application: `web/`
- additive/reversible database migrations: `migrations/`
- architecture/data-model documentation: `docs/`
- legacy acceptance fixture: `worldreborn-before-foundation.dump`

## Environment

```bash
cd web
cp .env.example .env.local
```

At minimum configure:

```dotenv
DATABASE_URL=postgresql://worldreborn:worldreborn@127.0.0.1:5432/worldreborn
ADMIN_USERNAME=admin
ADMIN_PASSWORD=development-only-password
```

Use `ADMIN_PASSWORD_HASH`/production secret management for production. Never commit credentials. If the web process cannot resolve `../map`, set `LEGACY_MAP_ROOT` to the absolute legacy tile directory.

## Install, migrate and audit

```bash
cd web
npm ci
npm run db:migrate
npm run db:audit
npm run dev
```

`npm run db:audit` is read-only. It reports structural failures as `ERROR` and tolerated historical data-quality conditions as `WARNING`. In particular, `groups.members != known memberships` is expected to be a warning because those values represent different concepts.

The CI workflow restores `worldreborn-before-foundation.dump` with PostgreSQL 17, verifies the exact pre-migration baseline, applies migrations, runs the read-only audit, then executes lint, typecheck, tests and the production build.

## Migration and rollback

Apply all pending additive migrations:

```bash
cd web
npm run db:migrate
```

Roll back the latest migration:

```bash
npm run db:rollback
```

Do not edit a migration that may already have been applied. Corrections are added as later migrations. `0004_person_identity_normalization.sql` logs old/new generic person references so its rollback can restore the old namespace without numerically guessing `char_id`, `g_id` or `n_id`.

Never reset sequences with `setval(sequence, count(*))`; historical gaps are valid.

## Legacy data rules

Do not mass-clean historical worldbuilding data. Preserve values such as trailing/double whitespace, `unknown`, `noimage`, `no notes yet`, the common `2000-01-01` birthday placeholder, fantasy ages, legacy HTML, external URLs and original relationship labels. Normalize only for safe comparison/matching.

`groups.members` is the estimated/total organization size. Known named members live in `group_memberships`; adding/removing a membership must not rewrite `groups.members`.

Legacy HTML is untrusted content and must be sanitized before rendering. Legacy images may be HTTPS URLs, known relative paths or placeholders; malformed values must fail safely rather than being interpreted as filesystem paths or media IDs.

## Maps

The Aetheris legacy tile tree remains intact. Database-backed maps support tile/image map records and map markers. Person markers use `entity_type='person'` and `entity_id=n_id`; the visual marker role can still distinguish NPC, God or Character.

The legacy marker import remains available:

```bash
cd web
npm run import:legacy-map
```

Name matching is only a lookup aid; after an unambiguous match the real entity ID is stored.

## Player knowledge and security

Player-facing data is filtered on the server before serialization. Person visibility and variants use `person + n_id`; `canPlayerViewPerson(projectId, playerId, nId)` is the canonical person visibility check.

The application uses server-side sessions, hashed player access codes, project-scoped database queries, upload validation and authorized media delivery. Mutating routes/actions must retain origin/CSRF protection, project isolation and generic client-safe errors. Never expose SQL details, secrets or hidden entity IDs to players.

## Development checks

```bash
cd web
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Database-backed integration tests run when `DATABASE_URL` is available. The GitHub Actions `Quality` workflow supplies a restored PostgreSQL 17 legacy database and therefore runs the full migration acceptance path.

## Production

```bash
cd web
npm ci
npm run build
npm start
```

Run behind HTTPS and a reverse proxy. Keep uploads outside executable/public paths and serve them only through authorized delivery endpoints. Configure production secrets through the deployment environment.

## Documentation

- [`docs/data-model.md`](docs/data-model.md)
- [`docs/architecture.md`](docs/architecture.md)
- [`docs/database-migration.md`](docs/database-migration.md)
