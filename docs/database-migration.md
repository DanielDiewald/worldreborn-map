# Database Migration Plan

## Principles

The migration is additive and reversible at the schema level. It does not delete legacy tables, legacy rows, IDs, sequences, or relationships.

Before applying any migration to a live database:

1. Take a `pg_dump` backup.
2. Restore that backup into a disposable PostgreSQL instance and run the migration there first.
3. Compare row counts and key IDs before and after migration.
4. Run the application read-path checks against the restored copy.
5. Only then apply the migration to the live database.

## Legacy snapshot from `worldreborn250819.sql`

| Object | Rows | Notes |
| --- | ---: | --- |
| campaigns | 1 | Aetheris is `camp_id = 1` |
| npcs | 130 | canonical person identity via `n_id` |
| charakters | 114 | specialization of `npcs` |
| gods | 16 | specialization of `npcs` |
| locations | 26 | all belong to Aetheris |
| groups | 18 | all belong to Aetheris |
| users | 5 | no project column yet |
| chars | 0 | player-character link table currently empty |
| events | 0 | no direct project column |
| is_part_of | 44 | real membership rows but no PK/unique |
| parent_child_relationships | 53 | person-to-person via `npcs.n_id` |
| romantic_relationships | 19 | person-to-person via `npcs.n_id` |

The dump's checked foreign keys are internally consistent.

## Changes in migration 0001

### Existing tables extended

`campaigns`

- status/settings/timestamps
- in-world display date
- primary map reference

`npcs`

- public description
- admin notes
- title/species/profession
- visibility mode
- metadata/timestamp

`locations`

- hierarchy (`parent_loc_id`)
- type/description/owner/population
- visibility mode
- metadata/timestamp

`groups`

- group type
- visibility mode
- metadata/timestamp

`events`

- direct `camp_id`
- fantasy date fields and sort value
- category/importance/visibility
- metadata/timestamp

`users`

- optional project assignment
- display name
- active flag/timestamps

Existing values are preserved. New columns either have safe defaults or remain nullable where an automatic backfill could be ambiguous.

### New tables

- `auth_rate_limits`
- `admin_sessions`
- `player_sessions`
- `project_maps`
- `map_markers`
- `media`
- `entity_visibility`
- `player_access_codes`
- `player_entity_variants`
- `relationship_types`
- `relationships`
- `group_memberships`
- `tags`
- `entity_tags`
- `timeline_links`
- `audit_log`

### Indexes

Indexes are added for the project/player/entity/map access paths used by authorization and map/timeline queries. Legacy foreign-key columns also receive query indexes where useful.

### Aetheris map configuration

If `campaigns.camp_id = 1` exists, migration 0001 creates one primary tile-map configuration using:

- tile route: `/api/legacy-map/{z}/{x}/{y}.jpeg`
- center: `0, 0`
- min zoom: `3`
- max zoom: `6`

This is configuration for the existing map, not demo data.

## Compatibility strategy

Legacy family and romantic relations remain authoritative in phase 1. The new generic relationship table exists for new relationship types, but migration 0001 deliberately does not copy legacy relationships into it. This avoids creating two competing writable sources before parity tests exist.

The application relationship service will initially read:

- legacy parent/child rows
- legacy romantic rows
- new generic relationship rows

A later idempotent migration can backfill legacy rows into the generic table after graph/family-tree parity tests pass.

`view_npc` is not modified or dropped.

`groups.members` is not dropped. New writes should use relationship/membership rows and can update the legacy counter only as a compatibility field until old consumers are removed.

## Apply

From the repository root:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0001_worldreborn_foundation.sql
```

Then run the legacy map marker import from `web/` after dependencies are installed:

```bash
npm run import:legacy-map
```

## Verification queries

```sql
SELECT camp_id, name FROM campaigns ORDER BY camp_id;
SELECT count(*) FROM npcs;
SELECT count(*) FROM locations;
SELECT count(*) FROM groups;
SELECT count(*) FROM parent_child_relationships;
SELECT count(*) FROM romantic_relationships;
SELECT * FROM project_maps WHERE project_id = 1;
```

Expected legacy counts for the supplied dump are 130 NPCs, 26 locations, 18 groups, 53 parent-child relationships, and 19 romantic relationships.

## Rollback

`0001_worldreborn_foundation.down.sql` removes only objects introduced by migration 0001 and removes the added columns. It does not touch pre-existing columns, tables, rows, IDs, or sequences.

Important: a down migration should only be used before production data has been created in the new tables/columns. Once new application data exists, prefer a forward fix or a data-preserving rollback migration rather than dropping that new data.
