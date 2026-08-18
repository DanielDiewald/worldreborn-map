# WorldReborn canonical data model

## Person identity

WorldReborn keeps the legacy person model. It does **not** introduce a competing `persons` table.

`npcs` is the shared person base table. The canonical person identifier is always `npcs.n_id`.

```text
PERSON
npcs (n_id)
  |-- charakters (char_id, n_id)  normal world Character / NPC
  `-- gods       (g_id, n_id)     God
```

A Player Character is not a third person subtype. It is a Character person assigned to a user:

```text
users
  -> chars (user_id, n_id)
  -> npcs (n_id)
  -> charakters (n_id)
```

Therefore:

- normal NPC / Character = `npcs + charakters`;
- God = `npcs + gods`;
- Player Character = `npcs + charakters + chars + users`;
- `char_id` identifies only the `charakters` row;
- `g_id` identifies only the `gods` row;
- relationships, visibility, variants, tags, timeline links, map markers, media and group memberships use `person + n_id`.

Example from the legacy data:

```text
Person #71
  npcs.n_id = 71
  charakters.char_id = 49

person id = 71
not 49
```

Code that receives a legacy/UI reference such as `npc+n_id`, `character+char_id`, `god+g_id`, or `person+n_id` must call `resolveEntityReference()` and persist the canonical output.

## Proven legacy partition

For the supplied Aetheris dump the expected partition is:

| Domain | Count |
|---|---:|
| Person base rows (`npcs`) | 130 |
| Character/NPC persons (`npcs + charakters`) | 114 |
| God persons (`npcs + gods`) | 16 |
| Player Characters (`chars`) | 0 |
| Character/God overlap | 0 |
| Base-only persons | 0 |

The application preserves the Character XOR God invariant. New completed person transactions must leave exactly one subtype.

## Group membership

`groups.members` is the legacy estimated/total organization size. It is **not** the count of relational memberships and must not be recomputed when memberships change.

`group_memberships` contains known named entities. For legacy `is_part_of(gr_id, char_id)`, migration first resolves `charakters.char_id -> charakters.n_id` and stores:

```text
entity_type = person
entity_id   = n_id
```

The UI may present these separately as total members and known members.

## Relationships

Person endpoints use `entity_type='person'` and `entity_id=npcs.n_id`. Parent/child and romantic legacy rows already refer to `n_id` and are backfilled without inventing new person identities.

Legacy romantic labels remain recoverable in relationship metadata (`legacy_source`, `legacy_id`, `legacy_type`, `marriage`, `divorced`, `conflict`). The normalized relationship type is a presentation/domain mapping, not a destructive replacement of the legacy value.

## Player knowledge

Person visibility and player variants are keyed by `person + n_id`. `canPlayerViewPerson(projectId, playerId, nId)` is the canonical person authorization check. Player-facing search, map, timeline, relationship, group and media paths must filter hidden targets server-side before serialization.

Standalone decoys use an opaque `decoy:<id>` public identity and do not impersonate a real `n_id`.

## Legacy data compatibility

Do not mass-normalize historical content. Preserve source strings such as trailing/double whitespace, `unknown`, `noimage`, `no notes yet`, default birthdays, fantasy ages, legacy HTML and original relationship labels. Normalize only for safe comparison/matching where necessary.

Legacy image values can be HTTPS URLs, known relative paths, placeholders, or malformed values. Treat legacy HTML as untrusted and sanitize it before rendering.

## Migration rule

Never edit a migration that may already have been applied. Corrections are added as later reversible migrations. `0004_person_identity_normalization.sql` records old/new generic person references in `person_reference_migration_log` so rollback can restore the previous namespaces instead of guessing IDs.
