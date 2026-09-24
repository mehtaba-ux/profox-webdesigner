-- The legacy Sales-track seed is complete. Remove the temporary insert filter so
-- future Admin-managed training-track changes are not hardcoded to today's catalog.

drop trigger if exists aaa_uiux_filter_legacy_sales_track_seed on public.training_track_modules;
drop function if exists public.uiux_filter_legacy_sales_track_seed();
