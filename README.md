# WorldReborn

WorldReborn is being evolved from the existing static WorldReborn/Aetheris Leaflet map into a self-hosted worldbuilding and campaign-management application. The migration is intentionally additive: the legacy map assets, PostgreSQL IDs, relationships, and existing data remain authoritative and are not replaced by demo data.

## Current implementation status

This foundation implements the first part of the MVP:

- architecture and database migration documentation;
- a reversible additive PostgreSQL foundation migration;
- Next.js/TypeScript application under `web/` without replacing the legacy GitHub Pages files;
- server-side admin login and opaque database-backed sessions;
- login rate limiting;
- project/world selection backed by the existing `campaigns` table;
- project-isolated NPC list/create/edit/archive backed by PostgreSQL;
- centralized player visibility/variant service foundation;
- Aetheris legacy map configuration plus a tile-serving API;
- idempotent import of the markers that are currently hard coded in the legacy `index.html`;
- health endpoint.

Player login, the full map editor, media upload, timeline, family tree, relationship graph, and the remaining CRUD areas are subsequent MVP phases described in `docs/architecture.md`.

## Repository layout

The legacy map stays at repository root (`index.html`, `map/`, `icons/`, `scripts/`). The new application is isolated in `web/`. Database changes are in `migrations/`; design decisions are in `docs/`.

## Requirements

- Node.js compatible with Next.js 16
- npm
- PostgreSQL containing the existing WorldReborn schema/data

Do not expose PostgreSQL directly to the browser. All credentials and secrets belong in environment variables.

## Environment

```bash
cd web
cp .env.example .env.local
```

Configure at least:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@DATABASE_HOST:5432/worldreborn
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin
```

`ADMIN_PASSWORD=admin` is development-only. Production should use `ADMIN_PASSWORD_HASH` with an Argon2id hash and should not keep a plaintext admin password in environment configuration longer than necessary.

If the web process is launched from a directory where `../map` does not point to the legacy tile root, set `LEGACY_MAP_ROOT` to the absolute path of the repository's `map/` directory.

## Database backup first

Before applying any migration, create and verify a backup. The supplied migration does not delete legacy rows or change existing IDs, but a backup is still mandatory operational practice.

Example:

```bash
pg_dump "$DATABASE_URL" --format=custom --file=worldreborn-before-foundation.dump
```

## Install and migrate

```bash
cd web
npm install
npm run db:migrate
npm run import:legacy-map
npm run dev
```

The migration configures campaign `camp_id = 1` as the existing Aetheris project and points its primary tile map at the legacy map endpoint. The marker import is idempotent by `source_key` and only links a marker to an NPC when exactly one existing NPC name matches; it does not create fake NPCs to force a match.

## Admin login

Open `/admin/login`. With the development `.env.local` above, the credentials are `admin` / `admin`. The password is verified on the server with Argon2id; the browser receives only an HTTP-only session cookie containing a random opaque token. The database stores a SHA-256 hash of that session token.

## Player login

The player-code schema and permission/variant foundation are included, but the `/player` login UI and issuance workflow are intentionally not claimed as complete in this first implementation slice. Those are Phase 3/4 items and must use hashed access codes and server-side authorization before being exposed.

## Legacy map

The original tile tree and icons are retained. Aetheris is seeded with:

- map type: tile;
- tile URL: `/api/legacy-map/{z}/{x}/{y}.jpeg`;
- min zoom: 3;
- max zoom: 6;
- no-wrap legacy metadata.

The legacy markers are imported with:

```bash
cd web
npm run import:legacy-map
```

After the map UI is migrated to the database-backed marker API, the old hard-coded markers can stop being used by the application without deleting the source history or tile assets.

## Development checks

After dependencies are installed:

```bash
npm run lint
npm run typecheck
npm run build
```

A database connection is required for runtime routes and server-rendered admin pages. The health endpoint is `/api/health` and returns a generic 503 response on database failure without exposing stack traces.

## Production build

```bash
cd web
npm ci
npm run build
npm start
```

Run behind HTTPS and a reverse proxy. Set production secrets through the deployment environment, not Git. If using the standalone build outside the repository layout, configure `LEGACY_MAP_ROOT` or package the legacy map assets alongside the service.

## Storage / images

Existing external image URLs remain valid. The migration adds a general `media` table for future uploads. New upload handling is not yet enabled in this foundation; when enabled it must validate real MIME type, enforce size limits, randomize internal file names, prevent path traversal, and keep files non-executable. A storage adapter can later target local or S3-compatible storage.

## Migration and rollback

Detailed schema analysis and commands are in `docs/database-migration.md`.

Apply:

```bash
cd web
npm run db:migrate
```

Rollback the foundation additions:

```bash
cd web
npm run db:rollback
```

The rollback removes structures introduced by this migration but does not delete legacy tables or legacy rows. As with all schema changes, restore from the verified pre-migration backup if operational validation fails.

## Security model

Project context is part of every relevant service query. Player-facing data must be filtered server-side before it is serialized. `entity_visibility` expresses explicit access, while `player_entity_variants` provides per-player overrides/decoys. The central service in `web/src/lib/permissions.ts` is the starting point for `canPlayerViewEntity(...)` and `getEntityForPlayer(...)`; future map, timeline, search, relationships, and family-tree endpoints must call the same authorization layer rather than hiding secret data in React components.

## Architecture

See:

- `docs/architecture.md`
- `docs/database-migration.md`
