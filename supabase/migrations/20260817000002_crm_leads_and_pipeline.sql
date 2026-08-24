-- ==============================================================================
-- ProFox CRM - Sales CRM Schema Migration
-- Module 2 - Job 2: Leads, Opportunities & Follow-Up CRM
-- ==============================================================================

-- 1. CRM Leads Table
CREATE TABLE IF NOT EXISTS public.crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  company_name TEXT NOT NULL,
  contact_name TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  website TEXT DEFAULT '',
  country TEXT NOT NULL,
  industry TEXT DEFAULT 'Other',
  source TEXT NOT NULL,
  salesperson_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  service_interest TEXT DEFAULT '',
  estimated_value DECIMAL(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'New',
  loom_video_url TEXT DEFAULT '',
  initial_outreach_channel TEXT DEFAULT 'Email',
  last_contact_at TIMESTAMPTZ,
  next_follow_up_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  self_generated BOOLEAN DEFAULT false,
  converted_opportunity_id UUID, -- Will be set after conversion
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

  -- Status constraint
  CONSTRAINT valid_lead_status CHECK (
    status IN ('New', 'Researching', 'Contacted', 'Follow-Up', 'Interested', 'Qualified', 'Not Qualified')
  )
);

-- 2. CRM Opportunities Table
CREATE TABLE IF NOT EXISTS public.crm_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  contact_name TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  website TEXT DEFAULT '',
  country TEXT NOT NULL,
  industry TEXT DEFAULT 'Other',
  source TEXT NOT NULL,
  self_generated BOOLEAN DEFAULT false,
  salesperson_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  service_interest TEXT DEFAULT '',
  expected_value DECIMAL(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  stage TEXT NOT NULL DEFAULT 'Qualified',
  status TEXT NOT NULL DEFAULT 'Open',
  probability INTEGER DEFAULT 10,
  meeting_at TIMESTAMPTZ,
  meeting_url TEXT DEFAULT '',
  requirements_summary TEXT DEFAULT '',
  next_follow_up_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  lost_reason TEXT DEFAULT NULL,
  won_at TIMESTAMPTZ DEFAULT NULL,
  lost_at TIMESTAMPTZ DEFAULT NULL,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

  -- Stage constraint
  CONSTRAINT valid_opportunity_stage CHECK (
    stage IN (
      'Qualified',
      'Meeting Scheduled',
      'Requirements Confirmed',
      'Quotation Sent',
      'Negotiation / Decision Pending',
      'Awaiting Advance Payment',
      'Won'
    )
  ),

  -- Status constraint
  CONSTRAINT valid_opportunity_status CHECK (
    status IN ('Open', 'Won', 'Lost')
  )
);

-- Update lead table with circular reference if needed, or just keep it as UUID
-- ALTER TABLE public.crm_leads ADD CONSTRAINT fk_converted_opportunity FOREIGN KEY (converted_opportunity_id) REFERENCES public.crm_opportunities(id) ON DELETE SET NULL;

-- 3. CRM Activities Table
CREATE TABLE IF NOT EXISTS public.crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.crm_opportunities(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'Scheduled',
  channel TEXT DEFAULT 'Email',
  loom_video_url TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

  -- Activity type constraint
  CONSTRAINT valid_activity_type CHECK (
    activity_type IN (
      'Lead Research',
      'Cold Call',
      'Cold Email',
      'LinkedIn / Social Outreach',
      'Loom Outreach',
      'Follow-Up',
      'Discovery Meeting',
      'Meeting Follow-Up',
      'Quotation Follow-Up',
      'Payment Follow-Up',
      'Other'
    )
  ),

  -- Status constraint
  CONSTRAINT valid_activity_status CHECK (
    status IN ('Scheduled', 'Completed', 'Cancelled')
  )
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_leads_salesperson ON public.crm_leads(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.crm_leads(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_salesperson ON public.crm_opportunities(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON public.crm_opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_activities_assigned_to ON public.crm_activities(assigned_to);
CREATE INDEX IF NOT EXISTS idx_activities_due_at ON public.crm_activities(due_at);
CREATE INDEX IF NOT EXISTS idx_activities_lead ON public.crm_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_activities_opportunity ON public.crm_activities(opportunity_id);

-- 5. Triggers for updated_at
CREATE TRIGGER trigger_crm_leads_updated_at BEFORE UPDATE ON public.crm_leads FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trigger_crm_opportunities_updated_at BEFORE UPDATE ON public.crm_opportunities FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trigger_crm_activities_updated_at BEFORE UPDATE ON public.crm_activities FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 6. Enable RLS
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies

-- Leads Policies
CREATE POLICY "Admins can view all leads" ON public.crm_leads FOR SELECT USING (public.is_admin());
CREATE POLICY "Sales can view assigned leads" ON public.crm_leads FOR SELECT USING (salesperson_id = auth.uid());
CREATE POLICY "Admins can manage all leads" ON public.crm_leads FOR ALL USING (public.is_admin());
CREATE POLICY "Sales can manage their own leads" ON public.crm_leads FOR ALL 
  USING (salesperson_id = auth.uid()) 
  WITH CHECK (salesperson_id = auth.uid());

-- Opportunities Policies
CREATE POLICY "Admins can view all opportunities" ON public.crm_opportunities FOR SELECT USING (public.is_admin());
CREATE POLICY "Sales can view assigned opportunities" ON public.crm_opportunities FOR SELECT USING (salesperson_id = auth.uid());
CREATE POLICY "Admins can manage all opportunities" ON public.crm_opportunities FOR ALL USING (public.is_admin());
CREATE POLICY "Sales can manage their own opportunities" ON public.crm_opportunities FOR ALL 
  USING (salesperson_id = auth.uid()) 
  WITH CHECK (salesperson_id = auth.uid());

-- Activities Policies
CREATE POLICY "Admins can view all activities" ON public.crm_activities FOR SELECT USING (public.is_admin());
CREATE POLICY "Sales can view assigned activities" ON public.crm_activities FOR SELECT USING (assigned_to = auth.uid());
CREATE POLICY "Admins can manage all activities" ON public.crm_activities FOR ALL USING (public.is_admin());
CREATE POLICY "Sales can manage their own activities" ON public.crm_activities FOR ALL 
  USING (assigned_to = auth.uid()) 
  WITH CHECK (assigned_to = auth.uid());
