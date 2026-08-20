BEGIN;
ALTER TABLE public.person_cultures DROP COLUMN IF EXISTS visible_to_player;
ALTER TABLE public.character_ancestry DROP COLUMN IF EXISTS visible_to_player;
COMMIT;
