# WorldReborn Architecture

## Goal

WorldReborn evolves the existing static Leaflet map and PostgreSQL schema into a self-hosted worldbuilding application without replacing or deleting legacy data. The existing `campaigns` table remains the project/world root, and `camp_id = 1` (Aetheris) remains intact.

## Current-state findings

### Repository

The existing repository is intentionally small from an application-code perspective:

- `index.html` hosts a static Leaflet map.
- Map tiles live under `map/{z}/{x}/{y}.jpeg`.
- The current Leaflet configuration uses center `[0, 0]`, `minZoom: 3`, `maxZoom: 6`, `noWrap: true`.
- Player-origin markers are currently hard coded in `index.html`.
- Existing map/icon assets must remain authoritative legacy assets.

The new application is added under `web/` so the old GitHub Pages map remains usable while the self-hosted application is introduced incrementally.

### PostgreSQL dump

The dump contains 12 tables and one materialized view:

- `campaigns`: 1 row (Aetheris, `camp_id = 1`)
- `npcs`: 130 rows
- `locations`: 26 rows
- `groups`: 18 rows
- `charakters`: 114 rows
- `gods`: 16 rows
- `users`: 5 rows
- `chars`: 0 rows
- `events`: 0 rows
- `is_part_of`: 44 rows
- `parent_child_relationships`: 53 rows
- `romantic_relationships`: 19 rows
- `view_npc`: materialized view restricted to `n_id = 1`, created `WITH NO DATA`

All checked foreign-key references in the dump resolve to existing rows.

Important legacy modeling decisions:

1. `npcs.n_id` is already the central person identity.
2. `gods.n_id -> npcs.n_id` makes a god a specialization of a person.
3. `charakters.n_id -> npcs.n_id` makes a character a specialization of a person.
4. Family and romantic relationship tables point directly to `npcs.n_id`, so gods and player characters can participate without duplicating person rows.
5. `groups.members` is a legacy counter, while `is_part_of` already stores real membership rows for `charakters`.

Important risks:

- `events` has no direct `camp_id`; project context is only inferable through an optional `loc_id`.
- `users` has no project assignment.
- `is_part_of` has no primary key or unique constraint.
- PostgreSQL does not automatically create indexes for foreign-key columns; the dump contains no dedicated FK/query indexes.
- Legacy HTML is present in campaign descriptions, NPC notes, and group notes. It must be sanitized on render.
- The `campaigns_camp_id_seq` value is 8 although only `camp_id = 1` exists in the dump. The sequence must not be reset downward because deleted or external IDs may have existed.
- `view_npc` is unusual but must be preserved until its consumers are known.

## Target architecture

### Runtime

- Next.js 16 App Router under `web/`
- React 19
- TypeScript
- PostgreSQL
- Drizzle ORM with the `pg` driver
- Server Components and Route Handlers for server-owned data access
- Server-side sessions stored in PostgreSQL
- HTTP-only, SameSite cookies containing only opaque random session tokens

The application remains a single deployable web service plus PostgreSQL and optional object storage. No microservice split is introduced.

### Repository layout

```text
/
  index.html                  # legacy GitHub Pages map, unchanged
  map/                        # legacy tile assets, unchanged
  icons/                      # legacy map icons, unchanged
  docs/
    architecture.md
    database-migration.md
  migrations/
    0001_worldreborn_foundation.sql
    0001_worldreborn_foundation.down.sql
  web/
    src/app/                  # Next.js routes and pages
    src/lib/                  # db, auth, permissions, entity services
    scripts/                  # controlled import tools
    .env.example
    package.json
```

### Project isolation

Every server query is executed with an explicit project ID. Legacy entities are mapped as follows:

- NPC -> `npcs.camp_id`
- God -> `gods.n_id -> npcs.camp_id`
- Character -> `charakters.n_id -> npcs.camp_id`
- Location -> `locations.camp_id`
- Group -> `groups.camp_id`
- Event -> new `events.camp_id` (with legacy location backfill when possible)

No player-facing service accepts an entity ID without also checking the project context.

### Person model

Do not create a replacement `people` table in the first migration. `npcs.n_id` remains the canonical legacy person key because it is already referenced by gods, characters, and family/romantic relations.

New generic relationship records therefore use polymorphic entity references, while legacy family/romantic tables remain readable through adapters. A later controlled migration may copy legacy relationships into the generic table once output parity is proven.

### Authorization model

Authorization is centralized in `src/lib/permissions.ts`.

For a player request:

1. Resolve a valid player session.
2. Verify the player belongs to the requested project.
3. Verify the base entity belongs to the same project.
4. Determine base visibility (`admin_only`, `all_players`, or explicit grant).
5. Apply `entity_visibility` for per-player grants/denials.
6. Apply a `player_entity_variants` override if one exists.
7. Return only the permitted/variant representation.

The player never receives the hidden base row and never receives variants for other players.

### Sessions and access codes

Admin and player sessions are stored server-side. Browser cookies contain random bearer tokens. Only SHA-256 hashes of those tokens are stored in the database.

Admin password verification supports an Argon2id hash via `ADMIN_PASSWORD_HASH`. Development can derive a hash from `ADMIN_PASSWORD` at process startup so the development value is never embedded in client code or committed source.

Player access codes use the same principle: the displayed code exists only when generated; the database stores a hash plus a short non-secret prefix for identification.

### Map integration

Aetheris gets a `project_maps` row configured as a tile map with the original zoom levels. The first implementation serves the legacy repository tiles through a read-only Next.js route so no tile files need to be moved or rewritten.

Legacy hard-coded markers are imported by an idempotent script into `map_markers`. The script preserves coordinates and labels. Entity linking is conservative: it links only when an unambiguous matching entity is found; otherwise the marker remains a custom legacy marker.

### Legacy HTML

Existing HTML is data, not trusted markup. It is preserved in PostgreSQL but must be sanitized before rendering. New editing should use Markdown or a constrained rich-text format instead of arbitrary HTML.

### Storage

`media` stores metadata independently from storage. Existing external URLs remain valid. New uploads use a storage adapter interface so local disk can later be replaced by S3-compatible object storage without changing entity tables.

## Delivery phases

1. Foundation: additive migration, DB connection, admin session, project list, NPC CRUD.
2. Map: Aetheris project map, DB markers, drag/update endpoints, new project map configuration.
3. Players: player records, hashed access codes, sessions, project-scoped visibility.
4. Player variants: per-player overrides and standalone decoys.
5. Timeline and relationships: generic relationships plus legacy adapters, family tree, graph.
6. Media/search/tags/test hardening and UI polish.

After every phase: lint, typecheck, tests, build.
