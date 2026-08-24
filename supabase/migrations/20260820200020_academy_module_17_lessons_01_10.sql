-- Module 17 lessons 01–10 — CRM foundations, records and activity discipline

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='crm-training';
  if v_module is null then raise exception 'Module 17 crm-training is missing.'; end if;
  delete from public.training_lessons where module_id=v_module;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'The CRM Is the Operational Source of Truth',$md$
## Objective
Understand why the ProFox CRM is the shared operating record for Sales.

## Operating rule
**If a meaningful sales event is not recorded accurately in the CRM, the rest of the business cannot safely rely on it.**

The CRM connects lead research, outreach, follow-up, meetings, opportunities, quotations, payment state, handoff and reporting. It is not a private notebook and it is not a place to make the pipeline look healthier than reality.

### Correct behaviour
Record what happened, what is known, what is still unknown, who owns the next action and when that action is due.

### Mistakes to avoid
- keeping important facts only in WhatsApp, email or memory;
- changing a stage because it “looks better”;
- copying assumptions into factual fields;
- leaving next steps vague;
- recording activity that never happened.

### Practice prompt
Explain how one inaccurate CRM field could affect another salesperson, Management, Finance and Delivery.

**Standard:** the CRM must tell the truth even when the truth is “not yet known.”
$md$,1,true),

  (v_module,'Know the Record Types',$md$
## Objective
Know what belongs on a Lead, Activity, Opportunity and Meeting record.

## Operating rule
**Use the correct record for the correct fact.**

- **Lead:** an identified prospect before a qualified opportunity exists.
- **Activity:** a dated action such as research, outreach, follow-up or call.
- **Opportunity:** a qualified commercial pursuit with an active sales process.
- **Meeting:** a scheduled conversation with its own timing, attendees, outcome and next step.

Do not turn every name into an opportunity. Do not bury follow-up actions inside free-text notes when an activity should carry a due date.

### Example
A roofing company fits the niche but has not replied. It remains a lead. Your cold email is an Activity. If discovery confirms a real problem, buying path and fit, it can become an Opportunity.

### Practice prompt
Classify five events from your last training scenarios as Lead, Activity, Opportunity or Meeting information.
$md$,2,true),

  (v_module,'Create a Complete Lead Record',$md$
## Objective
Create a lead that another trained seller can understand without asking you for basic context.

## Operating rule
**Capture enough verified identity and sales context to support the next action.**

Useful lead fields include company, contact, email/phone when known, website, country, industry, source, service interest, status and concise notes. Do not invent missing details just to make the record look complete.

### Data-quality standard
- use the real company spelling;
- use a business email when available;
- distinguish source from channel;
- record country accurately because timezone and market context matter;
- keep service interest grounded in evidence;
- mark self-generated truthfully.

### Mistakes to avoid
Creating duplicates, using placeholder emails as facts, or claiming “Premium Website” because that package pays more commission.

### Practice prompt
What information would you verify before creating a new lead from a company website and LinkedIn profile?
$md$,3,true),

  (v_module,'Search Before You Create',$md$
## Objective
Prevent duplicate records and split history.

## Operating rule
**Search first. Create second.**

Before creating a lead, check the CRM for the company, domain, contact email and other strong identifiers. A duplicate can split activities, distort reporting, cause two salespeople to contact the same prospect and create a poor customer experience.

If a possible duplicate exists, compare the records. Update or escalate instead of blindly creating another one.

### Example
You find “Northstar Roofing LLC” and plan to create “North Star Roofing.” The website domain and contact email match. Treat that as a duplicate candidate and resolve it before creating anything.

### Practice prompt
Write the four identifiers you would use to check whether a prospect already exists.

**Standard:** clean data begins before the first insert.
$md$,4,true),

  (v_module,'Separate Facts, Inferences and Unknowns',$md$
## Objective
Write CRM notes that are trustworthy.

## Operating rule
**Never turn an assumption into a fact.**

A useful note can distinguish:
- **Fact:** “Website footer shows last redesign in 2019.”
- **Buyer statement:** “Owner said enquiries are inconsistent.”
- **Inference:** “The current journey may be leaking mobile visitors.”
- **Unknown:** “Budget and final decision-maker not yet confirmed.”

This protects later sellers from repeating assumptions as customer commitments.

### Mistakes to avoid
- “They need Premium” before discovery;
- “Decision maker is John” because John replied first;
- “Budget approved” because pricing was requested;
- copying AI-generated research without checking the source.

### Practice prompt
Rewrite this note accurately: “They definitely need a new app and have budget.” Assume the only evidence is that the prospect asked whether ProFox builds apps.
$md$,5,true),

  (v_module,'Use Lead Status as Evidence, Not Mood',$md$
## Objective
Choose the lead status that matches reality.

## Operating rule
**Status follows an observable event or qualified judgment.**

ProFox lead statuses are: New, Researching, Contacted, Follow-Up, Interested, Qualified and Not Qualified.

Examples:
- research has started → **Researching**;
- first real outreach sent → **Contacted**;
- another action is due → **Follow-Up**;
- buyer shows genuine relevant interest → **Interested**;
- qualification standard is met → **Qualified**;
- prospect clearly fails qualification → **Not Qualified**.

Do not mark “Interested” because an email was opened. Do not mark “Qualified” just because the company looks large.

### Practice prompt
For three prospects, state the evidence that would justify moving each one to the next status.
$md$,6,true),

  (v_module,'Activities Are Commitments With Dates',$md$
## Objective
Use CRM activities to make follow-up executable.

## Operating rule
**A future action belongs in an activity with an owner and due time.**

Activity types include Lead Research, Cold Call, Cold Email, LinkedIn / Social Outreach, Loom Outreach, Follow-Up, Discovery Meeting, Meeting Follow-Up, Quotation Follow-Up, Payment Follow-Up and Other.

A useful activity answers:
**What? → For whom? → By whom? → When? → Through which channel? → What context matters?**

### Mistakes to avoid
- writing “follow up later” only in Notes;
- setting every activity due today to make the dashboard look busy;
- marking an activity Completed before doing it;
- creating duplicate follow-ups for the same action.

### Practice prompt
Turn “check back with Sarah next week after her partner reviews the proposal” into a precise CRM activity.
$md$,7,true),

  (v_module,'Log Outreach Truthfully',$md$
## Objective
Create a usable history of customer contact.

## Operating rule
**Log the outreach that actually occurred, using the real channel and useful context.**

For cold outreach, capture the activity type, subject/purpose, channel, time and concise note. If a Loom video was actually sent, record the approved URL. If no Loom was sent, do not add one to make the record appear stronger.

Avoid pasting sensitive credentials or unnecessary personal data into notes.

### Example
Good note: “Sent personalized email referencing mobile quote friction; CTA asked whether improving online enquiries is a Q3 priority.”

Weak note: “Emailed them.”

False note: “Great call, very interested” when no call occurred.

### Practice prompt
Write a two-sentence activity note that lets another seller understand what was sent and what response you are waiting for.
$md$,8,true),

  (v_module,'Every Open Conversation Needs a Next Step',$md$
## Objective
Prevent promising opportunities from becoming forgotten records.

## Operating rule
**When the sales conversation remains open, record the next action and timing.**

A good next step is specific and mutual where possible. “Follow up next week” is weak. “Send requested case study Tuesday; buyer reviews with co-founder Wednesday; call Thursday at 3 PM” is operational.

If there is no legitimate next step because the buyer said no, do not manufacture one. Close or nurture according to reality.

### Practice prompt
Improve these next steps:
1. “Check later.”
2. “Send proposal.”
3. “Wait for them.”

**Standard:** pipeline momentum comes from agreed actions, not optimistic stages.
$md$,9,true),

  (v_module,'Phase Checkpoint — Clean Lead and Activity Data',$md$
## Objective
Confirm that you can create a safe, useful early-stage CRM record.

## Readiness check
Before advancing from this phase, you should be able to:
- search for duplicates;
- create a complete synthetic lead;
- distinguish facts from assumptions;
- choose the correct lead status;
- record research and outreach;
- schedule an owned follow-up;
- keep sensitive or unsupported data out of notes.

### Scenario
You researched a company, sent a personalized cold email and received no reply. The correct CRM story is not “Interested.” It is a researched/contacted lead with a truthful outreach activity and, if appropriate under the outreach cadence, a scheduled follow-up.

### Practice prompt
Describe the minimum CRM trail another salesperson should see after your first outreach to a new prospect.

**Phase standard:** another trained teammate should understand exactly what happened and what happens next.
$md$,10,true);
end $$;
