BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';

DROP INDEX IF EXISTS public.player_access_codes_prefix_idx;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.player_access_codes
     WHERE length(code_hash) > 64
  ) THEN
    RAISE EXCEPTION 'Cannot safely roll back 0002 while Argon2 player access-code hashes exist. Revoke/regenerate them after a forward fix instead.';
  END IF;
END
$$;

ALTER TABLE public.player_access_codes
  ALTER COLUMN code_hash TYPE character(64) USING code_hash::character(64);

COMMIT;
