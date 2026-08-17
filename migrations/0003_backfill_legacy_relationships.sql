BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';

INSERT INTO public.relationships (
  project_id, entity_a_type, entity_a_id, entity_b_type, entity_b_id,
  relationship_type_id, status, public_description, admin_notes,
  visibility_mode, metadata
)
SELECT p.camp_id, 'npc', r.parent_id, 'npc', r.child_id,
       rt.relationship_type_id, 'active', NULL, NULL, 'admin_only',
       jsonb_build_object('legacy_source','parent_child_relationships','legacy_id',r.relationship_id)
FROM public.parent_child_relationships r
JOIN public.npcs p ON p.n_id = r.parent_id
JOIN public.npcs c ON c.n_id = r.child_id AND c.camp_id = p.camp_id
JOIN public.relationship_types rt ON rt.code = 'parent'
WHERE NOT EXISTS (
  SELECT 1 FROM public.relationships x
  WHERE x.metadata->>'legacy_source' = 'parent_child_relationships'
    AND x.metadata->>'legacy_id' = r.relationship_id::text
);

INSERT INTO public.relationships (
  project_id, entity_a_type, entity_a_id, entity_b_type, entity_b_id,
  relationship_type_id, status, public_description, admin_notes,
  visibility_mode, metadata
)
SELECT a.camp_id, 'npc', r.partner1_id, 'npc', r.partner2_id,
       rt.relationship_type_id,
       CASE WHEN r.divorced THEN 'ended' ELSE 'active' END,
       NULL, r.notes, 'admin_only',
       jsonb_build_object(
         'legacy_source','romantic_relationships',
         'legacy_id',r.relationship_id,
         'legacy_type',r.relationship_type,
         'marriage',r.marriage,
         'divorced',r.divorced,
         'conflict',r.conflict
       )
FROM public.romantic_relationships r
JOIN public.npcs a ON a.n_id = r.partner1_id
JOIN public.npcs b ON b.n_id = r.partner2_id AND b.camp_id = a.camp_id
JOIN public.relationship_types rt ON rt.code = CASE WHEN r.marriage THEN 'spouse' ELSE 'romantic' END
WHERE NOT EXISTS (
  SELECT 1 FROM public.relationships x
  WHERE x.metadata->>'legacy_source' = 'romantic_relationships'
    AND x.metadata->>'legacy_id' = r.relationship_id::text
);

COMMIT;
