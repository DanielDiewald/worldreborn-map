BEGIN;
ALTER TABLE public.character_ancestry ADD COLUMN visible_to_player boolean NOT NULL DEFAULT false;
ALTER TABLE public.person_cultures ADD COLUMN visible_to_player boolean NOT NULL DEFAULT false;
COMMIT;
