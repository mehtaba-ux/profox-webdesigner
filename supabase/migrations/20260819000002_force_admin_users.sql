-- SECURITY NOTE
-- This historical migration previously promoted several hard-coded email addresses to Admin.
-- That behavior is intentionally removed. User roles must only be granted through the
-- authenticated Admin role-management workflow and server-side authorization controls.
--
-- No data changes are performed here so fresh deployments cannot gain privileged users
-- merely because an email address matches source code.

DO $$
BEGIN
  RAISE NOTICE 'Deprecated migration: hard-coded Admin grants intentionally disabled.';
END
$$;
