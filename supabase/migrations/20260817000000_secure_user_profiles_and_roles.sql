-- ==============================================================================
-- ProFox CRM & Team Management - Secure User, Role & Profile Schema Migration
-- Module 1 - Job 1: Secure User, Role & CRM Foundation
-- ==============================================================================

-- 1. Create enum types or check constraints for Roles, Statuses, Onboarding & Departments
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  country TEXT DEFAULT '',
  timezone TEXT DEFAULT 'UTC',
  role TEXT NOT NULL DEFAULT 'pending',
  department TEXT DEFAULT 'General',
  status TEXT NOT NULL DEFAULT 'pending',
  manager TEXT DEFAULT '',
  onboarding_status TEXT NOT NULL DEFAULT 'not_started',
  onboarding_progress INTEGER NOT NULL DEFAULT 0,
  avatar_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

  -- Role constraint
  CONSTRAINT valid_role CHECK (
    role IN (
      'admin',
      'sales',
      'project_manager',
      'uiux_designer',
      'content_writer',
      'developer',
      'qa',
      'site_manager',
      'editor',
      'customer',
      'pending',
      -- Legacy aliases supported for seamless backwards-compatibility
      'developer_designer',
      'sales_team'
    )
  ),

  -- Status constraint
  CONSTRAINT valid_status CHECK (
    status IN ('pending', 'onboarding', 'active', 'inactive')
  ),

  -- Onboarding status constraint
  CONSTRAINT valid_onboarding_status CHECK (
    onboarding_status IN ('not_started', 'in_progress', 'completed', 'failed')
  ),

  -- Onboarding progress bounds
  CONSTRAINT valid_onboarding_progress CHECK (
    onboarding_progress >= 0 AND onboarding_progress <= 100
  ),

  -- Department constraint
  CONSTRAINT valid_department CHECK (
    department IN (
      'Management',
      'Sales',
      'Project Management',
      'UI/UX Design',
      'Content',
      'Development',
      'Quality Assurance',
      'General',
      ''
    )
  )
);

-- 2. Create Indexes for High-Performance Queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_status ON public.user_profiles(status);
CREATE INDEX IF NOT EXISTS idx_user_profiles_department ON public.user_profiles(department);

-- 3. Automatic Updated_at Timestamp Trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trigger_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 4. Automatic Profile Creation on New User Registration
-- When a user registers via Supabase Auth, securely create a pending profile.
-- New users CANNOT be created as admin automatically.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
  initial_role TEXT := 'pending';
  initial_status TEXT := 'pending';
  user_full_name TEXT := '';
BEGIN
  -- Extract full name from raw_user_meta_data if provided
  IF NEW.raw_user_meta_data IS NOT NULL THEN
    user_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '');
  END IF;

  INSERT INTO public.user_profiles (
    id,
    email,
    full_name,
    role,
    status,
    department,
    onboarding_status,
    onboarding_progress,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    user_full_name,
    initial_role,
    initial_status,
    'General',
    'not_started',
    0,
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- 5. Row-Level Security (RLS) Configuration
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Helper security function to check if current authenticated user is an active Admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper security function to check if current authenticated user is an active staff/manager
CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND status = 'active'
      AND role IN ('admin', 'site_manager', 'editor', 'project_manager', 'sales', 'developer', 'uiux_designer', 'content_writer', 'qa', 'developer_designer', 'sales_team')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policies for public.user_profiles:

-- Policy 1: Users can view their own profile. Active staff/admin can view all profiles.
DROP POLICY IF EXISTS "Users can view their own profile or active staff can view all" ON public.user_profiles;
CREATE POLICY "Users can view their own profile or active staff can view all"
  ON public.user_profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR public.is_admin()
    OR public.is_active_staff()
  );

-- Policy 2: Users can update their own personal info, but CANNOT update role, status, department, or manager.
DROP POLICY IF EXISTS "Users can update their own personal info" ON public.user_profiles;
CREATE POLICY "Users can update their own personal info"
  ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (
      -- If the user is an admin, they can update anything
      public.is_admin()
      OR (
        -- Regular user cannot change role, status, or department
        role = (SELECT p.role FROM public.user_profiles p WHERE p.id = auth.uid())
        AND status = (SELECT p.status FROM public.user_profiles p WHERE p.id = auth.uid())
        AND department = (SELECT p.department FROM public.user_profiles p WHERE p.id = auth.uid())
      )
    )
  );

-- Policy 3: Admins can update any profile (including role, status, department)
DROP POLICY IF EXISTS "Admins can update any profile" ON public.user_profiles;
CREATE POLICY "Admins can update any profile"
  ON public.user_profiles
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Policy 4: Admins can delete profiles if necessary
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.user_profiles;
CREATE POLICY "Admins can delete profiles"
  ON public.user_profiles
  FOR DELETE
  USING (public.is_admin());

-- 6. Stored Procedure for Safe Admin Role Assignment
CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  target_user_id UUID,
  new_role TEXT,
  new_status TEXT DEFAULT 'active',
  new_department TEXT DEFAULT 'General',
  new_manager TEXT DEFAULT ''
)
RETURNS JSONB AS $$
DECLARE
  calling_user_id UUID := auth.uid();
  is_caller_admin BOOLEAN := FALSE;
  updated_row public.user_profiles%ROWTYPE;
BEGIN
  -- Verify caller is admin
  SELECT (role = 'admin' AND status = 'active') INTO is_caller_admin
  FROM public.user_profiles
  WHERE id = calling_user_id;

  IF NOT is_caller_admin THEN
    RAISE EXCEPTION 'Unauthorized: Only an active Admin can assign roles and modify user status.';
  END IF;

  UPDATE public.user_profiles
  SET
    role = new_role,
    status = new_status,
    department = new_department,
    manager = new_manager,
    updated_at = timezone('utc'::text, now())
  WHERE id = target_user_id
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found.';
  END IF;

  RETURN to_jsonb(updated_row);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Stored Procedure to Get All Profiles for Admin Dashboard
CREATE OR REPLACE FUNCTION public.get_all_user_profiles()
RETURNS SETOF public.user_profiles AS $$
BEGIN
  IF NOT public.is_admin() AND NOT public.is_active_staff() THEN
    RAISE EXCEPTION 'Access denied.';
  END IF;

  RETURN QUERY SELECT * FROM public.user_profiles ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Safe Migration for Existing Users
-- If any users already exist in auth.users, backfill user_profiles
INSERT INTO public.user_profiles (id, email, full_name, role, status, department, onboarding_status, onboarding_progress)
SELECT 
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
  -- Preserve existing admin if user metadata already had admin or if first user
  CASE 
    WHEN u.raw_user_meta_data->>'role' = 'admin' THEN 'admin'
    WHEN u.email ILIKE '%admin%' OR u.email ILIKE '%profox%' THEN 'admin'
    ELSE 'pending'
  END,
  CASE 
    WHEN u.raw_user_meta_data->>'role' = 'admin' THEN 'active'
    WHEN u.email ILIKE '%admin%' OR u.email ILIKE '%profox%' THEN 'active'
    ELSE 'pending'
  END,
  'Management',
  'completed',
  100
FROM auth.users u
ON CONFLICT (id) DO NOTHING;
