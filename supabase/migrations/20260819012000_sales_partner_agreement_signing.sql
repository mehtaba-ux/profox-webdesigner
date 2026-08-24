-- ProFox Sales Partner Agreement & Signing Engine
-- Canonical Admin data -> immutable agreement snapshot -> partner signature -> Admin countersign/verification.
-- Dynamic commercial/company/training values are resolved only when an agreement is issued.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.sales_agreement_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL DEFAULT 'independent_sales_partner',
  version integer NOT NULL,
  version_label text NOT NULL,
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Published','Superseded')),
  title text NOT NULL,
  subtitle text NOT NULL DEFAULT '',
  introduction text NOT NULL DEFAULT '',
  sections jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sections)='array'),
  acknowledgements jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(acknowledgements)='array'),
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  published_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_key,version)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_agreement_one_published
ON public.sales_agreement_templates(template_key)
WHERE status='Published';

CREATE TABLE IF NOT EXISTS public.sales_partner_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_number text NOT NULL UNIQUE,
  applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE RESTRICT,
  template_id uuid NOT NULL REFERENCES public.sales_agreement_templates(id) ON DELETE RESTRICT,
  template_version integer NOT NULL,
  status text NOT NULL DEFAULT 'Sent' CHECK (status IN ('Sent','Viewed','Partner Signed','Verified','Declined','Superseded')),
  token_hash text NOT NULL UNIQUE,
  token_expires_at timestamptz NOT NULL,
  partner_snapshot jsonb NOT NULL,
  company_snapshot jsonb NOT NULL,
  commercial_snapshot jsonb NOT NULL,
  training_snapshot jsonb NOT NULL,
  hiring_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  template_snapshot jsonb NOT NULL,
  document_hash text NOT NULL,
  partner_signer_name text,
  partner_signature_svg text,
  partner_signature_hash text,
  partner_acknowledgements jsonb,
  partner_signed_at timestamptz,
  partner_ip text,
  partner_user_agent text,
  company_signer_name text,
  company_signer_title text,
  company_signature_svg text,
  company_signature_hash text,
  company_signed_at timestamptz,
  company_signer_user_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  execution_hash text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  viewed_at timestamptz,
  verified_at timestamptz,
  verified_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  declined_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_partner_agreements_applicant
ON public.sales_partner_agreements(applicant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_partner_agreements_status
ON public.sales_partner_agreements(status,created_at DESC);

CREATE TABLE IF NOT EXISTS public.sales_agreement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.sales_partner_agreements(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('Admin','Partner','System')),
  actor_user_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  actor_email text NOT NULL DEFAULT '',
  ip_address text NOT NULL DEFAULT '',
  user_agent text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_agreement_events_agreement
ON public.sales_agreement_events(agreement_id,created_at);

ALTER TABLE public.sales_agreement_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_partner_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_agreement_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_agreement_templates_admin ON public.sales_agreement_templates;
DROP POLICY IF EXISTS sales_partner_agreements_admin_read ON public.sales_partner_agreements;
DROP POLICY IF EXISTS sales_agreement_events_admin_read ON public.sales_agreement_events;
CREATE POLICY sales_agreement_templates_admin ON public.sales_agreement_templates
FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY sales_partner_agreements_admin_read ON public.sales_partner_agreements
FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY sales_agreement_events_admin_read ON public.sales_agreement_events
FOR SELECT TO authenticated USING (public.is_admin());

-- Correct the known old plural website only when that exact stale value is still present.
UPDATE public.system_configuration
SET config_value=jsonb_set(config_value,'{website}',to_jsonb('https://www.profoxwebdesigner.com'::text),true),
    updated_at=now()
WHERE config_key='company_settings'
  AND config_value->>'website'='https://www.profoxwebdesigners.com';

INSERT INTO public.notification_templates(template_key,name,subject_template,body_template,active,description)
VALUES
('recruitment_agreement_ready','Recruitment — agreement ready','Your ProFox Sales Partner Agreement is ready','Hi {{fullName}},\n\nYour ProFox Independent Sales Partner Agreement is ready for review and signature.\n\nReview the complete agreement carefully, confirm the required acknowledgements and sign using your mouse, touchscreen or stylus.\n\nSecure agreement link: {{agreementUrl}}\n\nThe commercial terms in this agreement are frozen for this issued version. Later Admin changes will apply only to future agreements.\n\nProFox\nFrom site to system.','true','Secure signing link generated from the frozen agreement snapshot.'),
('recruitment_agreement_signature_received','Recruitment — partner signature received','We received your ProFox agreement signature','Hi {{fullName}},\n\nWe received your electronic signature on the ProFox Independent Sales Partner Agreement.\n\nProFox will complete the company verification/countersignature step. Training access is granted only after the agreement is fully verified and your onboarding account is linked.\n\nProFox','true','Sent after the Sales Partner signs the issued agreement.'),
('recruitment_agreement_verified','Recruitment — agreement verified','Your ProFox Sales Partner Agreement is complete','Hi {{fullName}},\n\nYour ProFox Independent Sales Partner Agreement has been countersigned and verified.\n\nThe agreement gate is complete. The next onboarding step is your ProFox Sales Academy account and required training.\n\nProFox\nFrom site to system.','true','Sent after Admin countersignature and protected agreement verification.'),
('recruitment_admin_agreement_signed','Recruitment — agreement signature review','Agreement signature received — {{fullName}}','A Sales Partner has signed the issued ProFox agreement.\n\nCandidate: {{fullName}}\nEmail: {{email}}\nAgreement: {{agreementNumber}}\n\nOpen Recruitment to review, countersign and verify the agreement.','true','Internal Admin notification after partner signature.')
ON CONFLICT(template_key) DO UPDATE SET
 name=EXCLUDED.name,subject_template=EXCLUDED.subject_template,body_template=EXCLUDED.body_template,
 active=EXCLUDED.active,description=EXCLUDED.description,updated_at=now();

-- Signer copy only. Internal draft/legal-review notes are intentionally excluded.
INSERT INTO public.sales_agreement_templates(
 template_key,version,version_label,status,title,subtitle,introduction,sections,acknowledgements,published_at
)
VALUES(
 'independent_sales_partner',1,'1.0','Published',
 'Independent Sales Partner Agreement',
 'Commission-Based International Sales Representative',
 'This Agreement is entered into between the ProFox company identified in the Agreement Record and the Sales Partner identified in the same record. It becomes effective when all signatures required by ProFox are complete. The parties intend an independent-contractor commercial relationship. Nothing in this Agreement guarantees employment, salary, minimum earnings, minimum leads, exclusivity or continued engagement.',
 jsonb_build_array(
  jsonb_build_object('key','appointment','title','1. Appointment, Purpose and Scope','body',$txt$ProFox appoints the Sales Partner on a non-exclusive, revocable basis to identify, qualify, approach and develop prospective business customers and, when authorized, conduct discovery, present approved ProFox services, support quotation follow-up and close sales through the ProFox sales process.

The Sales Partner may represent only services, packages, prices, claims and commercial terms that are current and approved by ProFox. ProFox may appoint other representatives and sell directly. The Sales Partner may perform lawful work for others so long as it does not create a conflict, misuse ProFox confidential information, divert active ProFox opportunities or interfere with this Agreement.

The Sales Partner has no authority to sign contracts for ProFox, vary client terms, promise discounts, guarantee results, incur liabilities, accept legal service, hire personnel for ProFox or otherwise bind ProFox unless expressly authorized in writing.$txt$),
  jsonb_build_object('key','contractor','title','2. Independent Contractor Relationship','body',$txt$The Sales Partner acts as an independent contractor and is responsible for the lawful manner, place and sequence of their work, subject to agreed deliverables, system controls, brand rules, confidentiality, client-protection obligations and compliance requirements.

The Sales Partner is not entitled to employee salary, paid leave, benefits, retirement contributions, insurance, severance, overtime or other employee entitlements unless mandatory law provides otherwise. The Sales Partner is responsible for their own tax filings, registrations, permits and statutory obligations. ProFox may withhold amounts where required by law.

Commission depends on eligible business actually closed and qualifying client funds actually received and verified by ProFox. Earnings examples are illustrative, not guarantees.$txt$),
  jsonb_build_object('key','onboarding','title','3. Pre-Activation Conditions and Sales Academy','body',$txt$A selected candidate may not represent themselves as an active ProFox Sales Representative, access live customer records, issue quotations, collect live client information or conduct unsupervised customer-facing activity until ProFox confirms activation.

Activation requires the signed and verified Agreement, required account/security checks, completion of the current required ProFox Sales Academy & Onboarding program, all Admin-reviewed practical gates, final certification at the required score and final Admin approval.

Training access is not activation. ProFox may update training content prospectively; an issued or signed Agreement is never retroactively altered.$txt$),
  jsonb_build_object('key','sales_standards','title','4. Sales Responsibilities and Operating Standards','body',$txt$The Sales Partner will research and qualify suitable businesses; use accurate, respectful and lawful outreach; communicate professionally; conduct discovery meetings; use only approved ProFox messaging, service descriptions, evidence, pricing and collateral; keep CRM records accurate and current; avoid fabricated claims, urgency or guarantees; hand verified sales into delivery with complete information; and promptly escalate conflicts, complaints, suspected fraud, data incidents, payment issues or material errors.

Admin-published activity or performance benchmarks are operating expectations and do not create guaranteed employment hours or guaranteed earnings.$txt$),
  jsonb_build_object('key','attribution','title','5. Lead Source, CRM Ownership and Opportunity Attribution','body',$txt$The ProFox CRM is the system of record. Material sales activity must be recorded accurately and promptly. A lead is Self-Sourced only when the Sales Partner independently identifies it, it was not already an active ProFox lead/client/opportunity or protected house account at the relevant time, and the source is recorded before or at the start of substantive outreach.

ProFox resolves competing source claims using CRM timestamps, existing relationship history, campaign records and other reasonable evidence. CRM, prospect, client, quotation, correspondence and operational records created or maintained for ProFox are Company business records and may be used only for authorized ProFox work.$txt$),
  jsonb_build_object('key','client_terms','title','6. Pricing, Quotations, Discounts and Client Payments','body',$txt$The Sales Partner may present only current Admin-approved pricing, packages, quotations, payment schedules and scope descriptions. Custom pricing, discounts, guarantees, credits, refunds or special commission rates require the applicable ProFox approval.

A sale is governed by the final quotation, proposal, statement of work or other client terms issued or approved through ProFox. Client payments must be made only through Company-approved payment channels. The Sales Partner must not personally collect, hold or redirect client money without specific written authorization.

A payment counts for commission only after ProFox has received it, matched it to the relevant sale and marked it Verified in the authorized system.$txt$),
  jsonb_build_object('key','commission','title','7. Commission and Earnings','body',$txt$Commission is the Sales Partner’s sole standard compensation under this Agreement unless a separate written amendment applies to a specific engagement.

The current product prices, commission rules, custom-rate ranges, self-generated bonus and performance-bonus policy shown in the Dynamic Commercial Schedule below are fetched from the ProFox Admin system when this Agreement is issued and are frozen into this Agreement version.

When a client pays through approved installments, commission is calculated from eligible amounts actually received and verified. Commission is not earned on test transactions, fraudulent or duplicate transactions, unpaid invoices, unauthorized discounts, amounts never received by ProFox, or business obtained through material misrepresentation or policy violation.$txt$),
  jsonb_build_object('key','payouts','title','8. Commission Statements, Payouts, Refunds and Adjustments','body',$txt$The current payout cadence shown in the Dynamic Commercial Schedule is the Admin-approved schedule captured when this Agreement is issued. Payout remains subject to verified client payment, reconciliation, compliance review, provider/banking availability and lawful withholding.

ProFox maintains a commission ledger showing the relevant sale, eligible amount, rate, adjustments, status and payout reference. If a payment is refunded, reversed, charged back, fraudulent or otherwise ceases to qualify, related commission may be cancelled, reduced or offset with the reason recorded in the ledger.

Unless a different published agreement term applies, a commission-calculation dispute should be raised within 15 calendar days after the relevant statement or payout record becomes available, with supporting evidence, without waiving rights that cannot lawfully be waived.$txt$),
  jsonb_build_object('key','expenses','title','9. Expenses','body',$txt$The Sales Partner bears ordinary business expenses, equipment, internet, phone, workspace, travel and similar costs unless ProFox pre-approves a specific reimbursable expense in writing. ProFox may provide software access, training, collateral or tools at its discretion, subject to security and acceptable-use requirements.$txt$),
  jsonb_build_object('key','brand_ip','title','10. Brand, Marketing Claims and Intellectual Property','body',$txt$During the active term, ProFox grants a limited, revocable, non-transferable right to use approved ProFox names, marks, sales collateral and materials only for authorized ProFox sales activity.

The Sales Partner must use current approved messaging and may not create misleading brand pages, impersonate Company officers, register confusing domains/usernames, alter official brand assets or publish unapproved pricing or claims as official ProFox material. ProFox retains rights in its brand assets, websites, code, proposals, templates, training, scripts, playbooks, systems, processes and pre-existing intellectual property.$txt$),
  jsonb_build_object('key','confidentiality','title','11. Confidentiality','body',$txt$Confidential Information includes non-public pricing logic, leads, client information, proposals, credentials, access tokens, internal systems, training content, scripts, strategy, financial data, commissions, product plans, source code, technical information and other information reasonably understood as confidential.

The Sales Partner will use Confidential Information only for authorized ProFox work, protect it with reasonable safeguards, limit access to authorized persons and promptly report suspected loss, disclosure or compromise. Information lawfully public, independently developed without Company information, already lawfully known without restriction, or lawfully received from a third party without restriction is excluded.

Unless a different published agreement term applies, confidentiality obligations continue for 3 years after termination; credentials, security-sensitive information and genuine trade secrets remain protected while they remain confidential or sensitive under applicable law.$txt$),
  jsonb_build_object('key','privacy_security','title','12. Data Protection, Privacy and Security','body',$txt$Use approved ProFox systems and accounts for ProFox customer/prospect data where reasonably available. Do not export, scrape, copy or retain that data for unrelated use. Use unique passwords, multi-factor authentication where offered and reasonable device security. Never share CRM, email, meeting or other credentials.

Use customer data only for its authorized purpose; follow applicable privacy, direct-marketing, anti-spam, telemarketing, recording and data-security requirements; do not record calls without required consent/legal basis; promptly report suspected incidents; and on termination or request stop access and delete/return Company data outside authorized systems subject to lawful retention.

ProFox may log system access, CRM actions, training results, agreement events and business communications where reasonably necessary for security, quality, compliance, dispute resolution and operation of the relationship.$txt$),
  jsonb_build_object('key','compliance','title','13. Compliance, Fair Dealing and Prohibited Conduct','body',$txt$The Sales Partner will comply with applicable anti-bribery, anti-corruption, sanctions, fraud, privacy, direct-marketing, consumer/business communication and other laws relevant to their activities.

The Sales Partner must not offer or accept improper payments, kickbacks or secret commissions; misrepresent identity or authority; falsify CRM records; submit fabricated leads; make unauthorized guarantees; harass prospects; circumvent opt-outs; impersonate clients; or intentionally damage ProFox or a customer.$txt$),
  jsonb_build_object('key','client_protection','title','14. Conflicts, Circumvention and Client Protection','body',$txt$During the term, the Sales Partner must not knowingly divert an active ProFox lead, opportunity or client to themselves or another provider to avoid the ProFox commercial process or commission rules. The Sales Partner may not privately invoice a ProFox prospect/client for ProFox services or substitute another provider into an active ProFox opportunity without written authorization.

This protects current opportunities, confidential information and Company records during the relationship and is not intended as a broad post-termination prohibition on carrying on a lawful profession, trade or business.$txt$),
  jsonb_build_object('key','representations','title','15. Representations and Acknowledgements','body',$txt$Each party represents that it has authority to enter this Agreement. The Sales Partner confirms recruitment/onboarding information is materially accurate and will report a material change.

The Sales Partner acknowledges the commission-only model, absence of guaranteed earnings, required use of approved systems and the fact that activation can be withheld or withdrawn for failure to satisfy required security, training or conduct standards.$txt$),
  jsonb_build_object('key','termination','title','16. Term, Suspension and Termination','body',$txt$This Agreement begins on the Effective Date and continues until terminated. Unless a different published agreement term applies, either party may terminate on 7 calendar days’ written notice.

ProFox may immediately suspend access or terminate for serious misconduct including fraud, deliberate misrepresentation, unauthorized collection of funds, material confidentiality/data breach, credential sharing, bribery, material CRM manipulation, client diversion/circumvention, repeated unlawful outreach, refusal to follow security controls or conduct likely to cause serious harm.

On termination ProFox may immediately revoke system, email, CRM, training and brand access. Earned, undisputed commission on eligible verified client funds remains payable. Unless a different published agreement term applies, a documented eligible opportunity recorded before termination may remain eligible if the qualifying client payment is verified within 30 days after termination, provided no misconduct, circumvention or unauthorized conduct caused the sale.$txt$),
  jsonb_build_object('key','records','title','17. Records, Audit and Cooperation','body',$txt$ProFox may maintain reasonable business records concerning leads, activities, meetings, quotations, payments, commissions, training, security events and agreement execution. The Sales Partner will reasonably cooperate with legitimate investigations into commission disputes, client complaints, security incidents, payment issues or suspected misconduct, subject to applicable law.$txt$),
  jsonb_build_object('key','liability','title','18. Liability and Indemnity','body',$txt$Each party remains responsible for its own fraud, willful misconduct, unlawful conduct and obligations that applicable law does not permit it to exclude. The Sales Partner is responsible, to the extent permitted by law, for losses or reasonable costs caused by unauthorized commitments, intentional misrepresentation, misuse of client funds, unlawful conduct, material confidentiality breach or deliberate circumvention.

Except for amounts that cannot lawfully be limited, ProFox is not responsible for speculative, indirect or consequential losses arising from expected commissions, lost opportunities or forecasts. This does not remove ProFox’s obligation to pay commission actually earned under this Agreement.$txt$),
  jsonb_build_object('key','notices','title','19. Notices','body',$txt$Contract notices may be delivered through the ProFox agreement system or by email to official addresses in the Agreement Record. Operational messages, stage notifications, training notices and commission statements may be delivered through the ProFox platform, email or another approved channel.$txt$),
  jsonb_build_object('key','disputes','title','20. Dispute Resolution and Governing Law','body',$txt$The parties will first attempt in good faith to resolve disputes through written escalation and a reasonable discussion period unless urgent relief is necessary.

Unless a different published agreement term applies, this Agreement is governed by the laws of India, subject to mandatory rules that cannot lawfully be excluded in the Sales Partner’s jurisdiction. A dispute not resolved by good-faith discussion will be referred to a sole arbitrator under the Arbitration and Conciliation Act, 1996, with the proposed seat/venue in Shimla, Himachal Pradesh, India and proceedings in English. Interim or protective relief may be sought where legally available.$txt$),
  jsonb_build_object('key','electronic','title','21. Electronic Records and Signatures','body',$txt$The parties consent to receive, review, accept and execute this Agreement electronically. The ProFox workflow may allow a signer to draw a signature using a mouse, touchscreen, stylus or similar input and captures typed name, explicit consent and execution evidence.

If applicable law requires a prescribed electronic-signature technique, qualified provider, certificate, wet-ink execution, stamping or another formality, the parties will complete that additional formality and ProFox may withhold activation until complete.

ProFox may preserve the Agreement version, document hash, identity details, consent events, signature image, verification events, timestamps, IP address, user-agent/device information and signed execution record for evidentiary, security and compliance purposes. Later Admin edits never alter an issued or signed snapshot.$txt$),
  jsonb_build_object('key','general','title','22. General','body',$txt$This Agreement, its schedules and mutually signed amendments form the agreement concerning the Sales Partner relationship and supersede prior inconsistent discussions on that subject. A specific signed amendment or approved deal-specific commission term controls only for the subject it expressly addresses.

ProFox may update operational policies, training and Admin-managed content prospectively, but material changes to signed commercial or legal obligations require the applicable form of acceptance. If a provision is invalid or unenforceable it will be limited or severed to the minimum extent permitted. Delay in enforcement is not a waiver. The Sales Partner may not transfer identity-based sales access or this Agreement without written approval. Electronic counterparts together form one instrument.$txt$)
 ),
 jsonb_build_array(
  jsonb_build_object('key','contractor_model','text','I understand this is an independent contractor, commission-only opportunity and does not include a fixed salary.'),
  jsonb_build_object('key','no_guaranteed_earnings','text','I understand earnings are not guaranteed and depend on eligible verified sales.'),
  jsonb_build_object('key','commission_schedule','text','I have reviewed and accept the Dynamic Commercial Schedule captured in this issued Agreement, including any applicable self-generated and performance bonus rules.'),
  jsonb_build_object('key','crm_process','text','I will use the ProFox CRM and approved sales process as required.'),
  jsonb_build_object('key','client_funds','text','I will not collect client money personally or make unauthorized commitments.'),
  jsonb_build_object('key','confidentiality_data','text','I will protect confidential information, customer/prospect data and account credentials.'),
  jsonb_build_object('key','academy','text','I will complete the required Sales Academy & Onboarding training and understand training access is not final activation.'),
  jsonb_build_object('key','electronic_consent','text','I consent to electronic records and the ProFox electronic-signing workflow, subject to any legally required additional formality.'),
  jsonb_build_object('key','audit_record','text','I understand ProFox may preserve this signed Agreement and its execution audit record for legitimate business, security and compliance purposes.')
 ),
 now()
)
ON CONFLICT(template_key,version) DO NOTHING;

CREATE OR REPLACE FUNCTION public.build_sales_agreement_dynamic_snapshot(p_applicant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
 v_app public.applicants%ROWTYPE;
 v_company jsonb:='{}'::jsonb;
 v_notify jsonb:='{}'::jsonb;
 v_hiring jsonb:='{}'::jsonb;
 v_products jsonb:='[]'::jsonb;
 v_commission jsonb:='{}'::jsonb;
 v_training jsonb:='{}'::jsonb;
BEGIN
 SELECT * INTO v_app FROM public.applicants WHERE id=p_applicant_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Candidate not found.'; END IF;
 SELECT COALESCE(config_value,'{}'::jsonb) INTO v_company FROM public.system_configuration WHERE config_key='company_settings';
 SELECT COALESCE(config_value,'{}'::jsonb) INTO v_notify FROM public.system_configuration WHERE config_key='notification_settings';
 SELECT COALESCE(x->'careersData','{}'::jsonb) INTO v_hiring
 FROM public.content c CROSS JOIN LATERAL jsonb_array_elements(c.data) x
 WHERE c.id='customPages' AND (x->>'id'='careers' OR x->>'slug'='careers') LIMIT 1;
 v_hiring:=COALESCE(v_hiring,'{}'::jsonb);

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'productCode',r.product_code,'productName',COALESCE(p.name,r.product_name),'category',COALESCE(p.category,''),
   'priceMode',COALESCE(p.price_mode,'quote'),'basePrice',COALESCE(p.base_price,0),'currency',COALESCE(p.currency,'USD'),
   'baseRatePercent',r.base_rate_percent,'minRatePercent',r.min_rate_percent,'maxRatePercent',r.max_rate_percent,
   'requiresAdminRate',r.requires_admin_rate
 ) ORDER BY COALESCE(p.sort_order,999),r.product_code),'[]'::jsonb) INTO v_products
 FROM public.commission_rules r LEFT JOIN public.sales_products p ON p.code=r.product_code
 WHERE r.enabled=true AND COALESCE(p.active,true)=true;

 SELECT COALESCE(to_jsonb(s),'{}'::jsonb) - 'updated_at' INTO v_commission
 FROM public.commission_settings s WHERE s.id='default';
 v_commission:=COALESCE(v_commission,'{}'::jsonb);

 SELECT jsonb_build_object(
  'requiredModuleCount',count(*),
  'modules',COALESCE(jsonb_agg(jsonb_build_object(
    'title',title,'slug',slug,'passingScore',passing_score,'requiresAdminReview',requires_admin_review
  ) ORDER BY sort_order),'[]'::jsonb)
 ) INTO v_training
 FROM public.training_modules WHERE active=true AND required=true;

 RETURN jsonb_build_object(
  'partner',jsonb_build_object('applicantId',v_app.id,'fullName',v_app.full_name,'email',v_app.email,'country',v_app.country,'timezone',v_app.timezone,'position',v_app.position),
  'company',jsonb_build_object(
    'businessName',COALESCE(v_company->>'businessName','ProFox Web Designer'),
    'legalEntity',COALESCE(v_company->>'legalEntity','ProFox Digital Solution'),
    'website',COALESCE(NULLIF(v_company->>'website',''),v_notify->>'publicBaseUrl',''),
    'contactEmail',COALESCE(NULLIF(v_company->>'contactEmail',''),v_notify->>'fromEmail',''),
    'contactPhone',COALESCE(v_company->>'contactPhone',''),
    'businessAddress',COALESCE(v_company->>'businessAddress',''),
    'timezone',COALESCE(v_company->>'timezone','Asia/Kolkata'),
    'currency',COALESCE(v_company->>'currency','USD')
  ),
  'commercial',jsonb_build_object('products',v_products,'settings',v_commission,'capturedAt',now()),
  'training',v_training || jsonb_build_object('capturedAt',now()),
  'hiring',v_hiring
 );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_sales_agreement_template()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_row public.sales_agreement_templates%ROWTYPE;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized.'; END IF;
 SELECT * INTO v_row FROM public.sales_agreement_templates
 WHERE template_key='independent_sales_partner' AND status IN ('Draft','Published')
 ORDER BY CASE status WHEN 'Draft' THEN 0 ELSE 1 END,version DESC LIMIT 1;
 RETURN to_jsonb(v_row);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_save_sales_agreement_template(
 p_title text,p_subtitle text,p_introduction text,p_sections jsonb,p_acknowledgements jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid; v_version int; v_published public.sales_agreement_templates%ROWTYPE;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized.'; END IF;
 IF COALESCE(trim(p_title),'')='' OR jsonb_typeof(p_sections)<>'array' OR jsonb_array_length(p_sections)<1 THEN RAISE EXCEPTION 'Agreement title and sections are required.'; END IF;
 IF jsonb_typeof(p_acknowledgements)<>'array' OR jsonb_array_length(p_acknowledgements)<1 THEN RAISE EXCEPTION 'At least one acknowledgement is required.'; END IF;
 SELECT id INTO v_id FROM public.sales_agreement_templates WHERE template_key='independent_sales_partner' AND status='Draft' ORDER BY version DESC LIMIT 1;
 IF v_id IS NOT NULL THEN
   UPDATE public.sales_agreement_templates SET title=trim(p_title),subtitle=COALESCE(p_subtitle,''),introduction=COALESCE(p_introduction,''),sections=p_sections,acknowledgements=p_acknowledgements,updated_by=auth.uid(),updated_at=now() WHERE id=v_id;
   RETURN v_id;
 END IF;
 SELECT * INTO v_published FROM public.sales_agreement_templates WHERE template_key='independent_sales_partner' AND status='Published' ORDER BY version DESC LIMIT 1;
 v_version:=COALESCE(v_published.version,0)+1;
 INSERT INTO public.sales_agreement_templates(template_key,version,version_label,status,title,subtitle,introduction,sections,acknowledgements,created_by,updated_by)
 VALUES('independent_sales_partner',v_version,v_version::text||'.0','Draft',trim(p_title),COALESCE(p_subtitle,''),COALESCE(p_introduction,''),p_sections,p_acknowledgements,auth.uid(),auth.uid()) RETURNING id INTO v_id;
 RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_publish_sales_agreement_template(p_template_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_key text;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized.'; END IF;
 SELECT template_key INTO v_key FROM public.sales_agreement_templates WHERE id=p_template_id AND status='Draft' FOR UPDATE;
 IF v_key IS NULL THEN RAISE EXCEPTION 'Only a draft agreement template may be published.'; END IF;
 UPDATE public.sales_agreement_templates SET status='Superseded',updated_at=now() WHERE template_key=v_key AND status='Published';
 UPDATE public.sales_agreement_templates SET status='Published',published_at=now(),published_by=auth.uid(),updated_by=auth.uid(),updated_at=now() WHERE id=p_template_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_preview_sales_agreement_dynamic_data(p_applicant_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid:=p_applicant_id;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized.'; END IF;
 IF v_id IS NULL THEN SELECT id INTO v_id FROM public.applicants ORDER BY created_at DESC LIMIT 1; END IF;
 IF v_id IS NULL THEN RETURN jsonb_build_object('partner',jsonb_build_object('fullName','Preview Sales Partner','email','preview@example.com','country',''),'company',(SELECT COALESCE(config_value,'{}'::jsonb) FROM public.system_configuration WHERE config_key='company_settings'));
 END IF;
 RETURN public.build_sales_agreement_dynamic_snapshot(v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.create_sales_partner_agreement_internal(p_applicant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_app public.applicants%ROWTYPE; v_tpl public.sales_agreement_templates%ROWTYPE; v_ctx jsonb;
 v_token uuid:=gen_random_uuid(); v_token_hash text; v_number text; v_id uuid; v_base text; v_url text; v_doc_hash text;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized.'; END IF;
 SELECT * INTO v_app FROM public.applicants WHERE id=p_applicant_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Candidate not found.'; END IF;
 IF COALESCE(trim(v_app.refusal_reason),'')<>'' THEN RAISE EXCEPTION 'A closed candidate cannot receive an agreement.'; END IF;
 IF v_app.stage NOT IN ('Selected','Agreement Pending') THEN RAISE EXCEPTION 'Candidate must be Selected or Agreement Pending before an agreement is issued.'; END IF;
 IF EXISTS(SELECT 1 FROM public.sales_partner_agreements WHERE applicant_id=p_applicant_id AND status IN ('Partner Signed','Verified')) THEN RAISE EXCEPTION 'A signed agreement already exists. Complete or formally supersede it before issuing another.'; END IF;
 SELECT * INTO v_tpl FROM public.sales_agreement_templates WHERE template_key='independent_sales_partner' AND status='Published' ORDER BY version DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'No published Sales Partner Agreement template exists.'; END IF;
 v_ctx:=public.build_sales_agreement_dynamic_snapshot(p_applicant_id);
 v_number:='PF-SPA-'||to_char(clock_timestamp(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
 v_token_hash:=encode(digest(v_token::text,'sha256'),'hex');
 v_doc_hash:=encode(digest((jsonb_build_object(
   'agreementNumber',v_number,'templateVersion',v_tpl.version,'partner',v_ctx->'partner','company',v_ctx->'company',
   'commercial',v_ctx->'commercial','training',v_ctx->'training','hiring',v_ctx->'hiring',
   'template',jsonb_build_object('title',v_tpl.title,'subtitle',v_tpl.subtitle,'introduction',v_tpl.introduction,'sections',v_tpl.sections,'acknowledgements',v_tpl.acknowledgements)
 ))::text,'sha256'),'hex');

 UPDATE public.sales_partner_agreements SET status='Superseded',superseded_at=now(),updated_at=now()
 WHERE applicant_id=p_applicant_id AND status IN ('Sent','Viewed');

 INSERT INTO public.sales_partner_agreements(
  agreement_number,applicant_id,template_id,template_version,status,token_hash,token_expires_at,
  partner_snapshot,company_snapshot,commercial_snapshot,training_snapshot,hiring_snapshot,template_snapshot,document_hash
 ) VALUES(
  v_number,p_applicant_id,v_tpl.id,v_tpl.version,'Sent',v_token_hash,now()+interval '14 days',
  v_ctx->'partner',v_ctx->'company',v_ctx->'commercial',v_ctx->'training',v_ctx->'hiring',
  jsonb_build_object('title',v_tpl.title,'subtitle',v_tpl.subtitle,'introduction',v_tpl.introduction,'sections',v_tpl.sections,'acknowledgements',v_tpl.acknowledgements,'versionLabel',v_tpl.version_label),v_doc_hash
 ) RETURNING id INTO v_id;

 INSERT INTO public.sales_agreement_events(agreement_id,event_type,actor_type,actor_user_id,actor_email,metadata)
 VALUES(v_id,'Issued','Admin',auth.uid(),COALESCE((SELECT email FROM public.user_profiles WHERE id=auth.uid()),''),jsonb_build_object('templateVersion',v_tpl.version,'documentHash',v_doc_hash));

 SELECT COALESCE(config_value->>'publicBaseUrl','https://www.profoxwebdesigner.com') INTO v_base FROM public.system_configuration WHERE config_key='notification_settings';
 v_url:=rtrim(COALESCE(NULLIF(v_base,''),'https://www.profoxwebdesigner.com'),'/')||'/agreement/sign/'||v_token::text;
 PERFORM public.enqueue_notification(
   'sales-agreement:'||v_id::text||':issued',
   'recruitment_agreement_ready',v_app.email,NULL,
   public.recruitment_notification_payload(v_app)||jsonb_build_object('agreementUrl',v_url,'agreementNumber',v_number,'agreementId',v_id),now()
 );
 PERFORM set_config('profox.agreement_workflow_rpc','1',true);
 UPDATE public.applicants SET agreement_status='sent',updated_at=now() WHERE id=p_applicant_id;
 RETURN jsonb_build_object('agreementId',v_id,'agreementNumber',v_number,'signingUrl',v_url,'documentHash',v_doc_hash);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_issue_sales_partner_agreement(p_applicant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized.'; END IF;
 SELECT public.create_sales_partner_agreement_internal(p_applicant_id) INTO v_result;
 PERFORM set_config('profox.agreement_workflow_rpc','1',true);
 UPDATE public.applicants SET stage='Agreement Pending',agreement_status='sent',updated_at=now() WHERE id=p_applicant_id AND stage='Selected';
 RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_resend_sales_partner_agreement(p_agreement_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_row public.sales_partner_agreements%ROWTYPE; v_app public.applicants%ROWTYPE; v_token uuid:=gen_random_uuid(); v_url text; v_base text;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized.'; END IF;
 SELECT * INTO v_row FROM public.sales_partner_agreements WHERE id=p_agreement_id FOR UPDATE;
 IF NOT FOUND OR v_row.status NOT IN ('Sent','Viewed') THEN RAISE EXCEPTION 'Only an unsigned active agreement can be resent.'; END IF;
 SELECT * INTO v_app FROM public.applicants WHERE id=v_row.applicant_id;
 UPDATE public.sales_partner_agreements SET token_hash=encode(digest(v_token::text,'sha256'),'hex'),token_expires_at=now()+interval '14 days',status='Sent',sent_at=now(),updated_at=now() WHERE id=p_agreement_id;
 SELECT COALESCE(config_value->>'publicBaseUrl','https://www.profoxwebdesigner.com') INTO v_base FROM public.system_configuration WHERE config_key='notification_settings';
 v_url:=rtrim(COALESCE(NULLIF(v_base,''),'https://www.profoxwebdesigner.com'),'/')||'/agreement/sign/'||v_token::text;
 PERFORM public.enqueue_notification('sales-agreement:'||p_agreement_id::text||':resent:'||extract(epoch from clock_timestamp())::bigint,'recruitment_agreement_ready',v_app.email,NULL,public.recruitment_notification_payload(v_app)||jsonb_build_object('agreementUrl',v_url,'agreementNumber',v_row.agreement_number,'agreementId',p_agreement_id),now());
 INSERT INTO public.sales_agreement_events(agreement_id,event_type,actor_type,actor_user_id,actor_email) VALUES(p_agreement_id,'Resent','Admin',auth.uid(),COALESCE((SELECT email FROM public.user_profiles WHERE id=auth.uid()),''));
 RETURN jsonb_build_object('agreementId',p_agreement_id,'signingUrl',v_url);
END; $$;

CREATE OR REPLACE FUNCTION public.public_get_sales_partner_agreement(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_row public.sales_partner_agreements%ROWTYPE;
BEGIN
 SELECT * INTO v_row FROM public.sales_partner_agreements
 WHERE token_hash=encode(digest(p_token::text,'sha256'),'hex')
   AND status IN ('Sent','Viewed','Partner Signed','Verified')
   AND (status IN ('Partner Signed','Verified') OR token_expires_at>now())
 LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','This agreement link is invalid, expired or no longer active.'); END IF;
 IF v_row.status='Sent' THEN
   UPDATE public.sales_partner_agreements SET status='Viewed',viewed_at=COALESCE(viewed_at,now()),updated_at=now() WHERE id=v_row.id;
   INSERT INTO public.sales_agreement_events(agreement_id,event_type,actor_type,actor_email) VALUES(v_row.id,'Viewed','Partner',COALESCE(v_row.partner_snapshot->>'email',''));
   v_row.status:='Viewed'; v_row.viewed_at:=now();
 END IF;
 RETURN jsonb_build_object('success',true,'agreement',jsonb_build_object(
  'id',v_row.id,'agreementNumber',v_row.agreement_number,'templateVersion',v_row.template_version,'status',v_row.status,
  'partner',v_row.partner_snapshot,'company',v_row.company_snapshot,'commercial',v_row.commercial_snapshot,'training',v_row.training_snapshot,'hiring',v_row.hiring_snapshot,
  'template',v_row.template_snapshot,'documentHash',v_row.document_hash,'sentAt',v_row.sent_at,'viewedAt',v_row.viewed_at,'partnerSignedAt',v_row.partner_signed_at,
  'companySignerName',v_row.company_signer_name,'companySignerTitle',v_row.company_signer_title,'companySignedAt',v_row.company_signed_at,'verifiedAt',v_row.verified_at,'executionHash',v_row.execution_hash
 ));
END; $$;

CREATE OR REPLACE FUNCTION public.service_sign_sales_partner_agreement(
 p_token uuid,p_signer_name text,p_signature_svg text,p_acknowledgements jsonb,p_ip text DEFAULT '',p_user_agent text DEFAULT ''
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_row public.sales_partner_agreements%ROWTYPE; v_app public.applicants%ROWTYPE; v_missing int; v_sig_hash text; v_admin record;
BEGIN
 SELECT * INTO v_row FROM public.sales_partner_agreements WHERE token_hash=encode(digest(p_token::text,'sha256'),'hex') AND status IN ('Sent','Viewed') AND token_expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agreement link is invalid, expired, already signed or no longer active.'; END IF;
 IF lower(trim(COALESCE(p_signer_name,'')))<>lower(trim(COALESCE(v_row.partner_snapshot->>'fullName',''))) THEN RAISE EXCEPTION 'Typed legal name must match the name on the Agreement Record.'; END IF;
 IF COALESCE(length(p_signature_svg),0)<100 OR length(p_signature_svg)>120000 OR left(ltrim(p_signature_svg),4)<>'<svg' THEN RAISE EXCEPTION 'A valid drawn signature is required.'; END IF;
 SELECT count(*) INTO v_missing FROM jsonb_array_elements(v_row.template_snapshot->'acknowledgements') a
 WHERE COALESCE(p_acknowledgements->>(a->>'key'),'false')<>'true';
 IF v_missing>0 THEN RAISE EXCEPTION 'All required acknowledgements must be accepted before signing.'; END IF;
 v_sig_hash:=encode(digest(p_signature_svg,'sha256'),'hex');
 UPDATE public.sales_partner_agreements SET status='Partner Signed',partner_signer_name=trim(p_signer_name),partner_signature_svg=p_signature_svg,partner_signature_hash=v_sig_hash,partner_acknowledgements=p_acknowledgements,partner_signed_at=now(),partner_ip=left(COALESCE(p_ip,''),200),partner_user_agent=left(COALESCE(p_user_agent,''),1000),updated_at=now() WHERE id=v_row.id;
 INSERT INTO public.sales_agreement_events(agreement_id,event_type,actor_type,actor_email,ip_address,user_agent,metadata)
 VALUES(v_row.id,'Partner Signed','Partner',COALESCE(v_row.partner_snapshot->>'email',''),left(COALESCE(p_ip,''),200),left(COALESCE(p_user_agent,''),1000),jsonb_build_object('signatureHash',v_sig_hash,'documentHash',v_row.document_hash));
 SELECT * INTO v_app FROM public.applicants WHERE id=v_row.applicant_id;
 PERFORM public.enqueue_notification('sales-agreement:'||v_row.id::text||':partner-signed','recruitment_agreement_signature_received',v_app.email,NULL,public.recruitment_notification_payload(v_app)||jsonb_build_object('agreementNumber',v_row.agreement_number),now());
 FOR v_admin IN SELECT id,email FROM public.user_profiles WHERE role='admin' AND status='active' LOOP
   PERFORM public.enqueue_in_app_notification(v_admin.id,'Recruitment','Agreement signature received',v_app.full_name||' signed the Sales Partner Agreement. Review and countersign it.','/admin/agreements','sales-agreement:partner-signed:'||v_row.id::text||':'||v_admin.id::text);
 END LOOP;
 RETURN jsonb_build_object('success',true,'agreementId',v_row.id,'agreementNumber',v_row.agreement_number,'status','Partner Signed');
END; $$;

CREATE OR REPLACE FUNCTION public.service_decline_sales_partner_agreement(p_token uuid,p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_row public.sales_partner_agreements%ROWTYPE;
BEGIN
 SELECT * INTO v_row FROM public.sales_partner_agreements WHERE token_hash=encode(digest(p_token::text,'sha256'),'hex') AND status IN ('Sent','Viewed') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agreement link is no longer active.'; END IF;
 UPDATE public.sales_partner_agreements SET status='Declined',declined_at=now(),updated_at=now() WHERE id=v_row.id;
 INSERT INTO public.sales_agreement_events(agreement_id,event_type,actor_type,actor_email,metadata) VALUES(v_row.id,'Declined','Partner',COALESCE(v_row.partner_snapshot->>'email',''),jsonb_build_object('reason',left(COALESCE(p_reason,''),1000)));
 PERFORM set_config('profox.agreement_workflow_rpc','1',true);
 UPDATE public.applicants SET agreement_status='declined',refusal_reason=COALESCE(NULLIF(trim(p_reason),''),'Agreement Declined'),updated_at=now() WHERE id=v_row.applicant_id;
 RETURN jsonb_build_object('success',true,'status','Declined');
END; $$;

CREATE OR REPLACE FUNCTION public.admin_verify_sales_partner_agreement(
 p_agreement_id uuid,p_signer_name text,p_signer_title text,p_signature_svg text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_row public.sales_partner_agreements%ROWTYPE; v_app public.applicants%ROWTYPE; v_sig_hash text; v_exec_hash text;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized.'; END IF;
 SELECT * INTO v_row FROM public.sales_partner_agreements WHERE id=p_agreement_id FOR UPDATE;
 IF NOT FOUND OR v_row.status<>'Partner Signed' THEN RAISE EXCEPTION 'Partner signature is required before company verification.'; END IF;
 IF COALESCE(trim(p_signer_name),'')='' OR COALESCE(trim(p_signer_title),'')='' THEN RAISE EXCEPTION 'Company signer name and title are required.'; END IF;
 IF COALESCE(length(p_signature_svg),0)<100 OR length(p_signature_svg)>120000 OR left(ltrim(p_signature_svg),4)<>'<svg' THEN RAISE EXCEPTION 'A valid company signature is required.'; END IF;
 v_sig_hash:=encode(digest(p_signature_svg,'sha256'),'hex');
 v_exec_hash:=encode(digest(v_row.document_hash||'|'||COALESCE(v_row.partner_signature_hash,'')||'|'||v_sig_hash||'|'||v_row.partner_signed_at::text||'|'||now()::text,'sha256'),'hex');
 UPDATE public.sales_partner_agreements SET status='Verified',company_signer_name=trim(p_signer_name),company_signer_title=trim(p_signer_title),company_signature_svg=p_signature_svg,company_signature_hash=v_sig_hash,company_signed_at=now(),company_signer_user_id=auth.uid(),verified_at=now(),verified_by=auth.uid(),execution_hash=v_exec_hash,updated_at=now() WHERE id=p_agreement_id;
 INSERT INTO public.sales_agreement_events(agreement_id,event_type,actor_type,actor_user_id,actor_email,metadata)
 VALUES(p_agreement_id,'Verified','Admin',auth.uid(),COALESCE((SELECT email FROM public.user_profiles WHERE id=auth.uid()),''),jsonb_build_object('companySignatureHash',v_sig_hash,'executionHash',v_exec_hash));
 SELECT * INTO v_app FROM public.applicants WHERE id=v_row.applicant_id;
 PERFORM set_config('profox.agreement_workflow_rpc','1',true);
 UPDATE public.applicants SET agreement_status='signed',updated_at=now() WHERE id=v_row.applicant_id;
 PERFORM public.enqueue_notification('sales-agreement:'||p_agreement_id::text||':verified','recruitment_agreement_verified',v_app.email,NULL,public.recruitment_notification_payload(v_app)||jsonb_build_object('agreementNumber',v_row.agreement_number),now());
 RETURN jsonb_build_object('success',true,'agreementId',p_agreement_id,'status','Verified','executionHash',v_exec_hash);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_get_sales_partner_agreement(p_applicant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_row public.sales_partner_agreements%ROWTYPE; v_events jsonb;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized.'; END IF;
 SELECT * INTO v_row FROM public.sales_partner_agreements WHERE applicant_id=p_applicant_id ORDER BY created_at DESC LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('agreement',NULL,'events','[]'::jsonb); END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('eventType',event_type,'actorType',actor_type,'actorEmail',actor_email,'createdAt',created_at,'metadata',metadata) ORDER BY created_at),'[]'::jsonb) INTO v_events FROM public.sales_agreement_events WHERE agreement_id=v_row.id;
 RETURN jsonb_build_object('agreement',to_jsonb(v_row)-'token_hash','events',v_events);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_list_sales_partner_agreements()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized.'; END IF;
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'id',a.id,'agreementNumber',a.agreement_number,'applicantId',a.applicant_id,'candidateName',a.partner_snapshot->>'fullName','candidateEmail',a.partner_snapshot->>'email',
   'status',a.status,'templateVersion',a.template_version,'sentAt',a.sent_at,'partnerSignedAt',a.partner_signed_at,'verifiedAt',a.verified_at,'documentHash',a.document_hash
 ) ORDER BY a.created_at DESC) FROM public.sales_partner_agreements a),'[]'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.protect_sales_agreement_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.status='Verified' THEN
  IF NEW.partner_snapshot IS DISTINCT FROM OLD.partner_snapshot OR NEW.company_snapshot IS DISTINCT FROM OLD.company_snapshot OR NEW.commercial_snapshot IS DISTINCT FROM OLD.commercial_snapshot OR NEW.training_snapshot IS DISTINCT FROM OLD.training_snapshot OR NEW.hiring_snapshot IS DISTINCT FROM OLD.hiring_snapshot OR NEW.template_snapshot IS DISTINCT FROM OLD.template_snapshot OR NEW.document_hash IS DISTINCT FROM OLD.document_hash OR NEW.partner_signature_svg IS DISTINCT FROM OLD.partner_signature_svg OR NEW.company_signature_svg IS DISTINCT FROM OLD.company_signature_svg OR NEW.execution_hash IS DISTINCT FROM OLD.execution_hash OR NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Verified Sales Partner Agreements are immutable.';
  END IF;
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_protect_sales_agreement_immutability ON public.sales_partner_agreements;
CREATE TRIGGER trg_protect_sales_agreement_immutability BEFORE UPDATE ON public.sales_partner_agreements FOR EACH ROW EXECUTE FUNCTION public.protect_sales_agreement_immutability();

CREATE OR REPLACE FUNCTION public.protect_applicant_agreement_status()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.agreement_status IS DISTINCT FROM OLD.agreement_status AND COALESCE(current_setting('profox.agreement_workflow_rpc',true),'')<>'1' THEN
  RAISE EXCEPTION 'Agreement status is controlled by the secure Sales Partner Agreement workflow.';
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_protect_applicant_agreement_status ON public.applicants;
CREATE TRIGGER trg_protect_applicant_agreement_status BEFORE UPDATE OF agreement_status ON public.applicants FOR EACH ROW EXECUTE FUNCTION public.protect_applicant_agreement_status();

-- Entering Agreement Pending from the recruitment pipeline automatically issues the current published agreement.
CREATE OR REPLACE FUNCTION public.queue_recruitment_stage_notifications()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_admin record; v_template text; v_cycle text:=md5(clock_timestamp()::text||random()::text||NEW.id::text);
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.stage='Video Pending' THEN
   PERFORM public.queue_recruitment_email(NEW,'recruitment_video_pending','video-pending-'||v_cycle,now());
   PERFORM public.queue_recruitment_video_pending_followups(NEW,v_cycle);
  ELSE PERFORM public.queue_recruitment_email(NEW,'recruitment_application_received','application-received',now()); END IF;
  FOR v_admin IN SELECT id FROM public.user_profiles WHERE role='admin' AND status='active' LOOP
   PERFORM public.enqueue_in_app_notification(v_admin.id,'Recruitment','New sales application',NEW.full_name||' submitted an application for the Independent Sales Representative role.','/admin/app/recruitment','recruitment:new-applicant:'||NEW.id::text||':'||v_admin.id::text);
  END LOOP;
  RETURN NEW;
 END IF;
 IF NEW.refusal_reason IS DISTINCT FROM OLD.refusal_reason AND COALESCE(trim(NEW.refusal_reason),'')<>'' THEN
  PERFORM public.cancel_recruitment_video_pending_followups(NEW.id,'Candidate application was closed.');
  PERFORM public.queue_recruitment_email(NEW,'recruitment_not_selected','not-selected',now()); RETURN NEW;
 END IF;
 IF NEW.stage IS DISTINCT FROM OLD.stage THEN
  IF OLD.stage='Video Pending' AND NEW.stage<>'Video Pending' THEN PERFORM public.cancel_recruitment_video_pending_followups(NEW.id,'Candidate progressed beyond Video Pending.'); END IF;
  v_template:=CASE NEW.stage
   WHEN 'New Application' THEN 'recruitment_application_received' WHEN 'Video Pending' THEN 'recruitment_video_pending'
   WHEN 'Video Review' THEN 'recruitment_video_received' WHEN 'Initial Screening' THEN 'recruitment_initial_screening'
   WHEN 'Shortlisted' THEN 'recruitment_shortlisted' WHEN 'Sales Assessment' THEN 'recruitment_sales_assessment'
   WHEN 'Lead Research Test' THEN 'recruitment_lead_research' WHEN 'CRM Assessment' THEN 'recruitment_crm_assessment'
   WHEN 'Selected' THEN 'recruitment_selected' WHEN 'Agreement Pending' THEN 'recruitment_agreement_pending'
   WHEN 'One-Day Training' THEN 'recruitment_training' WHEN 'Final Approval' THEN 'recruitment_final_review'
   WHEN 'Ready for System Access' THEN 'recruitment_final_approved' WHEN 'Activated' THEN 'recruitment_activated' ELSE NULL END;
  IF v_template IS NOT NULL THEN PERFORM public.queue_recruitment_email(NEW,v_template,'stage-'||lower(replace(NEW.stage,' ','-'))||'-'||v_cycle,now()); END IF;
  IF NEW.stage='Video Pending' THEN PERFORM public.queue_recruitment_video_pending_followups(NEW,v_cycle); END IF;
  IF NEW.stage='Agreement Pending' AND OLD.stage='Selected' AND COALESCE(NEW.agreement_status,'not_sent')='not_sent' THEN
   PERFORM public.create_sales_partner_agreement_internal(NEW.id);
  END IF;
 END IF;
 RETURN NEW;
END; $$;

REVOKE ALL ON TABLE public.sales_partner_agreements FROM anon;
REVOKE ALL ON TABLE public.sales_agreement_templates FROM anon;
REVOKE ALL ON TABLE public.sales_agreement_events FROM anon;

REVOKE ALL ON FUNCTION public.build_sales_agreement_dynamic_snapshot(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_sales_partner_agreement_internal(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.service_sign_sales_partner_agreement(uuid,text,text,jsonb,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.service_decline_sales_partner_agreement(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_sign_sales_partner_agreement(uuid,text,text,jsonb,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_decline_sales_partner_agreement(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.public_get_sales_partner_agreement(uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_sales_agreement_template() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_sales_agreement_template(text,text,text,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_publish_sales_agreement_template(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_preview_sales_agreement_dynamic_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_issue_sales_partner_agreement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resend_sales_partner_agreement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_verify_sales_partner_agreement(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_sales_partner_agreement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_sales_partner_agreements() TO authenticated;

REVOKE ALL ON FUNCTION public.protect_sales_agreement_immutability() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.protect_applicant_agreement_status() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.queue_recruitment_stage_notifications() FROM PUBLIC,anon,authenticated;
