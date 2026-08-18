\set ON_ERROR_STOP on

DO $$
DECLARE
  failures text[] := ARRAY[]::text[];
  actual bigint;
BEGIN
  SELECT count(*) INTO actual FROM campaigns; IF actual<>1 THEN failures:=array_append(failures,format('campaigns expected 1 got %s',actual)); END IF;
  SELECT count(*) INTO actual FROM npcs; IF actual<>130 THEN failures:=array_append(failures,format('npcs expected 130 got %s',actual)); END IF;
  SELECT count(*) INTO actual FROM charakters; IF actual<>114 THEN failures:=array_append(failures,format('charakters expected 114 got %s',actual)); END IF;
  SELECT count(*) INTO actual FROM gods; IF actual<>16 THEN failures:=array_append(failures,format('gods expected 16 got %s',actual)); END IF;
  SELECT count(*) INTO actual FROM chars; IF actual<>0 THEN failures:=array_append(failures,format('chars expected 0 got %s',actual)); END IF;
  SELECT count(*) INTO actual FROM users; IF actual<>5 THEN failures:=array_append(failures,format('users expected 5 got %s',actual)); END IF;
  SELECT count(*) INTO actual FROM locations; IF actual<>26 THEN failures:=array_append(failures,format('locations expected 26 got %s',actual)); END IF;
  SELECT count(*) INTO actual FROM groups; IF actual<>18 THEN failures:=array_append(failures,format('groups expected 18 got %s',actual)); END IF;
  SELECT count(*) INTO actual FROM is_part_of; IF actual<>44 THEN failures:=array_append(failures,format('is_part_of expected 44 got %s',actual)); END IF;
  SELECT count(*) INTO actual FROM events; IF actual<>0 THEN failures:=array_append(failures,format('events expected 0 got %s',actual)); END IF;
  SELECT count(*) INTO actual FROM parent_child_relationships; IF actual<>53 THEN failures:=array_append(failures,format('parent_child_relationships expected 53 got %s',actual)); END IF;
  SELECT count(*) INTO actual FROM romantic_relationships; IF actual<>19 THEN failures:=array_append(failures,format('romantic_relationships expected 19 got %s',actual)); END IF;
  IF EXISTS(SELECT 1 FROM npcs n WHERE NOT EXISTS(SELECT 1 FROM charakters c WHERE c.n_id=n.n_id) AND NOT EXISTS(SELECT 1 FROM gods g WHERE g.n_id=n.n_id)) THEN failures:=array_append(failures,'base-only persons exist'); END IF;
  IF EXISTS(SELECT 1 FROM npcs n WHERE EXISTS(SELECT 1 FROM charakters c WHERE c.n_id=n.n_id) AND EXISTS(SELECT 1 FROM gods g WHERE g.n_id=n.n_id)) THEN failures:=array_append(failures,'character/god overlap exists'); END IF;
  IF array_length(failures,1) IS NOT NULL THEN RAISE EXCEPTION 'Legacy baseline failed: %',array_to_string(failures,'; '); END IF;
END $$;

SELECT 'legacy baseline ok' AS result;
