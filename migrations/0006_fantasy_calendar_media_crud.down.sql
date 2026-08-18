BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';

-- Only objects introduced by 0006 are removed. Legacy age/birthday/species/race/image columns remain untouched.
DROP INDEX IF EXISTS public.events_world_day_idx;
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_calendar_id_fkey;
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_date_precision_check;
ALTER TABLE public.events DROP COLUMN IF EXISTS world_day_end;
ALTER TABLE public.events DROP COLUMN IF EXISTS world_day_start;
ALTER TABLE public.events DROP COLUMN IF EXISTS date_precision;
ALTER TABLE public.events DROP COLUMN IF EXISTS calendar_id;

ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_logo_media_id_fkey;
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_image_media_id_fkey;
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_image_media_id_fkey;
ALTER TABLE public.locations DROP CONSTRAINT IF EXISTS locations_image_media_id_fkey;
ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS groups_image_media_id_fkey;
ALTER TABLE public.npcs DROP CONSTRAINT IF EXISTS npcs_image_media_id_fkey;

ALTER TABLE public.campaigns DROP COLUMN IF EXISTS logo_media_id;
ALTER TABLE public.campaigns DROP COLUMN IF EXISTS image_media_id;
ALTER TABLE public.events DROP COLUMN IF EXISTS image_media_id;
ALTER TABLE public.locations DROP COLUMN IF EXISTS image_media_id;
ALTER TABLE public.groups DROP COLUMN IF EXISTS image_media_id;
ALTER TABLE public.npcs DROP COLUMN IF EXISTS image_media_id;

DROP TABLE IF EXISTS public.calendar_migration_audit;
DROP TABLE IF EXISTS public.fantasy_dates;
DROP TABLE IF EXISTS public.calendar_months;
DROP TABLE IF EXISTS public.project_calendars;

COMMIT;
