BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';

-- Additive project calendar. Existing campaigns.in_world_date remains untouched for legacy compatibility.
CREATE TABLE IF NOT EXISTS public.project_calendars (
  calendar_id bigserial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  name character varying(160) NOT NULL,
  days_per_year integer NOT NULL CHECK (days_per_year > 0),
  has_year_zero boolean NOT NULL DEFAULT false,
  before_era_label character varying(40) NOT NULL DEFAULT 'v.Z.',
  after_era_label character varying(40) NOT NULL DEFAULT 'n.Z.',
  current_era character varying(10) NOT NULL DEFAULT 'after' CHECK (current_era IN ('before','after')),
  current_year integer NOT NULL DEFAULT 1 CHECK (current_year >= 0),
  current_month integer NOT NULL DEFAULT 1 CHECK (current_month > 0),
  current_day integer NOT NULL DEFAULT 1 CHECK (current_day > 0),
  current_world_day bigint,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS project_calendars_one_active_uidx
  ON public.project_calendars(project_id)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS project_calendars_project_idx ON public.project_calendars(project_id, calendar_id);

CREATE TABLE IF NOT EXISTS public.calendar_months (
  month_id bigserial PRIMARY KEY,
  calendar_id bigint NOT NULL REFERENCES public.project_calendars(calendar_id) ON UPDATE CASCADE ON DELETE CASCADE,
  sort_order integer NOT NULL CHECK (sort_order > 0),
  name character varying(120) NOT NULL,
  days integer NOT NULL CHECK (days > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (calendar_id, sort_order)
);
CREATE INDEX IF NOT EXISTS calendar_months_calendar_idx ON public.calendar_months(calendar_id, sort_order);

-- Generic fantasy dates for person birth/death and future entity date fields.
CREATE TABLE IF NOT EXISTS public.fantasy_dates (
  fantasy_date_id bigserial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  calendar_id bigint NOT NULL REFERENCES public.project_calendars(calendar_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  entity_type character varying(40) NOT NULL,
  entity_id bigint NOT NULL,
  field_key character varying(60) NOT NULL,
  era character varying(10) NOT NULL CHECK (era IN ('before','after')),
  year integer NOT NULL CHECK (year >= 0),
  month integer,
  day integer,
  precision character varying(30) NOT NULL CHECK (precision IN ('exact_day','month','year','approximate_year','range','unknown')),
  range_end_era character varying(10) CHECK (range_end_era IS NULL OR range_end_era IN ('before','after')),
  range_end_year integer CHECK (range_end_year IS NULL OR range_end_year >= 0),
  range_end_month integer,
  range_end_day integer,
  ordinal_start bigint,
  ordinal_end bigint,
  source character varying(40) NOT NULL DEFAULT 'manual',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (project_id, entity_type, entity_id, field_key),
  CONSTRAINT fantasy_dates_precision_shape_check CHECK (
    precision = 'unknown'
    OR (precision = 'exact_day' AND month IS NOT NULL AND day IS NOT NULL)
    OR (precision = 'month' AND month IS NOT NULL)
    OR precision IN ('year','approximate_year')
    OR (precision = 'range' AND range_end_era IS NOT NULL AND range_end_year IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS fantasy_dates_entity_idx ON public.fantasy_dates(project_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS fantasy_dates_ordinal_idx ON public.fantasy_dates(project_id, calendar_id, ordinal_start, ordinal_end);

-- Explicit audit for legacy age/birthday and race/species reconciliation. No values are overwritten here.
CREATE TABLE IF NOT EXISTS public.calendar_migration_audit (
  audit_id bigserial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  person_id integer NOT NULL REFERENCES public.npcs(n_id) ON UPDATE CASCADE ON DELETE CASCADE,
  old_age integer,
  old_birthday text,
  old_species text,
  old_race text,
  new_fantasy_date_id bigint REFERENCES public.fantasy_dates(fantasy_date_id) ON DELETE SET NULL,
  migration_method character varying(50) NOT NULL DEFAULT 'unresolved',
  status character varying(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','migrated','needs_review','skipped')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (project_id, person_id)
);
CREATE INDEX IF NOT EXISTS calendar_migration_audit_status_idx ON public.calendar_migration_audit(project_id, status, person_id);

-- Media stays path-compatible, but entities may now retain the canonical media row too.
ALTER TABLE public.npcs ADD COLUMN IF NOT EXISTS image_media_id bigint;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS image_media_id bigint;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS image_media_id bigint;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS image_media_id bigint;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS image_media_id bigint;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS logo_media_id bigint;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='npcs_image_media_id_fkey') THEN
    ALTER TABLE public.npcs ADD CONSTRAINT npcs_image_media_id_fkey FOREIGN KEY (image_media_id) REFERENCES public.media(media_id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='groups_image_media_id_fkey') THEN
    ALTER TABLE public.groups ADD CONSTRAINT groups_image_media_id_fkey FOREIGN KEY (image_media_id) REFERENCES public.media(media_id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='locations_image_media_id_fkey') THEN
    ALTER TABLE public.locations ADD CONSTRAINT locations_image_media_id_fkey FOREIGN KEY (image_media_id) REFERENCES public.media(media_id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='events_image_media_id_fkey') THEN
    ALTER TABLE public.events ADD CONSTRAINT events_image_media_id_fkey FOREIGN KEY (image_media_id) REFERENCES public.media(media_id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='campaigns_image_media_id_fkey') THEN
    ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_image_media_id_fkey FOREIGN KEY (image_media_id) REFERENCES public.media(media_id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='campaigns_logo_media_id_fkey') THEN
    ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_logo_media_id_fkey FOREIGN KEY (logo_media_id) REFERENCES public.media(media_id) ON DELETE SET NULL;
  END IF;
END $$;

-- Timeline keeps its legacy display/sort fields, while gaining canonical calendar/precision/ordinal fields.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS calendar_id bigint;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS date_precision character varying(30);
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS world_day_start bigint;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS world_day_end bigint;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='events_calendar_id_fkey') THEN
    ALTER TABLE public.events ADD CONSTRAINT events_calendar_id_fkey FOREIGN KEY (calendar_id) REFERENCES public.project_calendars(calendar_id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='events_date_precision_check') THEN
    ALTER TABLE public.events ADD CONSTRAINT events_date_precision_check CHECK (date_precision IS NULL OR date_precision IN ('exact_day','month','year','approximate_year','range','unknown'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS events_world_day_idx ON public.events(camp_id, world_day_start, world_day_end, e_id);

-- Inventory existing legacy values only. Actual chronology migration happens explicitly after the world calendar is configured.
INSERT INTO public.calendar_migration_audit(project_id, person_id, old_age, old_birthday, old_species, old_race, migration_method, status, detail)
SELECT n.camp_id,
       n.n_id,
       c.age,
       c.birthday::text,
       n.species,
       c.race,
       CASE
         WHEN c.age IS NOT NULL AND c.age > 0 THEN 'pending_age'
         WHEN c.birthday IS NOT NULL AND c.birthday::text <> '2000-01-01' THEN 'pending_birthday'
         ELSE 'unresolved'
       END,
       'pending',
       jsonb_build_object(
         'species_race_conflict', CASE
           WHEN NULLIF(BTRIM(COALESCE(n.species,'')),'') IS NOT NULL
            AND NULLIF(BTRIM(COALESCE(c.race,'')),'') IS NOT NULL
            AND LOWER(BTRIM(n.species)) <> LOWER(BTRIM(c.race)) THEN true ELSE false END,
         'placeholder_birthday', c.birthday::text = '2000-01-01'
       )
  FROM public.npcs n
  JOIN public.charakters c ON c.n_id=n.n_id
ON CONFLICT(project_id, person_id) DO NOTHING;

COMMIT;
