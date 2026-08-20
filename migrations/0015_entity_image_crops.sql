BEGIN;

CREATE TABLE public.entity_image_crops (
  project_id bigint NOT NULL REFERENCES public.campaigns(camp_id) ON DELETE CASCADE,
  entity_type varchar(40) NOT NULL,
  entity_id bigint NOT NULL,
  source_image text NOT NULL,
  crop jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, entity_type, entity_id),
  CONSTRAINT entity_image_crops_type_check CHECK (entity_type IN ('person','race')),
  CONSTRAINT entity_image_crops_shape_check CHECK (
    jsonb_typeof(crop) = 'object'
    AND (crop ? 'x')
    AND (crop ? 'y')
    AND (crop ? 'zoom')
    AND (crop->>'x')::numeric BETWEEN 0 AND 100
    AND (crop->>'y')::numeric BETWEEN 0 AND 100
    AND (crop->>'zoom')::numeric BETWEEN 1 AND 4
  )
);

CREATE INDEX entity_image_crops_entity_idx
  ON public.entity_image_crops(project_id, entity_type, entity_id);

COMMIT;
