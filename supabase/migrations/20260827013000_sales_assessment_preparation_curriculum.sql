insert into public.training_tracks(track_key,name,target_role,department,description,active,updated_at)
values(
  'sales_assessment_prep',
  'ProFox Sales Assessment Preparation Center',
  'sales_candidate',
  'Sales',
  'Pre-selection practical preparation for shortlisted Sales candidates. This is separate from the protected post-agreement ProFox Sales Academy.',
  true,
  now()
)
on conflict (track_key) do update set
  name=excluded.name,target_role=excluded.target_role,department=excluded.department,
  description=excluded.description,active=true,updated_at=now();

insert into public.training_modules(title,slug,description,module_type,sort_order,required,active,passing_score,requires_admin_review,academy_key,updated_at)
values
('Assessment Prep · Welcome & Journey','assessment-prep-welcome','Start here. Understand the three assessment stages, how to use this center, and the standard ProFox expects from a prepared candidate.','lesson',1001,true,true,null,false,'sales_assessment_prep',now()),
('Assessment Prep · ProFox & Role Basics','assessment-prep-role-profox','Understand what the Sales role actually involves, what ProFox helps businesses solve, and why diagnosis comes before recommendation.','lesson',1002,true,true,null,false,'sales_assessment_prep',now()),
('Assessment Prep · Lead Research Playbook','assessment-prep-lead-research-playbook','Learn a repeatable research workflow for finding, verifying, qualifying and documenting legitimate prospects with public evidence.','lesson',1003,true,true,null,false,'sales_assessment_prep',now()),
('Assessment Prep · Sales Practical Playbook','assessment-prep-sales-practical','Prepare for a realistic sales conversation using discovery, listening, diagnosis, business impact, solution fit and next-step control.','lesson',1004,true,true,null,false,'sales_assessment_prep',now()),
('Assessment Prep · Objection Practice','assessment-prep-objection-practice','Build confidence handling common buyer concerns calmly, ethically and without pressure or unauthorized promises.','lesson',1005,true,true,null,false,'sales_assessment_prep',now()),
('Assessment Prep · Lead Research Assessment','assessment-prep-lead-research-assessment','Understand what a strong five-business submission looks like and how to quality-check your evidence and reasoning before submission.','lesson',1006,true,true,null,false,'sales_assessment_prep',now()),
('Assessment Prep · CRM Confidence','assessment-prep-crm-confidence','Understand CRM truth, duplicate prevention, useful notes, evidence-based statuses and specific next actions without needing production CRM access.','lesson',1007,true,true,null,false,'sales_assessment_prep',now()),
('Assessment Prep · Integrated Practice Lab','assessment-prep-practice-lab','Combine research, discovery, solution judgment and CRM thinking in one realistic fictional business scenario.','practical',1008,true,true,null,false,'sales_assessment_prep',now()),
('Assessment Prep · Rules & Knowledge Check','assessment-prep-rules-check','Review assessment ethics, data boundaries and the most important concepts you should be able to explain without guessing.','quiz',1009,true,true,null,false,'sales_assessment_prep',now()),
('Assessment Prep · Final Readiness','assessment-prep-final-readiness','Use practical checklists and one final end-to-end drill to decide whether you are ready for the ProFox Sales Assessment.','lesson',1010,true,true,null,false,'sales_assessment_prep',now())
on conflict (slug) do update set
  title=excluded.title,description=excluded.description,module_type=excluded.module_type,
  sort_order=excluded.sort_order,required=excluded.required,active=true,passing_score=excluded.passing_score,
  requires_admin_review=excluded.requires_admin_review,academy_key='sales_assessment_prep',updated_at=now();

insert into public.training_track_modules(track_key,module_id,sort_order,required,passing_score_override,requires_review_override)
select 'sales_assessment_prep',m.id,x.sort_order,true,null,false
from (values
  ('assessment-prep-welcome',1),('assessment-prep-role-profox',2),('assessment-prep-lead-research-playbook',3),
  ('assessment-prep-sales-practical',4),('assessment-prep-objection-practice',5),('assessment-prep-lead-research-assessment',6),
  ('assessment-prep-crm-confidence',7),('assessment-prep-practice-lab',8),('assessment-prep-rules-check',9),('assessment-prep-final-readiness',10)
) as x(slug,sort_order)
join public.training_modules m on m.slug=x.slug
on conflict (track_key,module_id) do update set sort_order=excluded.sort_order,required=true,passing_score_override=null,requires_review_override=false;

delete from public.training_lessons
where module_id in (select id from public.training_modules where academy_key='sales_assessment_prep');

with lesson_data(module_slug,sort_order,title,content) as (
values
('assessment-prep-welcome',1,'Learn · How to use this Preparation Center',$c$# Welcome to the practical stage

You have progressed far enough in the ProFox recruitment process for us to assess how you think and work in realistic Sales situations.

This Preparation Center is designed to make the assessment clear before you begin. It is **not** the full ProFox Sales Academy and it does not give you live customer, production CRM or active Sales access.

Use each module in this rhythm:

**LEARN → SEE AN EXAMPLE → PRACTICE → CHECK YOURSELF**

You do not need to memorize scripts. We want you to understand the principles well enough to apply them naturally.

A prepared candidate should be able to:
- research a real business carefully;
- separate evidence from assumptions;
- ask useful discovery questions;
- listen and diagnose before recommending;
- handle a concern professionally;
- record accurate Sales information; and
- choose a clear next action.

Your goal is confidence through practice, not speed.$c$),
('assessment-prep-welcome',2,'Learn · Your three-step assessment journey',$c$# Your assessment journey

## Step 1 — Sales Practical Interview
You will demonstrate professional communication, discovery, listening, solution judgment, objection handling and next-step control.

## Step 2 — Lead Research Test
You will research and qualify **five businesses** using public information, evidence and clear reasoning.

## Step 3 — CRM Assessment
You will demonstrate that you can keep Sales information accurate, choose statuses based on evidence, write useful notes and create specific follow-up actions.

The live Preparation Center shows the **current scoring rubric and passing benchmark** from ProFox policy so you are not relying on an outdated copy.

The standard across all three steps is simple:

> **Think clearly. Verify carefully. Ask good questions. Record the truth. Take the next appropriate action.**$c$),
('assessment-prep-welcome',3,'Check · What good preparation feels like',$c$Before moving on, you should be able to explain in your own words:

1. Why the Preparation Center is different from the full Sales Academy.
2. What happens in each of the three assessment steps.
3. Why ProFox does not want memorized scripts or invented answers.
4. Why accuracy and judgment matter as much as confidence.

If any of those points are unclear, reread the first two lessons before continuing.$c$),

('assessment-prep-role-profox',1,'Learn · What the Sales role really looks like',$c$# A realistic view of the role

A ProFox Sales Representative does more than send cold messages.

The work includes:
- finding suitable businesses;
- researching before outreach;
- starting professional conversations;
- discovering genuine business needs;
- following up consistently;
- keeping CRM information accurate; and
- moving qualified opportunities toward the correct next step.

Some prospects will reply. Many will not. Some businesses will not be suitable. Rejection is normal in prospecting.

This is a remote, performance-focused and commission-based Sales opportunity. Activity by itself does not create commission; qualifying closed outcomes under the current ProFox commission policy do.

A strong representative is therefore comfortable with independent prospecting, video meetings, follow-up, CRM discipline, feedback and continuous improvement.

The current role posting, recruitment emails and—if you are selected—the signed agreement remain the source of truth for current commercial terms.$c$),
('assessment-prep-role-profox',2,'Learn · What ProFox helps businesses solve',$c$# Think in business problems, not product labels

## Website Design & Development
Potential signals can include poor mobile experience, confusing service information, weak enquiry journeys, conversion friction, difficult navigation or a website that no longer represents the business well.

## Custom Web Applications
Potential signals can include disconnected spreadsheets, repeated manual data entry, email-based approvals, fragmented reporting, portals or operational workflows that normal websites cannot solve.

## Email Marketing & Business Automation
Potential signals can include inconsistent lead follow-up, missed enquiries, repetitive reminders, disconnected tools, weak lifecycle communication or manual processes that should be investigated.

A visible signal is **not proof that a company needs a service**. It is a reason to investigate.

The most important rule is:

> **Do not decide the solution before understanding the problem.**$c$),
('assessment-prep-role-profox',3,'Example · Diagnose before recommending',$c$A roofing company receives many enquiries from Google. Its website looks several years old.

A weak conclusion is:

> “They need a new website.”

A stronger researcher asks:
- Does the website make services clear?
- Is the mobile enquiry path difficult?
- Is the website actually creating a business problem?
- What happens after an enquiry arrives?
- Could the bigger problem be follow-up rather than design?

The website may be old and still work very well. A modern-looking website may still convert poorly.

Your job is to identify **signals worth discussing**, then use discovery to validate what matters.$c$),
('assessment-prep-role-profox',4,'Practice · Turn a feature into a business question',$c$For each observation below, write one question you would ask before recommending anything.

1. The company has no chatbot.
2. The website has a generic contact form.
3. The company manages several service locations.
4. The mobile website is difficult to navigate.
5. The company appears to use several disconnected tools.

A useful question explores the business process or outcome. Avoid questions that assume a problem already exists.$c$),

('assessment-prep-lead-research-playbook',1,'Learn · The eight-step lead research workflow',$c$# TARGET → DISCOVER → VERIFY → QUALIFY → RESEARCH → DIAGNOSE → IDENTIFY → DOCUMENT

## 1. TARGET
Know the niche, geography and exclusions before searching.

## 2. DISCOVER
Find raw business candidates using legitimate public sources.

## 3. VERIFY
Confirm that the company is real, active and correctly identified.

## 4. QUALIFY
Check whether it actually fits the assigned niche, market and basic ProFox targeting rules.

## 5. RESEARCH
Understand what the business does, who it serves, where it operates and how customers interact with it.

## 6. DIAGNOSE
Identify a specific digital or operational signal worth investigating—without pretending you know the internal impact.

## 7. IDENTIFY
Find an appropriate likely decision-maker role using a public company or professional source.

## 8. DOCUMENT
Record evidence so another trained person can verify your reasoning.

A business name from a directory is a **raw candidate**, not automatically a qualified lead.$c$),
('assessment-prep-lead-research-playbook',2,'Learn · Discovery sources and the two-source principle',$c$# Useful public sources

Depending on the niche, legitimate discovery and verification sources may include:
- Google Maps and Google Search;
- the official company website;
- LinkedIn;
- public business Facebook or Instagram pages;
- Yelp or BBB where relevant;
- chambers of commerce;
- professional or trade associations;
- industry directories; and
- appropriate public business registries.

For local service businesses, Google Maps can be a useful starting point. Try combinations such as:

`roofing contractor Dallas Texas`

`commercial roofing Austin TX`

`HVAC contractor Miami Florida`

Then vary cities, suburbs, counties or service areas instead of repeatedly searching one broad location.

## Two-source principle

> **Discover on one source. Verify important facts on another.**

Examples:
- Google Maps + official website;
- LinkedIn + official website;
- industry directory + official website.

If identity information conflicts, research further. Never choose the version that is most convenient.$c$),
('assessment-prep-lead-research-playbook',3,'Learn · Fact, observation, hypothesis and unknown',$c$# Protect your research from assumptions

Use four mental labels.

## FACT
Directly supported by reliable evidence.

> “The website lists Dallas and Fort Worth as service areas.”

## OBSERVATION
Something you can directly see.

> “The mobile service page contains no prominent enquiry button.”

## HYPOTHESIS
A possible interpretation that still requires validation.

> “The mobile journey may be creating conversion friction.”

## UNKNOWN
Information you cannot determine from the evidence you have.

> “The company’s actual conversion rate is unknown.”

Professional researchers do not turn a hypothesis into a fact.

This habit protects your credibility in the Lead Research Test, in discovery calls and later in CRM notes.$c$),
('assessment-prep-lead-research-playbook',4,'Learn · Decision makers and service-fit judgment',$c$# Find a relevant person, not simply the highest title

Depending on company size and the problem being investigated, relevant roles may include:
- Owner or Founder;
- President or Managing Director;
- General Manager;
- Marketing Director or Head of Growth; or
- Operations Director.

For a small roofing company, the owner may be appropriate. For a larger company, Marketing or Operations may be more relevant.

Use a public professional or company source and keep the evidence URL.

## Connect evidence to possible service fit

Use this chain:

**OBSERVATION → BUSINESS IMPLICATION TO INVESTIGATE → POSSIBLE PROFOX CAPABILITY**

Example:

Observation: mobile service pages have an unclear enquiry path.

Possible implication: visitors may find it difficult to take the next step.

Possible fit: Website Design & Development.

Still unknown: whether this issue materially affects conversion.

Do not recommend every service. Good qualification includes knowing what **not** to sell.$c$),
('assessment-prep-lead-research-playbook',5,'Example · Complete fictional lead walkthrough',$c$# Fictional training example — do not copy into an assessment

**Business:** Blue Ridge Roofing & Exteriors  
**Location:** Austin, Texas  
**Niche:** Residential and commercial roofing

## Sources
- fictional Google Business Profile;
- fictional official website; and
- fictional LinkedIn company page.

## Verification
The website and business listing show consistent company identity and service area.

## Services
Roof replacement, roof repair, storm restoration and commercial roofing.

## Likely decision maker
Jordan Blake — Owner, supported by a fictional professional/company source.

## Observation
Several mobile service pages require visitors to return to the main Contact page before starting an enquiry.

## Hypothesis
Reducing friction between service research and estimate request may improve the enquiry journey.

## Unknown
Current traffic, enquiry volume and conversion rate.

## Possible ProFox fit
Website Design & Development.

## Why this lead may be worth a conversation
The business fits the fictional target niche and market, is treated as verified for this exercise, has a relevant decision-maker source, and contains a specific customer-journey signal worth validating.

## Correct next step
Use the research to create relevant outreach and validate the need—not to send a proposal or mark the business as a qualified opportunity.$c$),
('assessment-prep-lead-research-playbook',6,'Practice · 20-minute research sprint',$c$Set a timer for approximately 20 minutes and choose a **practice business that is not part of your real assessment submission**.

Try to document:
- business name;
- location and niche;
- two public sources;
- key services;
- likely decision maker and public source;
- one fact;
- one observation;
- one hypothesis;
- one important unknown;
- possible ProFox service fit; and
- why a professional conversation may be relevant.

Then ask:

> **Could another trained salesperson verify every important claim I made?**

If not, improve the evidence before moving on.$c$),
('assessment-prep-lead-research-playbook',7,'Check · Quick research judgment',$c$A company has no visible chatbot.

Which statement is strongest?

A. “They are losing customers because they do not have a chatbot.”  
B. “They need ProFox automation.”  
C. “No chatbot is visible. Whether conversational automation would create value requires discovery.”

**Best answer: C.**

Why? It describes the evidence without inventing business impact.

Now create two more examples of your own where you convert an assumption into a careful hypothesis.$c$),

('assessment-prep-sales-practical',1,'Learn · The eight-step conversation framework',$c$# PREPARE → OPEN → UNDERSTAND → DIAGNOSE → IMPACT → FUTURE → FIT → NEXT STEP

## PREPARE
Know basic facts about the business before speaking.

## OPEN
Create a professional, low-pressure beginning and explain the purpose of the conversation.

## UNDERSTAND
Learn how the business currently works.

## DIAGNOSE
Explore the reason behind the visible request or complaint.

## IMPACT
Understand what the problem changes for customers, the team or the business.

## FUTURE
Learn what a successful future state would look like.

## FIT
Connect a possible solution only after you understand enough evidence.

## NEXT STEP
End with an honest, specific and appropriate direction.

A discovery framework is a navigation system—not a questionnaire you read without listening.$c$),
('assessment-prep-sales-practical',2,'Example · From “we need a website” to real discovery',$c$Prospect:

> “We need a better website.”

Weak seller:

> “Great. We have a website package.”

Stronger seller:

> “What is making you feel the current website needs to change?”

Prospect:

> “We get traffic but not many serious enquiries.”

Useful follow-ups could include:
- “What happens when a visitor wants to request a quotation?”
- “Do you know where people tend to drop off?”
- “How are enquiries handled after they arrive?”
- “What would you want to be different if this worked properly?”

The visible request was “better website.” The real business issue may involve conversion, qualification, follow-up—or something else entirely.

The seller’s job is to discover that before prescribing.$c$),
('assessment-prep-sales-practical',3,'Learn · Listening, impact and summarizing',$c$# Listen for meaning, not your next memorized question

Prospect:

> “We receive plenty of enquiries, but many never turn into appointments.”

Weak response:

> “We provide websites and automation.”

Better response:

> “Where do you think those enquiries are being lost?”

If the prospect says staff sometimes respond the next day, useful follow-ups might explore enquiry volume, current response process and what tends to happen when response is slow.

Do not invent financial impact. Let the buyer describe what the problem changes.

Before recommending, summarize:

> “Let me make sure I have understood. You are generating enquiries, but response times vary because follow-up is manual, and some potential customers may not receive a timely response. You want a more consistent process. Is that accurate?”

A good summary proves that you listened and gives the buyer a chance to correct you.$c$),
('assessment-prep-sales-practical',4,'Learn · Fit and next-step control',$c$# Recommend only what the evidence supports

Suppose discovery shows the main problem is inconsistent lead follow-up.

A poor seller forces a website redesign because that was the original reason for the call.

A stronger seller may say:

> “Based on what you have described, the bigger opportunity may be the enquiry and follow-up process rather than the website alone. We would need to map the process in more detail before recommending anything specific.”

Then choose the next step appropriate to the evidence.

Possible next steps include:
- a deeper requirements conversation;
- involving another stakeholder;
- requesting information needed for diagnosis;
- a technical review; or
- concluding that there is not a good fit.

Not every call should end in a sale. Every good call should end in **clarity**.$c$),
('assessment-prep-sales-practical',5,'Practice · Five-minute role-play',$c$Ask a friend to play the owner of a service business. Give them only this prompt:

> “The company gets enquiries online but is unhappy with the results.”

Conduct a five-minute conversation.

Afterwards, score yourself with these questions:
- Did I understand the current situation?
- Did I investigate the root problem?
- Did I explore business impact without inventing it?
- Did I understand the desired outcome?
- Did I listen and follow the prospect’s answers?
- Did I avoid recommending too early?
- Did I end with a sensible next step?

Repeat the drill once. On the second attempt, focus on the weakest area from the first.$c$),

('assessment-prep-objection-practice',1,'Learn · The five-step objection framework',$c$# LISTEN → CLARIFY → ACKNOWLEDGE → RESPOND → CONFIRM

An objection is information, not an attack.

## LISTEN
Let the buyer finish.

## CLARIFY
Understand what the statement actually means.

## ACKNOWLEDGE
Show that you understand the concern without automatically agreeing with every conclusion.

## RESPOND
Address the confirmed issue truthfully and within your authority.

## CONFIRM
Check whether the concern is resolved or whether something remains unclear.

Do not argue, create fake urgency, invent proof, or promise unauthorized discounts or commercial terms.$c$),
('assessment-prep-objection-practice',2,'Example · Four common objections',$c$## “It is too expensive.”
Before defending price, clarify:

> “When you say the investment feels high, is the main concern the overall budget, or are you comparing it with another approach?”

## “I need to think about it.”

> “Of course. What part would be most useful to think through—the solution, timing, investment, or something else?”

## “Send me information.”

> “Happy to. To make sure I send something useful, which part of what we discussed would you most like to review?”

## “We already work with another agency.”

> “Understood. If you are getting the results you need, I would not suggest changing for the sake of it. Was there something specific that made you interested in this conversation?”

Notice the pattern: understand first, respond second.$c$),
('assessment-prep-objection-practice',3,'Practice · Objection repetition drill',$c$Answer these aloud, one at a time:

- “I do not have budget.”
- “We are too busy right now.”
- “Send me an email.”
- “Your price seems high.”
- “We already have a developer.”
- “I am not convinced this would produce results.”

Do not try to memorize six perfect responses.

For every objection, first ask yourself:

> **What might the prospect actually mean, and what question would help me understand?**

Repeat until your first instinct becomes curiosity rather than defensiveness.$c$),

('assessment-prep-lead-research-assessment',1,'Learn · What a strong five-business submission looks like',$c$# Strong research is evidence + reasoning

A strong candidate can explain:

> “I verified the company through appropriate public sources. It operates in the required niche and geography. I identified an appropriate likely decision maker through a public professional/company source. I found a specific digital or operational signal, separated what I observed from what still requires discovery, and explained why a ProFox capability may be relevant.”

A weak submission sounds like:

> “Found on Google. Bad website. They need ProFox.”

For each of your five businesses, the evaluator should be able to understand **why the business belongs in the submission and how your evidence supports the judgment**.

The live Preparation Center displays the current Lead Research scoring rubric and passing benchmark directly from ProFox recruitment policy.$c$),
('assessment-prep-lead-research-assessment',2,'Check · Five-business quality gate',$c$Before final submission, check every business:

- Correct assigned niche?
- Correct assigned market/geography?
- Reasonably verified operating business?
- No obvious duplicate within your own submission?
- Evidence URLs actually support the statements you made?
- Decision maker identified with a suitable public source?
- Digital problem/opportunity described specifically rather than as an insult?
- Facts separated from assumptions?
- Service-fit reasoning connected to the observed signal?
- Important unknowns left as unknowns rather than guessed?

If one business is weak, improve or replace that business before submitting. Five well-reasoned records are more valuable than five rushed records.$c$),

('assessment-prep-crm-confidence',1,'Learn · The CRM must tell the truth',$c$# CRM confidence without production access

The CRM Assessment is primarily about **Sales record discipline**, not memorizing every ProFox button.

Think of four basic concepts:

## Lead
A business/contact that may become a customer but is not automatically a qualified opportunity.

## Activity
Something that happened or needs to happen, such as research, outreach or follow-up.

## Meeting
A real scheduled conversation with a date/time and purpose.

## Opportunity
A genuine commercial pursuit that has passed the relevant qualification threshold.

The core rule is:

> **The CRM should tell the truth about what happened, what is true now, and what should happen next.**$c$),
('assessment-prep-crm-confidence',2,'Learn · Duplicates, notes, status and next actions',$c$# Search before creating

Before creating a new lead, search by useful identifiers such as company name, domain, email, phone or other strong identifiers. Duplicate records split history and create confusion.

# Write notes another person can use

Weak:

> “Good lead.”

Better:

> “Owner replied to initial outreach and requested information about improving online enquiries. No budget or timeline discussed. Send relevant case study today; follow up Friday.”

# Status follows evidence, not optimism

Sending an introductory email does not make a lead Qualified.

A prospect saying “send me information” does not mean Meeting Scheduled.

# Every open conversation needs a specific next action

Weak:

> “Follow up later.”

Better:

> “Send roofing case study today. Follow up Friday at 10:00 AM local time.”$c$),
('assessment-prep-crm-confidence',3,'Example · Fictional Westlake HVAC scenario',$c$# Fictional CRM practice

You research **Westlake HVAC** using a fictional website and professional source.

You email the Operations Director.

She replies:

> “Thanks. We are reviewing our website and follow-up process this quarter. Send me some examples and contact me again next Tuesday.”

## What should your record show?
- verified company/contact information from the scenario;
- the outreach activity that actually occurred;
- a concise factual note;
- a status supported by the event—not an inflated stage;
- an action to send relevant examples; and
- a follow-up scheduled for Tuesday.

## What should it NOT show?
- Proposal Sent;
- Won;
- invented budget;
- invented timeline beyond “this quarter”; or
- a meeting that was never scheduled.

Accuracy is part of your assessment.$c$),
('assessment-prep-crm-confidence',4,'Practice · Write the record',$c$Using the Westlake HVAC scenario, write three things in your own words:

1. A factual CRM note in 2–4 sentences.
2. The next activity and due timing.
3. One status you would **not** use yet and why.

Then check your answer:

> Does it clearly separate what actually happened from what I hope will happen?$c$),

('assessment-prep-practice-lab',1,'Practice · Evergreen Home Services case',$c$# Integrated fictional case

**Evergreen Home Services**  
Location: Colorado, USA  
Services: Roofing, HVAC and Plumbing  
Team: approximately 45 people

Public scenario observations:
- the fictional website lists three service divisions;
- several location pages exist;
- customers can submit a web form; and
- recent fictional reviews indicate active operations.

You cannot determine from public information how enquiries are routed among departments.

## Challenge A — Research
Write:
- what you can confidently state as fact;
- what you directly observe;
- one reasonable hypothesis;
- what remains unknown;
- an appropriate decision-maker role to research; and
- which public source types you would use.

## Challenge B — Outreach relevance
In one sentence, explain why a professional conversation **might** be worth having without claiming the business already needs ProFox.$c$),
('assessment-prep-practice-lab',2,'Practice · Discovery, solution judgment and CRM',$c$Continue the fictional Evergreen case.

The prospect tells you:

> “We do not have a problem getting enquiries. The issue is that our different teams do not always know who should handle them.”

## Discovery challenge
What would you investigate about:
- current routing process;
- ownership;
- response time;
- missed enquiries;
- current systems;
- business impact; and
- desired future process?

## Solution challenge
Would you immediately recommend a website redesign, automation, a custom application, or all three?

**Correct mindset:** you do not yet have enough information. The statement suggests an operational lead-routing problem. Discovery must determine whether configuration, automation, integration, process change or custom development is appropriate.

## CRM challenge
The prospect later agrees to a requirements meeting next Wednesday. Record only what is now true: meeting details, context, participants if confirmed, purpose and next preparation action. Do not create a quotation before the commercial process reaches that stage.$c$),

('assessment-prep-rules-check',1,'Learn · Assessment ethics and data boundaries',$c$# Professional assessment rules

You may:
- use legitimate public business research;
- take personal study notes;
- practise with fictional examples;
- use these preparation resources; and
- ask Recruitment for clarification when instructions are genuinely unclear.

You must not:
- fabricate evidence;
- present assumptions as facts;
- copy another candidate’s work;
- create duplicate ProFox candidate or Sales accounts;
- use real ProFox customer information in practice unless explicitly authorized;
- collect unnecessary private personal information;
- use fake identities to obtain information;
- use unauthorized scraping or bypass platform access controls;
- manipulate assessment records; or
- invent ProFox capabilities, results, discounts, deadlines or commercial authority.

If you do not know an answer, professional judgment is:

> “I would need to confirm that before giving the customer an answer.”

Then verify it.$c$),
('assessment-prep-rules-check',2,'Check · Mini knowledge check',$c$Try to answer before reading the explanation.

## 1. You find a business on Google Maps. Is it automatically a qualified lead?
**No.** It is a raw business candidate until verified and reasonably qualified.

## 2. You see no chatbot. Can you claim the business is losing revenue because of it?
**No.** That would be an unsupported assumption.

## 3. A prospect says “Your service is too expensive.” What should you normally do first?
**Understand what “expensive” means in their situation.**

## 4. A prospect requests information. Does the CRM automatically become Qualified?
**No.** Status follows actual evidence.

## 5. You do not know the answer to a technical question. What should you do?
Say that you want to confirm it accurately, then verify internally rather than inventing an answer.

## 6. A researched business turns out to be a poor fit. Should you submit it because you already spent time on it?
**No.** Rejecting a weak lead demonstrates better judgment than protecting sunk effort.$c$),

('assessment-prep-final-readiness',1,'Check · Lead research readiness',$c$Before the Lead Research Test, you should be able to say yes to these:

- I can take a niche and geographic target and find relevant businesses.
- I know a directory listing is not automatically a qualified lead.
- I can verify important business facts using appropriate public sources.
- I understand the two-source principle.
- I can separate fact, observation, hypothesis and unknown.
- I can identify an appropriate likely decision-maker role and evidence source.
- I can describe a specific potential digital opportunity without insulting the business.
- I can explain why a ProFox service may be relevant without pretending certainty.
- I can document evidence so another person can verify it.$c$),
('assessment-prep-final-readiness',2,'Check · Sales conversation and CRM readiness',$c$# Sales conversation

- I can start a professional conversation without a long pitch.
- I can ask open discovery questions.
- I can investigate a root problem rather than accept the first visible request.
- I can explore impact without inventing numbers.
- I can listen and summarize what I heard.
- I can handle an objection without becoming defensive.
- I can recommend only what the evidence supports.
- I can establish a clear next step.

# CRM

- I understand why duplicate checks matter.
- I understand Lead, Activity, Meeting and Opportunity at a basic level.
- I can write concise factual notes.
- I can choose status based on real events rather than optimism.
- I can create a specific next activity with timing.
- I understand that production customer data is protected.$c$),
('assessment-prep-final-readiness',3,'Practice · Final end-to-end confidence drill',$c$Choose one **practice business that is not part of your live assessment submission** and complete this chain:

# FIND → VERIFY → RESEARCH → QUALIFY → IDENTIFY OPPORTUNITY → FIND DECISION MAKER → PLAN DISCOVERY → HANDLE ONE OBJECTION → CHOOSE NEXT STEP → WRITE CRM NOTE

For each step, explain **why** you made the decision.

If you can explain your reasoning clearly without guessing, you are much better prepared for the ProFox Sales Assessment.

One final reminder:

A candidate who says “I do not know that yet, but here is how I would verify it” can demonstrate better judgment than someone who confidently invents an answer.

A candidate who rejects an unsuitable lead can demonstrate more qualification skill than someone who submits weak businesses.

A candidate who records “No decision yet—follow up Friday” can demonstrate better CRM discipline than someone who prematurely marks progress.

> **Think clearly. Verify carefully. Ask good questions. Record the truth. Take the next appropriate action.**$c$),
('assessment-prep-final-readiness',4,'Learn · What happens after the assessment',$c$If you successfully complete the required assessment stages, ProFox reviews the overall selection evidence.

The assessment itself is not an employment offer and does not grant active Sales authorization.

Candidates who are selected proceed through the controlled Sales Partner Agreement process.

Only after the required agreement is signed and verified does an eligible candidate receive protected access to the full **ProFox Sales Academy**.

The full Academy contains deeper training in product/package knowledge, niche selling, outreach, meetings, discovery, call practice, presentation, objections, closing, quotations, payments, CRM operations, calendar management, confidentiality and final certification.

Live customer/production Sales access remains protected until the required Academy, approval and activation gates are complete.$c$)
)
insert into public.training_lessons(module_id,title,content,sort_order,active,niche_slug,updated_at)
select m.id,d.title,d.content,d.sort_order,true,'',now()
from lesson_data d join public.training_modules m on m.slug=d.module_slug;

update public.recruitment_task_templates
set title='ProFox Sales Assessment Preparation Center',
    description='A practical, secure preparation center that helps shortlisted Sales candidates understand, practise and self-check the skills used in the ProFox Sales Practical Interview, Lead Research Test and CRM Assessment.',
    estimated_minutes=150,
    instructions=jsonb_build_array(
      'Use the Preparation Center in this order: Learn, review the worked example, complete the practice activity, then check yourself.',
      'Practise with fictional or non-assessment examples. Do not copy training examples into your live assessment submission.',
      'Your separate interview and task emails remain the source of truth for live assessment dates, links, deadlines and submission actions.',
      'Use only legitimate public business information for lead research and clearly separate facts, observations, hypotheses and unknowns.',
      'This Preparation Center does not grant live Sales, customer or production CRM access.',
      'The full ProFox Sales Academy remains protected until selection and verification of the signed Sales Partner Agreement.'
    ),
    version=greatest(coalesce(version,1),2),updated_at=now()
where task_key='sales_assessment_hub' and system_role='sales' and stage='Shortlisted' and active=true;

update public.recruitment_task_instances
set template_snapshot=jsonb_set(
      jsonb_set(jsonb_set(template_snapshot,'{title}',to_jsonb('ProFox Sales Assessment Preparation Center'::text),true),
        '{description}',to_jsonb('A practical, secure preparation center for the ProFox Sales Practical Interview, Lead Research Test and CRM Assessment.'::text),true),
      '{estimatedMinutes}',to_jsonb(150),true),
    updated_at=now()
where coalesce(template_snapshot->>'taskKey','')='sales_assessment_hub';
