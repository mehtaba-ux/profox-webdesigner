-- HVAC Academy content is Admin-owned operational content.
-- The production seed was entered during Module 4 rollout and is documented in
-- docs/module4-hvac-content-snapshot.md. The structural migration immediately
-- before this file creates the durable catalog, learner security and completion
-- architecture. Future niche content is intentionally maintained through the
-- Admin Niche Catalog & Builder and Niche Academy Controls rather than requiring
-- code changes for every lesson or assessment edit.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.niche_training_tracks WHERE slug='hvac') THEN
    UPDATE public.niche_training_tracks
    SET passing_score=85,
        required=true,
        active=true,
        content_status='published',
        updated_at=now()
    WHERE slug='hvac'
      AND module_id=(SELECT id FROM public.training_modules WHERE slug='niche-training' LIMIT 1);
  END IF;
END $$;
