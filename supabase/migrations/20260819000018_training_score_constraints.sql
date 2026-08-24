-- Ensure Academy scores remain valid percentages.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_training_progress_score_range') THEN
    ALTER TABLE public.user_training_progress
      ADD CONSTRAINT user_training_progress_score_range CHECK (score IS NULL OR score BETWEEN 0 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='training_reviews_score_range') THEN
    ALTER TABLE public.training_reviews
      ADD CONSTRAINT training_reviews_score_range CHECK (score IS NULL OR score BETWEEN 0 AND 100);
  END IF;
END
$$;
