BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';

-- The legacy column was varchar(10); the canonical value "hermaphrodite" needs more room.
ALTER TABLE public.npcs
  ALTER COLUMN gender TYPE character varying(20);

-- Normalize values we can identify safely. Unknown legacy values are deliberately preserved
-- instead of guessing a gender for an existing person.
UPDATE public.npcs
SET gender = CASE lower(btrim(gender))
  WHEN 'm' THEN 'male'
  WHEN 'male' THEN 'male'
  WHEN 'mann' THEN 'male'
  WHEN 'männlich' THEN 'male'
  WHEN 'maennlich' THEN 'male'
  WHEN 'w' THEN 'female'
  WHEN 'f' THEN 'female'
  WHEN 'female' THEN 'female'
  WHEN 'frau' THEN 'female'
  WHEN 'weiblich' THEN 'female'
  WHEN 'hermaphrodit' THEN 'hermaphrodite'
  WHEN 'hermaphrodite' THEN 'hermaphrodite'
  WHEN 'hermaphroditisch' THEN 'hermaphrodite'
  WHEN 'intersex' THEN 'hermaphrodite'
  ELSE gender
END
WHERE gender IS NOT NULL AND btrim(gender) <> '';

CREATE TABLE public.races (
  race_id bigserial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  name character varying(120) NOT NULL,
  masculine_name character varying(120),
  feminine_name character varying(120),
  hermaphrodite_name character varying(120),
  description text,
  image text NOT NULL DEFAULT 'noimage',
  image_media_id bigint REFERENCES public.media(media_id) ON DELETE SET NULL,
  origin_map_id bigint REFERENCES public.project_maps(map_id) ON UPDATE CASCADE ON DELETE SET NULL,
  origin_coordinate_mode character varying(20),
  origin_x double precision,
  origin_y double precision,
  origin_lat double precision,
  origin_lng double precision,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT races_name_nonempty_check CHECK (btrim(name) <> ''),
  CONSTRAINT races_origin_mode_check CHECK (origin_coordinate_mode IS NULL OR origin_coordinate_mode IN ('xy','latlng')),
  CONSTRAINT races_origin_coordinates_check CHECK (
    (origin_map_id IS NULL AND origin_coordinate_mode IS NULL AND origin_x IS NULL AND origin_y IS NULL AND origin_lat IS NULL AND origin_lng IS NULL)
    OR
    (origin_map_id IS NOT NULL AND origin_coordinate_mode='xy' AND origin_x IS NOT NULL AND origin_y IS NOT NULL AND origin_lat IS NULL AND origin_lng IS NULL)
    OR
    (origin_map_id IS NOT NULL AND origin_coordinate_mode='latlng' AND origin_lat IS NOT NULL AND origin_lng IS NOT NULL AND origin_x IS NULL AND origin_y IS NULL)
  )
);

CREATE UNIQUE INDEX races_project_name_uidx
  ON public.races(project_id, lower(btrim(name)))
  WHERE archived_at IS NULL;

CREATE INDEX races_project_idx
  ON public.races(project_id, archived_at, name, race_id);

ALTER TABLE public.charakters
  ADD COLUMN race_id bigint REFERENCES public.races(race_id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Every existing authored race becomes a first-class project race. The spelling is preserved.
INSERT INTO public.races(project_id, name, metadata)
SELECT DISTINCT n.camp_id, btrim(c.race), '{"created_from":"legacy_charakters.race"}'::jsonb
FROM public.charakters c
JOIN public.npcs n ON n.n_id=c.n_id
WHERE NULLIF(btrim(c.race),'') IS NOT NULL
ON CONFLICT DO NOTHING;

-- Characters with an empty legacy value receive one explicit fallback race per project instead
-- of being left with a broken foreign key.
INSERT INTO public.races(project_id, name, metadata)
SELECT DISTINCT n.camp_id, 'Unbekannt', '{"created_from":"legacy_empty_race"}'::jsonb
FROM public.charakters c
JOIN public.npcs n ON n.n_id=c.n_id
WHERE NULLIF(btrim(c.race),'') IS NULL
ON CONFLICT DO NOTHING;

UPDATE public.charakters c
SET race_id = r.race_id,
    race = r.name
FROM public.npcs n
JOIN public.races r ON r.project_id=n.camp_id AND r.archived_at IS NULL
WHERE n.n_id=c.n_id
  AND lower(btrim(r.name)) = lower(btrim(COALESCE(NULLIF(c.race,''),'Unbekannt')));

CREATE INDEX charakters_race_id_idx ON public.charakters(race_id);

COMMIT;
