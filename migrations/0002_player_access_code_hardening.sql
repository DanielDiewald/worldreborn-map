BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';

-- Argon2id hashes are intentionally longer than the SHA-256 compatibility hashes
-- used by the initial foundation. Changing CHAR(64) to TEXT preserves every
-- existing value while allowing new codes to use a password-hard hash.
ALTER TABLE public.player_access_codes
  ALTER COLUMN code_hash TYPE text USING btrim(code_hash);

CREATE INDEX IF NOT EXISTS player_access_codes_prefix_idx
  ON public.player_access_codes(project_id, code_prefix)
  WHERE active = true AND revoked_at IS NULL;

COMMIT;
