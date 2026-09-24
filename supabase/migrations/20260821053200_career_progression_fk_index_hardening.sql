CREATE INDEX IF NOT EXISTS sales_career_progression_settings_updated_by_idx
  ON public.sales_career_progression_settings(updated_by)
  WHERE updated_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS sales_career_progression_reviews_reviewed_by_idx
  ON public.sales_career_progression_reviews(reviewed_by)
  WHERE reviewed_by IS NOT NULL;
