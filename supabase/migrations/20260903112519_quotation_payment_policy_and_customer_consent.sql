create table if not exists public.quotation_customer_decisions (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  decision text not null check (decision in ('Accepted','Rejected')),
  customer_name text not null,
  customer_email text not null,
  response_notes text,
  terms_url text not null,
  terms_version text not null,
  payment_policy_url text not null,
  payment_policy_version text not null,
  consent_text text,
  consent_given boolean not null default false,
  legal_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.quotation_customer_decisions enable row level security;
revoke all on public.quotation_customer_decisions from anon, authenticated;
create index if not exists quotation_customer_decisions_quotation_created_idx on public.quotation_customer_decisions(quotation_id, created_at desc);

create or replace function public.quotation_legal_policy_metadata()
returns jsonb language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select jsonb_build_object(
    'termsUrl','https://www.profoxwebdesigner.com/terms-and-conditions',
    'termsVersion','2026-08-07',
    'paymentPolicyUrl','https://www.profoxwebdesigner.com/payment-policy',
    'paymentPolicyVersion','2026-09-03',
    'consentText','I have reviewed this quotation and agree to the ProFox Terms & Conditions and Payment Policy. I understand that accepting the quotation does not itself authorize a charge; any payment is authorized separately through the approved payment method or payment provider.'
  );
$$;
grant execute on function public.quotation_legal_policy_metadata() to anon, authenticated;

create or replace function public.open_public_quotation_v2(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_payload jsonb;
begin
  v_payload := public.open_public_quotation(p_token);
  return coalesce(v_payload,'{}'::jsonb) || jsonb_build_object('legal', public.quotation_legal_policy_metadata());
end;
$$;
grant execute on function public.open_public_quotation_v2(text) to anon, authenticated;

create or replace function public.get_public_quotation_payment(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public','extensions','pg_temp'
as $$
declare v_hash text; v_quote public.quotations%rowtype; v_payment jsonb := '{}'::jsonb;
begin
  if p_token is null or length(p_token)<40 or length(p_token)>256 then raise exception 'Quotation link is invalid.'; end if;
  v_hash := encode(extensions.digest(p_token,'sha256'),'hex');
  select * into v_quote from public.quotations where customer_view_token_hash=v_hash;
  if not found then raise exception 'Quotation link is invalid or no longer available.'; end if;
  if v_quote.status <> 'Accepted' then raise exception 'Payment is available only after the quotation is accepted.'; end if;
  v_payment := public.sync_quotation_payment_plan(v_quote.id);
  return jsonb_build_object('quotationNumber',v_quote.quotation_number,'status',v_quote.status,'acceptedAt',v_quote.accepted_at,'payment',v_payment);
end;
$$;
grant execute on function public.get_public_quotation_payment(text) to anon, authenticated;

create or replace function public.respond_public_quotation_v2(
  p_token text,
  p_response text,
  p_customer_name text,
  p_customer_email text,
  p_note text default '',
  p_consent boolean default false
)
returns jsonb language plpgsql security definer set search_path to 'public','extensions','pg_temp'
as $$
declare
  v_hash text;
  v_quote public.quotations%rowtype;
  v_response text := lower(btrim(coalesce(p_response,'')));
  v_note text := left(btrim(coalesce(p_note,'')),2000);
  v_name text := left(btrim(coalesce(p_customer_name,'')),120);
  v_email text := lower(left(btrim(coalesce(p_customer_email,'')),254));
  v_result jsonb;
  v_legal jsonb := public.quotation_legal_policy_metadata();
begin
  if p_token is null or length(p_token)<40 or length(p_token)>256 then raise exception 'Quotation link is invalid.'; end if;
  if v_response not in ('accept','reject','request_changes') then raise exception 'Choose Accept, Request Changes, or Decline.'; end if;
  v_hash := encode(extensions.digest(p_token,'sha256'),'hex');
  select * into v_quote from public.quotations where customer_view_token_hash=v_hash for update;
  if not found then raise exception 'Quotation link is invalid or no longer available.'; end if;

  if v_response='request_changes' then
    return public.respond_public_quotation(p_token,'request_changes',v_note);
  end if;

  if v_quote.status <> 'Sent' then raise exception 'This quotation can no longer be changed from this link.'; end if;
  if v_quote.superseded_by_id is not null then raise exception 'This quotation has been superseded by a newer revision. Please review the latest proposal from ProFox.'; end if;
  if v_quote.valid_until is not null and v_quote.valid_until < current_date then raise exception 'This quotation has expired. Please contact ProFox for an updated quotation.'; end if;
  if length(v_name) < 2 then raise exception 'Please enter your full name.'; end if;
  if v_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then raise exception 'Please enter a valid email address.'; end if;
  if v_response='accept' and p_consent is not true then raise exception 'Please confirm the Terms & Conditions and Payment Policy before accepting.'; end if;
  if v_response='reject' and length(v_note) < 3 then raise exception 'Please tell us why you are declining this quotation.'; end if;

  v_result := public.respond_public_quotation(p_token,v_response,v_note);

  insert into public.quotation_customer_decisions(
    quotation_id, decision, customer_name, customer_email, response_notes,
    terms_url, terms_version, payment_policy_url, payment_policy_version,
    consent_text, consent_given, legal_snapshot
  ) values (
    v_quote.id,
    case when v_response='accept' then 'Accepted' else 'Rejected' end,
    v_name, v_email, nullif(v_note,''),
    v_legal->>'termsUrl', v_legal->>'termsVersion',
    v_legal->>'paymentPolicyUrl', v_legal->>'paymentPolicyVersion',
    case when v_response='accept' then v_legal->>'consentText' else null end,
    case when v_response='accept' then true else false end,
    jsonb_build_object(
      'quotationNumber',v_quote.quotation_number,
      'revisionNumber',v_quote.revision_number,
      'currency',v_quote.currency,
      'total',v_quote.total,
      'paymentTerms',v_quote.payment_terms,
      'termsAndConditions',v_quote.terms_and_conditions,
      'legal',v_legal
    )
  );

  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object('legal',v_legal,'decisionRecorded',true);
end;
$$;
grant execute on function public.respond_public_quotation_v2(text,text,text,text,text,boolean) to anon, authenticated;

update public.content
set data = (
  select coalesce(jsonb_agg(value),'[]'::jsonb)
  from jsonb_array_elements(data)
  where value->>'id' <> 'payment-policy' and value->>'slug' <> 'payment-policy'
) || jsonb_build_array(jsonb_build_object(
  'id','payment-policy','slug','payment-policy','title','Payment Policy','status','published','template','standard',
  'createdAt','2026-09-03','updatedAt','2026-09-03','heroSubheading','PAYMENT POLICY',
  'heroTitle','Clear Payment Terms Before Work Begins',
  'heroSubtitle','How ProFox confirms project pricing, payment milestones, third-party costs, scope changes, and payment authorization.',
  'bodyContent','This Payment Policy works together with your approved quotation, Statement of Work or service agreement and the ProFox Terms & Conditions. The approved quotation remains the source of truth for the specific price, scope and payment schedule for your project.',
  'seo',jsonb_build_object('noIndex',false,'metaTitle','Payment Policy | ProFox Web Designer','metaDescription','Read the ProFox payment policy covering approved project pricing, payment milestones, third-party costs, scope changes and payment authorization.','canonicalUrl','https://www.profoxwebdesigner.com/payment-policy','focusKeyword','ProFox payment policy','schemaType','WebPage'),
  'blocks',jsonb_build_array(jsonb_build_object(
    'id','payment-principles','type','features','heading','Payment terms, explained clearly','subheading','The rules below reflect the same payment approach used in ProFox quotations and service agreements.',
    'items',jsonb_build_array(
      jsonb_build_object('icon','file','title','1. Approved Price & Scope','description','Professional-service fees are confirmed in the approved quotation, Statement of Work or service agreement. The final project investment is confirmed after the agreed scope, deliverables, exclusions and requirements are documented.'),
      jsonb_build_object('icon','check','title','2. Payment Schedule & Milestones','description','Payments are due according to the schedule stated in the approved quotation or agreement. Depending on the project, payments may be divided across agreed delivery milestones. Work enters the delivery process after the required initial payment is received when an initial payment applies.'),
      jsonb_build_object('icon','file','title','3. Third-Party Costs','description','Domain registration, hosting, premium plugins, external applications, SaaS subscriptions, stock media, API usage, payment-provider charges and external licences are separate unless the approved quotation specifically says they are included.'),
      jsonb_build_object('icon','check','title','4. Changes & Additional Charges','description','Requests outside the approved scope are discussed before additional work or charges are authorized. ProFox does not add an out-of-scope charge to an approved project without communicating the change and obtaining the required approval.'),
      jsonb_build_object('icon','user','title','5. Quotation Acceptance','description','Accepting a quotation confirms that the customer has reviewed the quoted scope, investment, payment schedule and applicable ProFox Terms & Conditions and Payment Policy. ProFox records the acceptance and policy versions presented at the time of the decision.'),
      jsonb_build_object('icon','check','title','6. Payment Authorization','description','Accepting a quotation or agreeing to this Payment Policy does not itself authorize ProFox to debit a card, bank account or other payment method. Actual payment authorization occurs separately through the approved payment provider or payment method.'),
      jsonb_build_object('icon','file','title','7. Quotation-Specific Terms','description','If an approved quotation or written service agreement contains project-specific payment terms, those specific terms apply to that project together with the general ProFox Terms & Conditions and this Payment Policy.'),
      jsonb_build_object('icon','user','title','8. Questions Before Payment','description','If any price, milestone, third-party cost or payment requirement is unclear, contact your ProFox representative before accepting the quotation or making payment. We want the commercial terms to be clear before delivery begins.')
    )
  ))
)), updated_at=now()
where id='customPages';

update public.content
set data = jsonb_set(
  data,'{legalLinks}',
  (select coalesce(jsonb_agg(value),'[]'::jsonb) from jsonb_array_elements(coalesce(data->'legalLinks','[]'::jsonb)) where value->>'href' <> '/payment-policy')
    || jsonb_build_array(jsonb_build_object('href','/payment-policy','label','Payment Policy')),
  true
), updated_at=now()
where id='footer';
