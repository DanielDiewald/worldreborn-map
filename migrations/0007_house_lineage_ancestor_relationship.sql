BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';

-- Keep rollback additive/non-destructive if an installation already had this type.
CREATE TABLE IF NOT EXISTS public.worldreborn_0007_object_state (
  object_key text PRIMARY KEY,
  existed_before boolean NOT NULL
);

INSERT INTO public.worldreborn_0007_object_state(object_key, existed_before)
VALUES (
  'relationship_type_ancestor',
  EXISTS(SELECT 1 FROM public.relationship_types WHERE code='ancestor')
)
ON CONFLICT(object_key) DO NOTHING;

-- A broad ancestor link is intentionally NOT a parent/child structure edge.
-- It may jump across several generations and is rendered as a dotted relationship.
INSERT INTO public.relationship_types(code,label,inverse_label,category,directed)
VALUES ('ancestor','Vorfahre','Nachfahre','family',true)
ON CONFLICT(code) DO NOTHING;

COMMIT;
