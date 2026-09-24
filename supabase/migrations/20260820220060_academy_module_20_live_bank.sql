-- Module 20 — live three-round buyer case bank, 100-point rubric and 15 critical rules.

truncate table public.final_certification_events restart identity cascade;
delete from public.final_certification_sessions;
delete from public.final_certification_cases;
delete from public.final_certification_rubric_items;
delete from public.final_certification_critical_rules;

insert into public.final_certification_cases(name,industry,market,difficulty,seller_brief,evaluator_brief,rounds,evaluator_instructions,version,weight,active) values
('Apex Roofing & Exteriors','Roofing & Exterior Services','United States','advanced',
 '{"company":"Apex Roofing & Exteriors","primaryContact":"Sarah Mitchell — Marketing Director","context":"Established residential/commercial roofer. Website feels dated on mobile and quote leads are distributed manually.","knownGoal":"Improve the digital lead experience before an important seasonal period.","knownRisk":"A competitor agency is also being considered.","meetingObjective":"Diagnose before recommending and earn a legitimate decision step."}'::jsonb,
 '{"hiddenFacts":["Lead volume is healthy but response ownership is inconsistent.","Sarah is the internal champion but Daniel Cole, Owner, is the final commercial decision maker.","Budget exists; perceived implementation risk matters more than absolute price.","A competitor quote is about 30% cheaper but has less clear lead-flow scope.","Sarah will ask about an unvalidated third-party integration if the seller overpromises."],"buyerStyle":"Professional, time-conscious, curious but skeptical of agency promises.","round3Pressure":["Ask for unsupported integration guarantee","Say payment was sent and ask to start immediately","Send a synthetic admin-password placeholder"]}'::jsonb,
 '[{"round":1,"title":"Discovery","minutes":15,"objective":"Uncover current state, gap, impact, desired outcome, why now and decision process without premature pitching."},{"round":2,"title":"Recommendation, Objection & Close","minutes":15,"objective":"Recap, recommend, connect value, handle price/competitor objection, and secure the legitimate decision step involving the real authority."},{"round":3,"title":"Rapid Operational Judgment","minutes":10,"objective":"Test commercial, payment, CRM and confidentiality decisions under pressure."}]'::jsonb,
 'Do not coach during the assessment. Reveal hidden facts only when the seller earns them through relevant questions. Inject the price objection in Round 2 and all three pressure situations in Round 3. Score observable behavior, not charisma.',1,120,true),
('MaplePeak HVAC & Plumbing','HVAC & Plumbing','Canada','advanced',
 '{"company":"MaplePeak HVAC & Plumbing","primaryContact":"Noah Bennett — Operations Director","context":"Multi-location service company with paid traffic, phone-heavy lead intake and inconsistent online booking.","knownGoal":"Create a stronger website/booking path and reduce manual lead-routing friction.","knownRisk":"Operations cannot tolerate a disruptive launch.","meetingObjective":"Diagnose business/operational requirements and identify the correct commercial path."}'::jsonb,
 '{"hiddenFacts":["Owner Priya Shah must approve final spend.","Existing CRM can integrate through standard APIs but exact workflow needs validation.","The buyer may request a custom scheduling workflow outside standard scope.","Budget is available if implementation risk is controlled.","Noah will ask for a custom payment schedule late in Round 2."],"buyerStyle":"Operational, practical, impatient with vague marketing language.","round3Pressure":["Ask seller to promise zero downtime","Request custom payment terms without approval","Ask seller to change CRM stage early for internal reporting"]}'::jsonb,
 '[{"round":1,"title":"Discovery","minutes":15,"objective":"Diagnose lead flow, operational risk, desired outcome, stakeholders and why now."},{"round":2,"title":"Recommendation, Objection & Close","minutes":15,"objective":"Recommend from the live catalog or route a genuine exception, handle implementation-risk objection, and secure authority-aligned next step."},{"round":3,"title":"Rapid Operational Judgment","minutes":10,"objective":"Test guarantee, commercial-exception and CRM-truth decisions."}]'::jsonb,
 'Keep the buyer focused on operational risk. Do not reveal Priya as final approver until the seller asks about decision process. Score whether the seller validates integration scope instead of inventing certainty.',1,100,true),
('Harbour Legal Group','Legal Services','United Kingdom','advanced',
 '{"company":"Harbour Legal Group","primaryContact":"Amelia Reed — Managing Associate","context":"Growing legal practice with strong referrals but an outdated site, scattered enquiry handling and privacy sensitivity.","knownGoal":"Improve enquiry quality, professional positioning and secure intake routing.","knownRisk":"Partners are highly sensitive to confidentiality and vendor access.","meetingObjective":"Balance commercial discovery with trust, privacy and fit."}'::jsonb,
 '{"hiddenFacts":["Senior Partner Oliver Grant gives final commercial approval.","The firm wants an intake workflow but will not share client case data during sales discovery.","A personal-email workaround used by one staff member is a risk they want to eliminate.","They value confidence and risk reduction more than lowest price.","Amelia will ask to see another law firm client’s private quotation for reassurance."],"buyerStyle":"Measured, detail-oriented, sensitive to confidentiality and unsupported claims.","round3Pressure":["Ask to view another client quotation","Offer to send real client matter data for analysis","Say an invoice was paid and ask for immediate production access"]}'::jsonb,
 '[{"round":1,"title":"Discovery","minutes":15,"objective":"Diagnose goals and workflow without collecting unnecessary confidential client data."},{"round":2,"title":"Recommendation, Objection & Close","minutes":15,"objective":"Build trust, recommend responsibly, address risk, and secure the correct stakeholder decision step."},{"round":3,"title":"Rapid Operational Judgment","minutes":10,"objective":"Test cross-client confidentiality, data minimization and protected payment truth."}]'::jsonb,
 'Keep the conversation realistic for a professional-services buyer. Reward sellers who explicitly avoid requesting real client matter data and who use approved proof instead of cross-client disclosure.',1,100,true);

insert into public.final_certification_rubric_items(title,description,max_points,sort_order,active) values
('Research & Qualification','Uses known account context intelligently, distinguishes fact from assumption and keeps qualification evidence-based.',8,1,true),
('Outreach & Relevance','Communicates with specificity and relevance without generic pitching or invented claims.',7,2,true),
('Discovery','Uncovers current state, gap, impact, desired outcome, why now, decision process and important unknowns while listening well.',15,3,true),
('Recommendation','Connects the best-fit current ProFox direction to discovered outcomes and identifies what still requires validation.',10,4,true),
('Objection Handling','Clarifies, validates, isolates and responds without pressure, defensiveness or reflexive discounting.',10,5,true),
('Closing & Next Step','Leads toward a clear legitimate decision and secures a specific mutual next action aligned with real authority.',10,6,true),
('Commercial Integrity','Protects scope, pricing, approval, quotation, payment and Won boundaries even under buyer urgency.',15,7,true),
('CRM & Calendar Discipline','Keeps stages, meetings, history and next actions truthful, actionable and operationally complete.',10,8,true),
('Confidentiality & Security','Protects customer/ProFox information and reacts correctly to sensitive or suspicious requests.',5,9,true),
('Communication & Professionalism','Communicates clearly, calmly, concisely and consultatively while respecting buyer time and trust.',10,10,true);

insert into public.final_certification_critical_rules(title,description,sort_order,active) values
('Fabricated Prospect or Customer Information','Invents or knowingly records false prospect/customer facts.',1,true),
('Fabricated Call, Meeting or Buyer Commitment','Claims an interaction or buyer commitment that did not occur.',2,true),
('Falsified Lead Source or Commission Attribution','Changes origin/ownership information to manipulate compensation or reporting.',3,true),
('Commission-Biased Recommendation','Knowingly recommends a worse-fit solution to increase personal commission.',4,true),
('Invented Capability or Integration','Promises a feature, integration or technical capability that has not been validated/approved.',5,true),
('Unauthorized Guarantee','Makes an unsupported performance, delivery or outcome guarantee.',6,true),
('Unauthorized Discount or Commercial Term','Offers pricing, payment or other commercial terms outside seller authority.',7,true),
('Quotation Approval Bypass','Attempts to send/accept an approval-required quotation without the required review.',8,true),
('Manual Payment Verification','Declares or writes payment Verified outside the protected ProFox workflow.',9,true),
('Premature Won Transition','Marks or treats an opportunity as Won before the protected qualifying condition is satisfied.',10,true),
('Prohibited Credential or Payment-Secret Handling','Collects, stores or misuses passwords, OTPs, tokens, CVV/security codes or similar restricted secrets.',11,true),
('Ignored No-Contact Instruction','Continues prohibited outreach after an explicit no-contact instruction.',12,true),
('Cross-Client Confidential Disclosure','Reveals another customer’s private quotation, data, strategy, files or communications without authorization.',13,true),
('Falsified CRM or Meeting History','Manipulates stage, activity, ownership, attendance or history to hide truth or inflate performance.',14,true),
('Concealed Material Incident','Hides or delays reporting a material security, privacy, commercial or operational mistake/incident.',15,true);

-- The active rubric must always equal exactly 100 points.
create or replace function public.validate_final_certification_rubric_total()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_total integer; begin
 select coalesce(sum(max_points),0) into v_total from public.final_certification_rubric_items where active=true and id is distinct from new.id;
 if new.active then v_total:=v_total+new.max_points; end if;
 -- Individual writes may temporarily be below 100 while Admin is editing; values above 100 are never allowed.
 if v_total>100 then raise exception 'Active Final Certification rubric cannot exceed 100 total points.'; end if;
 return new;
end;$$;
revoke all on function public.validate_final_certification_rubric_total() from public,anon,authenticated;
drop trigger if exists trg_validate_final_certification_rubric_total on public.final_certification_rubric_items;
create trigger trg_validate_final_certification_rubric_total before insert or update on public.final_certification_rubric_items for each row execute function public.validate_final_certification_rubric_total();
