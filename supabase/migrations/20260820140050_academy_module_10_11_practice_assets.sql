-- Module 10 practice assets + Module 11 simulated-lead library and scoring controls.

INSERT INTO public.call_practice_drills(title,category,instructions,completion_prompt,required,sort_order,active) VALUES
('Opening & Agenda Drill','Opening','Run a 60–90 second opening for a prospect who replied to cold outreach. Establish purpose, process and permission without pitching ProFox.','What did you remove or improve between repetitions?',true,1,true),
('Voice Presence Drill','Communication','Deliver the same opening three times. Improve pace, clarity, pauses and filler-word control while keeping your tone natural.','What delivery habit needs the most work?',true,2,true),
('First Question Drill','Questioning','Choose one strong opening question for Website, Web Application and Automation prospects. Prepare two possible follow-ups for each.','Which question created the most useful direction?',true,3,true),
('Listen & Reflect Drill','Listening','Listen to a simulated buyer answer for at least 30 seconds. Before asking another question, reflect the important meaning back accurately.','What did you hear that you might otherwise have missed?',true,4,true),
('Follow the Thread Drill','Questioning','For five prospect statements, practise Clarify, Expand, Example and Consequence follow-ups instead of moving to the next scripted topic.','Which follow-up type helped you go deepest?',true,5,true),
('Root Cause Drill','Diagnosis','Take three surface statements — need more leads, process is too manual, emails do not work — and diagnose deeper without inventing the cause.','Where did you almost make an assumption?',true,6,true),
('Business Impact Drill','Impact','Connect four operational problems to buyer-supported revenue, time, cost, customer experience, risk or growth consequences.','Which impact did the buyer actually validate?',true,7,true),
('Outcome & Value Drill','Value','Move from current pain to desired future state. Use only buyer-provided numbers when exploring potential value.','Did you keep hypothetical value separate from guaranteed results?',true,8,true),
('Priority & Why-Now Drill','Urgency','Practise a real deadline, a weak timeline and no urgency. Clarify priority without creating artificial scarcity.','What evidence showed whether urgency was real?',true,9,true),
('Money Conversation Drill','Commercial','Practise an early price question, a small budget and no budget. Stay transparent and consultative using the live Sales Catalog.','Where did the commercial conversation feel most natural?',true,10,true),
('Decision Process Drill','Decision','Practise founder-led, finance-approved and researcher-for-boss buying situations. Identify stakeholders and process respectfully.','Who needed to be involved and why?',true,11,true),
('Summary & Next-Step Drill','Close','Summarise a simulated discovery accurately, confirm fit, then agree a specific owner and date for the appropriate next action.','Was the next step mutual, specific and justified?',true,12,true);

INSERT INTO public.mock_call_rubric_items(title,description,max_points,sort_order,active) VALUES
('Preparation & Opening','Demonstrates relevant preparation, establishes trust quickly and opens without premature pitching.',8,1,true),
('Agenda & Conversation Control','Sets collaborative expectations and maintains useful direction without dominating the buyer.',8,2,true),
('Question Quality','Asks relevant, concise questions and adapts follow-ups to the buyer rather than reading a checklist.',14,3,true),
('Active Listening','Reflects meaning, uses buyer language, allows pauses and follows important threads.',12,4,true),
('Root Cause Diagnosis','Moves beyond symptoms and validates the real problem without inventing facts.',12,5,true),
('Business Impact & Value','Explores consequences and value with buyer-supported evidence; does not fabricate ROI.',12,6,true),
('Priority & Critical Event','Clarifies why change matters now and the consequence of inaction without false urgency.',8,7,true),
('Commercial & Decision Context','Handles money professionally and identifies stakeholders, criteria and buying process.',10,8,true),
('Summary & Fit','Accurately summarises what was learned and recommends only what the evidence supports.',8,9,true),
('Next Step & Professionalism','Ends with a clear mutual next step or honest disqualification while protecting trust.',8,10,true);

INSERT INTO public.mock_call_critical_rules(title,description,sort_order,active) VALUES
('No fabricated results or ROI','Do not invent, guarantee or present hypothetical commercial results as factual outcomes.',1,true),
('No false urgency or scarcity','Do not manufacture deadlines, limited availability or pressure that is not genuinely true.',2,true),
('No unauthorized commercial commitments','Do not invent pricing, discounts, payment terms, scope or delivery promises outside approved authority.',3,true),
('No unverified technical promises','Do not claim a feature, integration, security capability or feasibility is confirmed when it has not been verified.',4,true),
('No capability misrepresentation','Do not misrepresent ProFox services, experience, evidence or what the company can deliver.',5,true),
('Protect confidential information','Do not expose, misuse or request information in a way that violates ProFox confidentiality and data rules.',6,true),
('Respect explicit stop or no-contact requests','If the prospect clearly ends the conversation or requests no further contact, respect it without manipulation.',7,true);

INSERT INTO public.mock_call_scenarios(name,service_type,industry,difficulty,seller_brief,evaluator_brief,evaluator_instructions,version,weight,active) VALUES
(
'Roofing Referral Dependence','Website Design & Development','Roofing','standard',
jsonb_build_object(
 'companyName','NorthPeak Roofing Group','contactName','Sarah Mitchell','contactRole','Operations Director','location','Dallas, Texas, USA','employeeRange','15–25','website','https://northpeak-roofing.example','leadSource','Cold outreach reply','serviceInterest','Website Design & Development','knownContext','Sarah replied positively after personalized outreach about improving online lead generation.','coldOutreachHistory','Seller noticed an outdated conversion path and weak enquiry flow, sent a short personalized message, and Sarah agreed to a discovery conversation.','publicFacts',jsonb_build_array('Residential and commercial roofing','Most visible proof is project-gallery based','Service area covers the Dallas metro')
),
jsonb_build_object(
 'personaStyle','Friendly but skeptical, busy, dislikes long pitches.','hiddenSituation','Most new customers still come through referrals. Website enquiries have fallen and the team wants a second predictable acquisition channel.','rootProblem','The site creates weak trust for non-referral visitors and quote requests are not followed up consistently.','impact','Growth is unpredictable and the team loses some prospects who compare multiple roofers online.','desiredOutcome','A credible site and enquiry journey that supports predictable qualified conversations.','criticalEvent','They want improvements working before the next major storm season.','budgetContext','Comfortable around $3,000–$5,000 if the business case is clear. Do not volunteer this unless the seller explores investment professionally.','decisionProcess','Sarah leads evaluation; the owner, Michael, gives final approval.','decisionCriteria',jsonb_build_array('Lead generation','Trust/portfolio proof','Easy updates','Ongoing support'),'objections',jsonb_build_array('Bad experience with a previous agency','May ask for a lead guarantee'),'revealRules','Reveal hidden information only when the seller earns it with appropriate discovery questions. Do not rescue weak discovery.'
),
'Stay fully in prospect role until the call ends. Do not coach during the call. Give natural answers, reveal hidden facts only when relevant questions are asked, and use the guarantee question as a trust test.',1,100,true
),
(
'HVAC After-Hours Lead Response','Email Marketing & Business Automation','HVAC','standard',
jsonb_build_object(
 'companyName','BrightAir Heating & Cooling','contactName','Daniel Brooks','contactRole','General Manager','location','Phoenix, Arizona, USA','employeeRange','25–40','website','https://brightair-hvac.example','leadSource','Cold email reply','serviceInterest','Email Marketing & Business Automation','knownContext','Daniel said the company receives many evening and weekend enquiries and asked what ProFox means by connected follow-up.','coldOutreachHistory','Seller noticed multiple contact paths but no obvious post-enquiry journey and sent a value-focused cold email.','publicFacts',jsonb_build_array('Residential HVAC service and installation','Emergency service promoted prominently','Strong local reviews')
),
jsonb_build_object(
 'personaStyle','Practical, numbers-oriented, impatient with vague marketing language.','hiddenSituation','Office staff manually respond the next morning to many after-hours leads.','rootProblem','No automated acknowledgement, qualification or follow-up exists outside business hours.','impact','Some high-intent repair/replacement prospects contact competitors before staff respond.','desiredOutcome','Immediate professional response plus structured follow-up without replacing human sales conversations.','criticalEvent','Summer demand is rising in six weeks.','budgetContext','Has not fixed a budget; expects evidence that automation will reduce leakage.','decisionProcess','Daniel recommends; owner and finance approve recurring software/agency costs.','decisionCriteria',jsonb_build_array('Speed','Reliability','CRM visibility','Human handoff'),'objections',jsonb_build_array('Worries automation will feel robotic','Asks whether every lead can be guaranteed to convert'),'revealRules','Do not give exact lost-lead numbers unless the seller asks; if asked, estimate 8–15 after-hours enquiries a week go cold, but make clear this is an internal estimate.'
),
'Act as a pragmatic GM. Reward concise operational questions. Challenge fluffy claims and guaranteed-outcome language.',1,100,true
),
(
'Legal Firm Trust Rebuild','Website Design & Development','Legal Services','advanced',
jsonb_build_object(
 'companyName','Westbridge Legal Partners','contactName','Amelia Grant','contactRole','Managing Partner','location','Manchester, UK','employeeRange','10–20','website','https://westbridge-legal.example','leadSource','LinkedIn cold outreach reply','serviceInterest','Website Design & Development','knownContext','Amelia agreed the current website no longer reflects the firm but said referrals are still strong.','coldOutreachHistory','Seller sent a concise LinkedIn observation about trust, expertise presentation and mobile usability.','publicFacts',jsonb_build_array('Commercial and employment law','Established local practice','Partners publish occasional articles')
),
jsonb_build_object(
 'personaStyle','Senior executive, concise, expects preparation and dislikes generic questions.','hiddenSituation','The firm wins referrals but loses some higher-value prospects who research online before contacting.','rootProblem','The website undersells specialist expertise and creates a dated first impression.','impact','Partners believe digital credibility is limiting expansion beyond the referral network.','desiredOutcome','Premium positioning and clearer practice-area journeys without looking like an aggressive lead-generation site.','criticalEvent','A new partner joins in four months and the firm plans a broader market push.','budgetContext','Budget can support a premium engagement; value and reputation matter more than lowest price.','decisionProcess','Three partners approve together.','decisionCriteria',jsonb_build_array('Professional credibility','Editorial quality','Accessibility','Low maintenance'),'objections',jsonb_build_array('Concern that redesign could make the firm look salesy','May ask why they need change if referrals work'),'revealRules','Answer senior-level questions briefly. Do not volunteer partner politics or budget.'
),
'Require strong executive discovery. If the seller asks basic facts visible on the brief/site, become less engaged. Reward concise, insightful follow-up.',1,80,true
),
(
'Logistics Spreadsheet Bottleneck','Custom Web Application','Logistics','advanced',
jsonb_build_object(
 'companyName','AtlasRoute Logistics','contactName','Marcus Lee','contactRole','Operations Manager','location','Toronto, Ontario, Canada','employeeRange','50–80','website','https://atlasroute-logistics.example','leadSource','Cold Loom outreach reply','serviceInterest','Custom Web Application','knownContext','Marcus said several operational processes still depend on spreadsheets and asked whether ProFox builds internal systems.','coldOutreachHistory','Seller sent a short Loom showing how fragmented operational handoffs can create duplicate work.','publicFacts',jsonb_build_array('Regional freight and last-mile delivery','Multiple dispatch locations','B2B customer base')
),
jsonb_build_object(
 'personaStyle','Detailed operator, willing to explain process if the seller asks precise questions.','hiddenSituation','Dispatch, customer updates and exception tracking are spread across spreadsheets, email and messaging apps.','rootProblem','No single workflow owns shipment exceptions and handoffs.','impact','Duplicate entry, missed status updates and manager time spent reconciling records.','desiredOutcome','One role-based operational application with clear status ownership and reporting.','criticalEvent','A new depot opens in five months.','budgetContext','Management expects a scoped custom quotation; no approved amount yet.','decisionProcess','Operations, IT/security and finance must evaluate before COO approval.','decisionCriteria',jsonb_build_array('Permissions','Auditability','Integration feasibility','Reliability','Reporting'),'objections',jsonb_build_array('Will ask whether ProFox can integrate with a named carrier API','Will challenge delivery timeline'),'revealRules','The carrier API feasibility is intentionally unknown. The correct seller response is to capture requirements and verify technically rather than promise.'
),
'Do not let the seller shortcut technical discovery. Ask a specific integration question and test whether they responsibly defer verification.',1,100,true
),
(
'Dental Multi-Location Intake Workflow','Custom Web Application','Dental','standard',
jsonb_build_object(
 'companyName','HarborSmile Dental Group','contactName','Priya Shah','contactRole','Practice Operations Lead','location','Vancouver, British Columbia, Canada','employeeRange','35–50','website','https://harborsmile-dental.example','leadSource','Cold outreach reply','serviceInterest','Custom Web Application','knownContext','Priya mentioned that patient intake and internal handoffs differ across locations.','coldOutreachHistory','Seller contacted Priya after noticing multiple clinic locations and offered to discuss operational consistency rather than pitching a specific product.','publicFacts',jsonb_build_array('Three clinic locations','General and cosmetic dentistry','Online appointment requests available')
),
jsonb_build_object(
 'personaStyle','Warm but cautious about privacy and staff adoption.','hiddenSituation','Forms arrive through several channels and staff re-enter information into different systems.','rootProblem','No consistent intake/handoff workflow across clinics.','impact','Administrative duplication, occasional missing information and uneven patient experience.','desiredOutcome','Consistent digital intake workflow with clear ownership and minimal duplicate entry.','criticalEvent','Fourth location planned next year; not an immediate emergency.','budgetContext','Exploring options; needs phased scope before budget approval.','decisionProcess','Operations builds case; clinic directors and privacy advisor review; owner approves.','decisionCriteria',jsonb_build_array('Privacy','Ease of use','Phased rollout','Compatibility'),'objections',jsonb_build_array('Concern about sensitive patient data','Wants assurance without technical overpromising'),'revealRules','Do not reveal exact system names unless seller asks about current tools. Keep privacy concern central.'
),
'Test whether the seller treats privacy as a requirement to investigate rather than making unsupported compliance guarantees.',1,90,true
),
(
'Ecommerce Retention Gap','Email Marketing & Business Automation','E-commerce','standard',
jsonb_build_object(
 'companyName','Morrow & Pine Home','contactName','Olivia Chen','contactRole','Ecommerce Director','location','London, UK','employeeRange','20–35','website','https://morrow-pine.example','leadSource','Cold email reply','serviceInterest','Email Marketing & Business Automation','knownContext','Olivia said acquisition costs are rising and the team wants more value from existing customers.','coldOutreachHistory','Seller sent a personalized email focused on customer lifecycle gaps rather than generic newsletter management.','publicFacts',jsonb_build_array('Direct-to-consumer home accessories','International shipping','Frequent seasonal collections')
),
jsonb_build_object(
 'personaStyle','Commercial marketer, understands metrics and expects specific lifecycle questions.','hiddenSituation','Email is mostly campaign-based with weak post-purchase, win-back and browse/abandonment journeys.','rootProblem','Customer lifecycle is not segmented or automated consistently.','impact','Repeat purchase rate is below internal target and paid acquisition carries too much of growth.','desiredOutcome','Lifecycle automation that improves retention while protecting brand tone.','criticalEvent','Holiday campaign planning starts in three months.','budgetContext','Can invest if measurement is credible; will not accept guaranteed uplift claims.','decisionProcess','Olivia owns recommendation; CFO approves annual spend.','decisionCriteria',jsonb_build_array('Measurement','Brand control','Segmentation','Integration'),'objections',jsonb_build_array('Asks what uplift ProFox can guarantee','Concern about too many emails'),'revealRules','If asked, provide internal repeat-purchase target vs current only as directional: current roughly 18%, target 25%. Do not treat the gap as guaranteed recoverable revenue.'
),
'Test commercial fluency and disciplined ROI language. Push back if seller turns scenario math into a guarantee.',1,100,true
),
(
'Construction Quotation Workflow','Custom Web Application','Construction','advanced',
jsonb_build_object(
 'companyName','Stonefield Commercial Build','contactName','Ethan Walker','contactRole','Commercial Director','location','Birmingham, UK','employeeRange','70–120','website','https://stonefield-build.example','leadSource','Cold call follow-up','serviceInterest','Custom Web Application','knownContext','Ethan said quotation preparation involves too much back-and-forth between sales and estimating.','coldOutreachHistory','Seller called after researching the company and followed with a concise recap; Ethan accepted a discovery meeting.','publicFacts',jsonb_build_array('Commercial refurbishment and fit-out','Multi-disciplinary estimating team','Projects vary significantly in scope')
),
jsonb_build_object(
 'personaStyle','Direct, commercially experienced, challenges vague answers.','hiddenSituation','Sales gathers requirements inconsistently; estimators chase missing data before pricing.','rootProblem','No structured qualification-to-estimating handoff.','impact','Slow quotation turnaround and wasted estimator time.','desiredOutcome','Structured intake, approval and quotation workflow with visibility.','criticalEvent','Leadership wants process improvement before the next financial year.','budgetContext','Would consider a meaningful custom-app investment if phased risk is controlled.','decisionProcess','Commercial Director + Head of Estimating sponsor; IT and Finance review; MD approves.','decisionCriteria',jsonb_build_array('Adoption','Configurability','Permissions','Reporting','Implementation risk'),'objections',jsonb_build_array('Asks for an aggressive delivery date','May request a discount before scope is known'),'revealRules','Do not give a budget figure unless directly asked; respond that investment depends on approved scope.'
),
'Challenge unauthorized discounts and delivery promises. Stay firm but professional.',1,80,true
),
(
'Consulting Firm Positioning Gap','Website Design & Development','Business Consulting','foundation',
jsonb_build_object(
 'companyName','ClearNorth Advisory','contactName','James Carter','contactRole','Founder','location','Sydney, NSW, Australia','employeeRange','5–10','website','https://clearnorth-advisory.example','leadSource','LinkedIn cold outreach reply','serviceInterest','Website Design & Development','knownContext','James said the firm gets good referrals but the website does not explain its value clearly.','coldOutreachHistory','Seller sent a short LinkedIn message about positioning and buyer clarity after reviewing the site.','publicFacts',jsonb_build_array('Strategy and operations consulting','Founder-led sales','Mostly referral-driven')
),
jsonb_build_object(
 'personaStyle','Open, conversational, gives useful detail when asked.','hiddenSituation','Prospects often arrive through referrals but still use the site to validate credibility.','rootProblem','Generic messaging makes the firm look similar to larger competitors.','impact','Founder spends too much sales-call time re-explaining positioning and proof.','desiredOutcome','Sharper positioning, stronger case studies and a clearer path to enquiry.','criticalEvent','No hard deadline; wants improvement this quarter if the right partner is found.','budgetContext','Comfortable with a business-level website investment.','decisionProcess','James decides, with input from one senior consultant.','decisionCriteria',jsonb_build_array('Messaging quality','Credibility','Speed','Ease of editing'),'objections',jsonb_build_array('May say referrals already work','Wants simple process'),'revealRules','This is a foundation scenario: answer naturally and make the discovery opportunity accessible without volunteering every hidden detail.'
),
'Use this scenario for less experienced trainees. Stay friendly but still require the seller to explore impact and desired outcome.',1,120,true
);
