-- ==============================================================================
-- ProFox CRM - Payments & Client Management
-- Module 2 - Job 4: Payment Workflow & Clients
-- ==============================================================================

-- 1. Clients Table
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  primary_contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  website TEXT,
  country TEXT,
  industry TEXT,
  salesperson_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  source_opportunity_id UUID REFERENCES public.crm_opportunities(id) ON DELETE SET NULL,
  first_quotation_id UUID REFERENCES public.quotations(id) ON DELETE SET NULL,
  total_sales_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'Active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

  CONSTRAINT valid_client_status CHECK (status IN ('Active', 'Inactive'))
);

-- 2. Payment Number Sequence
CREATE SEQUENCE IF NOT EXISTS public.payment_number_seq START WITH 1;

-- Function to generate payment reference
CREATE OR REPLACE FUNCTION public.generate_payment_reference()
RETURNS TEXT AS $$
DECLARE
  next_val INTEGER;
BEGIN
  SELECT nextval('public.payment_number_seq') INTO next_val;
  RETURN 'PF-PAY-' || LPAD(next_val::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- 3. Payments Table
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_reference TEXT NOT NULL UNIQUE DEFAULT public.generate_payment_reference(),
  quotation_id UUID REFERENCES public.quotations(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES public.crm_opportunities(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  salesperson_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  payment_type TEXT NOT NULL, -- 'Advance', 'Design Milestone', 'Staging Milestone', 'Final Payment', 'Full Payment', 'Custom Milestone'
  milestone_number INTEGER,
  milestone_label TEXT,
  amount_due DECIMAL(12,2) NOT NULL DEFAULT 0,
  amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_method TEXT,
  payment_provider TEXT, -- 'Razorpay', 'Bank Transfer', 'Other'
  payment_link TEXT,
  provider_payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'Draft',
  due_date DATE,
  paid_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

  CONSTRAINT valid_payment_type CHECK (
    payment_type IN ('Advance', 'Design Milestone', 'Staging Milestone', 'Final Payment', 'Full Payment', 'Custom Milestone')
  ),
  CONSTRAINT valid_payment_status CHECK (
    status IN ('Draft', 'Ready', 'Sent', 'Pending', 'Partially Paid', 'Verification Pending', 'Verified', 'Failed', 'Cancelled', 'Refunded', 'Partially Refunded')
  )
);

-- 4. Triggers for updated_at
CREATE TRIGGER trigger_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trigger_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 5. Enable RLS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies

-- Clients
CREATE POLICY "Admins can view all clients" ON public.clients FOR SELECT USING (public.is_admin());
CREATE POLICY "Sales can view their own clients" ON public.clients FOR SELECT USING (salesperson_id = auth.uid());
CREATE POLICY "Admins can manage all clients" ON public.clients FOR ALL USING (public.is_admin());
CREATE POLICY "Sales can manage their own clients" ON public.clients FOR ALL 
  USING (salesperson_id = auth.uid()) 
  WITH CHECK (salesperson_id = auth.uid());

-- Payments
CREATE POLICY "Admins can view all payments" ON public.payments FOR SELECT USING (public.is_admin());
CREATE POLICY "Sales can view their own payments" ON public.payments FOR SELECT USING (salesperson_id = auth.uid());
CREATE POLICY "Admins can manage all payments" ON public.payments FOR ALL USING (public.is_admin());
CREATE POLICY "Sales can manage their own payments" ON public.payments FOR ALL 
  USING (salesperson_id = auth.uid()) 
  WITH CHECK (salesperson_id = auth.uid());

-- 7. Add client_id to opportunities and quotations
ALTER TABLE public.crm_opportunities ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
