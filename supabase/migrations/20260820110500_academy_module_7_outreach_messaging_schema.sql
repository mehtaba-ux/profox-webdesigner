-- Sales Academy Module 7 — Outreach Messages & Follow-Up
-- Research-backed, Admin-editable, one-time onboarding certification.

CREATE TABLE IF NOT EXISTS public.outreach_messaging_training_config (
  module_id uuid PRIMARY KEY REFERENCES public.training_modules(id) ON DELETE CASCADE,
  accepted_message_min_words integer NOT NULL DEFAULT 40 CHECK (accepted_message_min_words BETWEEN 10 AND 120),
  target_message_min_words integer NOT NULL DEFAULT 40 CHECK (target_message_min_words BETWEEN 10 AND 150),
  target_message_max_words integer NOT NULL DEFAULT 90 CHECK (target_message_max_words BETWEEN 20 AND 180),
  accepted_message_max_words integer NOT NULL DEFAULT 100 CHECK (accepted_message_max_words BETWEEN 30 AND 200),
  subject_min_words integer NOT NULL DEFAULT 1 CHECK (subject_min_words BETWEEN 1 AND 10),
  subject_max_words integer NOT NULL DEFAULT 4 CHECK (subject_max_words BETWEEN 1 AND 15),
  approval_scope text NOT NULL DEFAULT 'onboarding_only' CHECK (approval_scope='onboarding_only'),
  channel_options jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(channel_options)='array'),
  default_cadence jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(default_cadence)='array'),
  required_reply_scenarios jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(required_reply_scenarios)='array'),
  rubric jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(rubric)='array'),
  critical_failures jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(critical_failures)='array'),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (accepted_message_min_words <= target_message_min_words),
  CHECK (target_message_min_words <= target_message_max_words),
  CHECK (target_message_max_words <= accepted_message_max_words),
  CHECK (subject_min_words <= subject_max_words)
);

CREATE TABLE IF NOT EXISTS public.outreach_messaging_training_state (
  progress_id uuid PRIMARY KEY REFERENCES public.user_training_progress(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.training_modules(id) ON DELETE CASCADE,
  lessons_completed integer NOT NULL DEFAULT 0 CHECK (lessons_completed >= 0),
  draft_data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(draft_data)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,module_id)
);

CREATE TABLE IF NOT EXISTS public.outreach_messaging_review_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progress_id uuid NOT NULL REFERENCES public.user_training_progress(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.training_assignments(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  rubric_scores jsonb NOT NULL CHECK (jsonb_typeof(rubric_scores)='object'),
  total_score integer NOT NULL CHECK (total_score BETWEEN 0 AND 100),
  critical_failures jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(critical_failures)='array'),
  status text NOT NULL CHECK (status IN ('Passed','Retry Required')),
  feedback text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.outreach_message_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.training_modules(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL,
  category text NOT NULL,
  channel text NOT NULL,
  niche_slug text,
  market_code text NOT NULL DEFAULT 'GLOBAL',
  subject_template text,
  body_template text NOT NULL,
  coaching_note text NOT NULL DEFAULT '',
  variables jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(variables)='array'),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(module_id,code),
  CHECK (length(trim(code))>0),
  CHECK (length(trim(title))>0),
  CHECK (length(trim(category))>0),
  CHECK (length(trim(channel))>0),
  CHECK (length(trim(body_template))>0)
);

CREATE TABLE IF NOT EXISTS public.outreach_compliance_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.training_modules(id) ON DELETE CASCADE,
  market_code text NOT NULL,
  market_label text NOT NULL,
  channel text NOT NULL,
  status text NOT NULL CHECK (status IN ('allowed_with_rules','admin_review_required','do_not_send')),
  summary text NOT NULL,
  rules jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(rules)='array'),
  reference_urls jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(reference_urls)='array'),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(module_id,market_code,channel)
);

CREATE INDEX IF NOT EXISTS idx_outreach_config_updated_by ON public.outreach_messaging_training_config(updated_by);
CREATE INDEX IF NOT EXISTS idx_outreach_state_user_module ON public.outreach_messaging_training_state(user_id,module_id);
CREATE INDEX IF NOT EXISTS idx_outreach_state_module ON public.outreach_messaging_training_state(module_id);
CREATE INDEX IF NOT EXISTS idx_outreach_review_progress_created ON public.outreach_messaging_review_details(progress_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_review_assignment ON public.outreach_messaging_review_details(assignment_id);
CREATE INDEX IF NOT EXISTS idx_outreach_review_reviewer ON public.outreach_messaging_review_details(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_outreach_playbooks_module_active ON public.outreach_message_playbooks(module_id,active,sort_order);
CREATE INDEX IF NOT EXISTS idx_outreach_playbooks_updated_by ON public.outreach_message_playbooks(updated_by);
CREATE INDEX IF NOT EXISTS idx_outreach_compliance_module_active ON public.outreach_compliance_presets(module_id,active,sort_order);
CREATE INDEX IF NOT EXISTS idx_outreach_compliance_updated_by ON public.outreach_compliance_presets(updated_by);

ALTER TABLE public.outreach_messaging_training_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_messaging_training_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_messaging_review_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_message_playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_compliance_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outreach_config_select ON public.outreach_messaging_training_config;
CREATE POLICY outreach_config_select ON public.outreach_messaging_training_config FOR SELECT TO authenticated
USING (public.is_admin() OR public.can_access_sales_academy_module(module_id));
DROP POLICY IF EXISTS outreach_config_admin_insert ON public.outreach_messaging_training_config;
CREATE POLICY outreach_config_admin_insert ON public.outreach_messaging_training_config FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS outreach_config_admin_update ON public.outreach_messaging_training_config;
CREATE POLICY outreach_config_admin_update ON public.outreach_messaging_training_config FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS outreach_config_admin_delete ON public.outreach_messaging_training_config;
CREATE POLICY outreach_config_admin_delete ON public.outreach_messaging_training_config FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS outreach_state_select ON public.outreach_messaging_training_state;
CREATE POLICY outreach_state_select ON public.outreach_messaging_training_state FOR SELECT TO authenticated
USING (public.is_admin() OR user_id=(SELECT auth.uid()));

DROP POLICY IF EXISTS outreach_review_select ON public.outreach_messaging_review_details;
CREATE POLICY outreach_review_select ON public.outreach_messaging_review_details FOR SELECT TO authenticated
USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.user_training_progress p WHERE p.id=outreach_messaging_review_details.progress_id AND p.user_id=(SELECT auth.uid())));
DROP POLICY IF EXISTS outreach_review_admin_insert ON public.outreach_messaging_review_details;
CREATE POLICY outreach_review_admin_insert ON public.outreach_messaging_review_details FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS outreach_review_admin_update ON public.outreach_messaging_review_details;
CREATE POLICY outreach_review_admin_update ON public.outreach_messaging_review_details FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS outreach_review_admin_delete ON public.outreach_messaging_review_details;
CREATE POLICY outreach_review_admin_delete ON public.outreach_messaging_review_details FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS outreach_playbooks_select ON public.outreach_message_playbooks;
CREATE POLICY outreach_playbooks_select ON public.outreach_message_playbooks FOR SELECT TO authenticated
USING (public.is_admin() OR (active=true AND public.can_access_sales_academy_module(module_id)));
DROP POLICY IF EXISTS outreach_playbooks_admin_insert ON public.outreach_message_playbooks;
CREATE POLICY outreach_playbooks_admin_insert ON public.outreach_message_playbooks FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS outreach_playbooks_admin_update ON public.outreach_message_playbooks;
CREATE POLICY outreach_playbooks_admin_update ON public.outreach_message_playbooks FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS outreach_playbooks_admin_delete ON public.outreach_message_playbooks;
CREATE POLICY outreach_playbooks_admin_delete ON public.outreach_message_playbooks FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS outreach_compliance_select ON public.outreach_compliance_presets;
CREATE POLICY outreach_compliance_select ON public.outreach_compliance_presets FOR SELECT TO authenticated
USING (public.is_admin() OR (active=true AND public.can_access_sales_academy_module(module_id)));
DROP POLICY IF EXISTS outreach_compliance_admin_insert ON public.outreach_compliance_presets;
CREATE POLICY outreach_compliance_admin_insert ON public.outreach_compliance_presets FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS outreach_compliance_admin_update ON public.outreach_compliance_presets;
CREATE POLICY outreach_compliance_admin_update ON public.outreach_compliance_presets FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS outreach_compliance_admin_delete ON public.outreach_compliance_presets;
CREATE POLICY outreach_compliance_admin_delete ON public.outreach_compliance_presets FOR DELETE TO authenticated USING (public.is_admin());

UPDATE public.training_modules
SET title='Outreach Messages & Follow-Up',
    description='Turn verified prospect research into short, relevant multi-channel outreach and purposeful follow-up. Complete one practical messaging certification during onboarding; after certification, normal outreach does not require per-message Admin approval.',
    module_type='assignment', required=true, active=true, passing_score=80, requires_admin_review=true, updated_at=now()
WHERE slug='outreach-cadence';

INSERT INTO public.outreach_messaging_training_config(
  module_id,accepted_message_min_words,target_message_min_words,target_message_max_words,accepted_message_max_words,
  subject_min_words,subject_max_words,approval_scope,channel_options,default_cadence,required_reply_scenarios,rubric,critical_failures,updated_at
)
SELECT m.id,40,40,90,100,1,4,'onboarding_only',
'["Email","LinkedIn","Loom","Phone — only when Admin-approved","Other Admin-approved channel"]'::jsonb,
'[
 {"day":1,"channel":"Email","label":"Personalized first outreach","purpose":"Signal → Observation → Relevance → Value → Invitation"},
 {"day":2,"channel":"LinkedIn","label":"View / connect where appropriate","purpose":"Human presence without repeating the email pitch"},
 {"day":4,"channel":"Email","label":"One-line bump","purpose":"Resurface the original value with almost no friction"},
 {"day":7,"channel":"Email","label":"New observation / insight","purpose":"Add a genuinely new reason to respond"},
 {"day":10,"channel":"LinkedIn or approved alternate channel","label":"Channel change","purpose":"Reach the prospect where appropriate without spamming"},
 {"day":13,"channel":"Loom or useful asset","label":"High-value follow-up","purpose":"Show the idea visually or deliver a useful asset"},
 {"day":17,"channel":"Email","label":"New value / approved proof","purpose":"Add relevant value or verified proof — never invent evidence"},
 {"day":22,"channel":"Email","label":"Close the loop","purpose":"Stop respectfully and leave the door open"}
]'::jsonb,
'[
 {"key":"interested","label":"Interested / yes"},
 {"key":"send_information","label":"Send me more information"},
 {"key":"not_now","label":"Not now"},
 {"key":"wrong_person","label":"Wrong person"},
 {"key":"already_agency","label":"We already have an agency / provider"},
 {"key":"not_interested","label":"Not interested"},
 {"key":"unsubscribe","label":"Remove me / unsubscribe"}
]'::jsonb,
'[
 {"key":"research_continuity","label":"Research continuity & accuracy","max":10},
 {"key":"personalization","label":"Business-relevant personalization quality","max":15},
 {"key":"first_outreach","label":"First outreach message quality","max":15},
 {"key":"followup_quality","label":"Follow-up quality & progression","max":15},
 {"key":"value_relevance","label":"Value and business relevance","max":10},
 {"key":"cta_quality","label":"Low-friction CTA quality","max":10},
 {"key":"channel_adaptation","label":"Channel adaptation","max":10},
 {"key":"cadence_strategy","label":"Cadence strategy","max":5},
 {"key":"reply_handling","label":"Reply handling","max":5},
 {"key":"trust_compliance","label":"Trust, compliance & CRM discipline","max":5}
]'::jsonb,
'[
 {"key":"fabricated_fact","label":"Fabricated prospect, company, contact, research fact, or observation"},
 {"key":"invented_financial_impact","label":"Invented revenue loss, conversion rate, lead volume, ROI, or other financial impact"},
 {"key":"wrong_business_person","label":"Knowingly targeted the wrong business or materially wrong person"},
 {"key":"fake_proof","label":"Used fake client proof, testimonial, metric, case study, or outcome"},
 {"key":"guaranteed_results","label":"Guaranteed business, revenue, conversion, SEO, ranking, or other results"},
 {"key":"unauthorized_commitment","label":"Made an unauthorized price, scope, timeline, legal, security, delivery, discount, or free-work commitment"},
 {"key":"deceptive_threading","label":"Used deceptive Re: / Fwd: or falsely implied an existing conversation"},
 {"key":"prohibited_outreach","label":"Knowingly used a prohibited country/channel method or bypassed an Admin restriction"},
 {"key":"ignored_opt_out","label":"Ignored or attempted to bypass an unsubscribe / stop request"},
 {"key":"harassment","label":"Used harassment, guilt, pressure, repeated unwanted contact, or manipulative breakup messaging"},
 {"key":"disrespect","label":"Insulted the prospect, their team, existing supplier, or competitor"},
 {"key":"privacy_breach","label":"Exposed or stored irrelevant private, sensitive, or confidential information"},
 {"key":"fake_urgency","label":"Created false scarcity, fake urgency, or misleading deadline pressure"},
 {"key":"fake_personalization","label":"Presented mass-generated outreach as individually researched when it was not"},
 {"key":"compliance_bypass","label":"Bypassed an approved market/channel compliance requirement"}
]'::jsonb,now()
FROM public.training_modules m WHERE m.slug='outreach-cadence'
ON CONFLICT(module_id) DO UPDATE SET
  accepted_message_min_words=EXCLUDED.accepted_message_min_words,
  target_message_min_words=EXCLUDED.target_message_min_words,
  target_message_max_words=EXCLUDED.target_message_max_words,
  accepted_message_max_words=EXCLUDED.accepted_message_max_words,
  subject_min_words=EXCLUDED.subject_min_words,
  subject_max_words=EXCLUDED.subject_max_words,
  approval_scope='onboarding_only',channel_options=EXCLUDED.channel_options,default_cadence=EXCLUDED.default_cadence,
  required_reply_scenarios=EXCLUDED.required_reply_scenarios,rubric=EXCLUDED.rubric,critical_failures=EXCLUDED.critical_failures,updated_at=now();

DELETE FROM public.training_lessons WHERE module_id=(SELECT id FROM public.training_modules WHERE slug='outreach-cadence' LIMIT 1);

INSERT INTO public.training_lessons(module_id,title,content,video_url,sort_order,active,updated_at)
SELECT m.id,v.title,v.content,'',v.ord,true,now()
FROM public.training_modules m
CROSS JOIN (VALUES
(1,'Phase 1 · Outreach Thinking — The First Message Has One Job',$md$# Earn attention. Create relevance. Start the conversation.
The first cold message does **not** need to explain ProFox, present every service, discuss pricing, prove everything, or force a meeting.
Its job is smaller:
- earn attention;
- create business relevance;
- make the prospect curious enough to reply, watch the Loom, or accept a useful next step.

Think:
**Cold prospect → Attention → Interest → Response**

Not:
**Cold prospect → Full presentation → Proposal → Sale**

> **Do not sell the whole service. Sell the next conversation.**

Core ProFox principle: **Relevant. Useful. Human.**$md$),
(2,'Phase 1 · Outreach Thinking — Research Before Templates',$md$# Never start by opening a template
Module 7 begins where Module 5 and Module 6 end.
Before writing, answer four questions:
1. **Why this company?** Why is this business worth contacting?
2. **Why now?** What visible signal, trigger, issue, opportunity, or change makes the outreach relevant?
3. **Why this person?** Why is this stakeholder likely relevant?
4. **Why this message?** What useful observation can you share?

If you cannot answer all four, do more research.

A template is only a structure. **Research is what makes the message belong to this prospect.**

Never insert a company name into a generic pitch and call it personalization.$md$),
(3,'Phase 1 · Outreach Thinking — Four Levels of Personalization',$md$# Personalization must be business-relevant
**Level 1 — Fake personalization**
> Hi John, I saw your website.

**Level 2 — Surface personalization**
> Hi John, saw that you run ABC Roofing in Denver.

**Level 3 — Business personalization**
> John — noticed your roof-replacement page answers homeowner questions well, but the estimate action becomes much harder to find deeper in the page.

**Level 4 — Trigger + business personalization**
> John — saw ABC Roofing recently expanded into Colorado Springs. I noticed the new service-area pages still route visitors through the same general estimate journey as Denver.

Aim for **Level 3 or Level 4** whenever the research supports it.

Useful signals include customer-journey friction, new locations, new services, hiring, expansion, booking/quote workflows, public announcements, technology/process signals, or recent business activity.

Do not use irrelevant personal trivia simply to prove you searched the person.$md$),
(4,'Phase 2 · First Message — SIGNAL → OBSERVATION → RELEVANCE → VALUE → INVITATION',$md$# The ProFox outreach framework
Use this structure until it becomes automatic.

### 1. SIGNAL
Why are you contacting them?
> Saw you recently expanded HVAC service into...

### 2. OBSERVATION
What did you actually notice?
> I noticed the after-hours request flow still...

### 3. RELEVANCE
Why **may** it matter?
> For someone dealing with an emergency no-cool situation, that may make the next step less clear.

### 4. VALUE
Give one useful direction.
> I mapped one simpler intake approach I would test first.

### 5. INVITATION
Ask for a small response.
> Worth sending it over?

The message should feel like a useful note from someone who understands the business — not an agency brochure.$md$),
(5,'Phase 2 · First Message — Write for a Busy Business Owner',$md$# Short wins when the thinking is strong
Current ProFox certification standard:
- **Subject:** normally 1–4 words.
- **Initial cold message:** normally 40–90 words.
- **Hard maximum:** 100 words unless Admin changes the live standard.
- **Sentences:** usually 3–4.
- **Main idea:** one.
- **CTA:** one.

Use short paragraphs and direct language.

The goal is not to sound clever. It is to make the message understandable in seconds.

Research basis: Gong's current cold-email guidance consistently favors short messages, buyer-priority language, and low-friction calls to action over long product pitches.
https://www.gong.io/blog/do-execs-really-reply-to-cold-email-here-s-what-the-data-says
https://www.gong.io/blog/does-cold-email-even-work-any-more-heres-what-the-data-says$md$),
(6,'Phase 2 · First Message — Subject Lines That Feel Human',$md$# The subject line should help the prospect orient — not trick them
Good examples:
- **estimate journey**
- **roof quote flow**
- **after-hours leads**
- **maintenance requests**
- **client intake**
- **inquiry flow**
- **new service area**

Avoid:
- AMAZING WEBSITE OPPORTUNITY
- Increase Revenue 300%
- AI-Powered Digital Transformation
- FREE CONSULTATION!!!
- deceptive **Re:** or **Fwd:** when there is no existing conversation.

A good subject line is short, specific enough to make sense, and honest.$md$),
(7,'Phase 2 · First Message — Start in the Buyer’s World',$md$# Stop talking about yourself first
Weak:
> We are ProFox, a leading web development company providing websites, applications, automation, SEO...

Better:
> I noticed visitors looking at your emergency HVAC service still move through the same general inquiry path.

Use **you / your / your team / your customers / your process** language when appropriate.

Your ProFox product knowledge should help you understand what may be useful. It should **not** make you dump every service into the opening message.

The prospect should understand why you contacted **them** before they need to understand everything about **us**.$md$),
(8,'Phase 2 · First Message — Use a Low-Friction CTA',$md$# Do not demand calendar time before you earn interest
Avoid making every first touch:
> Can we schedule a 30-minute call?

Better first-touch CTAs:
- **Worth sending it over?**
- **Open to seeing the idea?**
- **Useful if I send the two changes I noticed?**
- **Worth exploring?**
- **Want the short walkthrough?**
- **Should I send the example?**

When the prospect shows interest, Module 8 teaches how to convert that interest into a booked meeting.

> **First earn permission. Then earn the meeting.**$md$),
(9,'Phase 3 · Channel Execution — Email Examples',$md$# Email gives you room — do not waste it
Use:
**Subject → Personalized reason → Observation → Relevance/value → Low-pressure CTA**

### Roofing example
**Subject: estimate journey**

Sarah — noticed your roof-replacement pages answer the big homeowner questions well, but the estimate action becomes harder to find once someone gets deeper into the page.

For a homeowner already comparing contractors, that may create unnecessary friction.

I mapped two small changes I would test before redesigning anything major.

**Worth sending them over?**

### HVAC example
**Subject: after-hours leads**

Mark — saw you promote emergency HVAC service, but after-hours visitors still move through the same general inquiry path.

For someone dealing with a no-cool emergency, the next step may not feel immediate enough.

I sketched a simpler intake + follow-up flow I would test first.

**Open to seeing it?**

### Website/customer-journey example
**Subject: quote requests**

James — I noticed the path from service interest to requesting a quote changes between pages on your site.

That may make the next step less obvious for visitors who are already evaluating the company.

I mapped a cleaner journey using what you already have.

**Worth sending the outline?**

### Automation example
**Subject: inquiry follow-up**

David — your quote form collects useful detail, but the public journey does not explain much about what happens after submission.

That may create uncertainty while the prospect is still highly engaged.

I have a simple follow-up sequence I would test there.

**Useful if I send it?**

### Apps/workflow example
**Subject: customer workflow**

Anna — noticed customers appear to move between the website, email and several manual steps to complete the process.

I do not know how the internal handoff works yet, but there may be an opportunity to reduce context switching.

I mapped what a connected workflow could look like.

**Worth seeing?**$md$),
(10,'Phase 3 · Channel Execution — LinkedIn Outreach',$md$# LinkedIn should feel lighter than email
Do not paste a full cold email into a connection request.

### Connection request
> Hi Sarah — came across ABC Roofing while researching contractors in Denver. Really liked how clearly you explain the replacement process. Thought I would connect.

No pitch required.

### After acceptance
> Thanks Sarah. One thing caught my attention while looking through the estimate journey — the CTA becomes much less visible deeper into the roof-replacement content. I mapped a quick idea around it. Happy to send it if useful.

### Short follow-up
> Sarah — should I send over the estimate-flow idea I mentioned? It is very short.

Use LinkedIn manually and within its platform rules. Do not use prohibited scraping, browser automation, fake accounts, or access-control bypasses.$md$),
(11,'Phase 3 · Channel Execution — Delivering a Loom',$md$# Module 6 taught you how to create the Loom. Module 7 teaches how to deliver it.
A Loom message should be short because the video carries the insight.

Example:
> Sarah — noticed one thing in the estimate journey that was easier to show than explain, so I recorded a 46-second walkthrough: [Loom]
>
> No need for a call — if it is relevant, just reply and I will send the second idea too.

Do not bury the Loom under a second full sales pitch.

After you have passed Module 6, normal prospecting Looms do **not** require per-video Admin approval. Apply the certified standard independently.$md$),
(12,'Phase 4 · Follow-Up — Persistence Without Pressure',$md$# No reply is not automatically a no
A prospect may have missed the message, opened it at a bad time, planned to reply later, or simply not seen enough value yet.

Good setters follow up. Great setters make each follow-up useful.

The principle:
> **Persistence without pressure.**

Do not send six versions of “just following up.”
Every touch should do one of these:
**Resurface → Add value → Change angle → Add proof → Change channel → Close the loop**

Stop the cold cadence immediately when the prospect replies or asks not to be contacted.

Research basis: Gong and Salesloft both support multi-touch prospecting rather than relying on one message, while emphasizing relevance and channel variation.
https://www.gong.io/files/gong-guide-how-to-master-cold-email-get-the-data-backed-guide-based-on-85-million-emails.pdf
https://champions.salesloft.com/cadence-best-practices-93/how-to-start-building-effective-cadences-98$md$),
(13,'Phase 4 · Follow-Up — The ProFox Follow-Up Ladder',$md$# Every follow-up must have a purpose
### 1. Bump
> Sarah — worth sending over the two estimate-flow changes I mentioned?

### 2. Add a new observation
> One more thing I noticed — the estimate CTA becomes difficult to find again on the financing page. I can include that in the walkthrough if useful.

### 3. Give something useful
> Rather than keep describing it over email, I mapped the homeowner journey from service page → financing → estimate request. Happy to send the one-page version if useful.

### 4. Loom / alternate format
> Recorded the idea so you can see exactly what I mean rather than reading another email. 44 seconds: [Loom]. Worth exploring?

### 5. Relevant proof — only when approved and verifiable
> One reason I kept thinking about this is that **[approved relevant proof]** involved a similar customer-journey issue. I can show you the part that may be relevant here.

If there is no approved relevant proof, use **new value**, not invented proof.

### 6. Close the loop
> Sarah — I will close the loop here so I do not keep filling your inbox. If improving the estimate journey becomes a priority later, I am happy to send the notes I made.

Never use guilt-based breakup messages such as “I guess you do not care about growth.”$md$),
(14,'Phase 4 · Follow-Up — The Default Multi-Channel Cadence',$md$# Use the live Admin cadence as the starting framework
Current default:
- **Day 1:** personalized email.
- **Day 2:** LinkedIn view/connect where appropriate.
- **Day 4:** one-line email bump.
- **Day 7:** new observation / insight.
- **Day 10:** LinkedIn or approved alternate channel.
- **Day 13:** Loom or useful asset for a high-value prospect.
- **Day 17:** new value or approved proof.
- **Day 22:** respectful close-the-loop email.

Then **stop** the cold sequence.

The live assignment screen shows the current Admin-controlled cadence, so always follow that if it differs from this lesson.

Important:
> **Automation can control WHEN. It must not blindly control WHAT.**

Review the prospect before important high-value touches. If they reply, pause the cadence and respond to the actual conversation.$md$),
(15,'Phase 5 · Replies — A Response Changes the Workflow',$md$# Once they reply, stop treating them like a cold sequence
### Interested
> Absolutely — here is the short walkthrough: [link]. The main thing I would test first is keeping the estimate action visible once a homeowner gets deeper into the replacement journey. If the direction makes sense, happy to walk through what I would prioritize next.

### “Send me more information”
Do not dump a giant company deck.
> Of course. Based on what I noticed, the most relevant piece is the customer journey between the service page and estimate request. I will send that rather than a general services deck.

### “Not now”
> Completely understand. Is there a better month for me to circle back, or would you prefer I leave it with you?

If they give a date, record it in CRM.

### “Wrong person”
> Thanks for letting me know. Who normally looks after the website/customer-journey side of this?

### “We already have an agency”
> Makes sense. I am not looking to replace something that is working. I reached out because of the specific estimate-journey observation. Happy to send that independently if it would still be useful.

### “Not interested”
> Understood — thanks for letting me know.

Then stop.

### “Remove me / unsubscribe”
Stop outreach, record the opt-out, and do not switch channels to bypass the request.$md$),
(16,'Phase 5 · Trust & Certification — The Five-Second Message Test',$md$# Trust is a conversion skill
Before sending any outreach, run this five-second test:
1. **Could this be sent to 100 other companies unchanged?** If yes, it is too generic.
2. **Is the first sentence about me or them?** If it is about you, rewrite it.
3. **Did I make a claim I cannot prove?** If yes, remove or qualify it.
4. **Is there more than one main idea?** If yes, simplify it.
5. **Is the CTA easy to answer?** If no, lower the commitment.

Never:
- fabricate facts, loss numbers, proof, testimonials, or case-study outcomes;
- guarantee results;
- make unauthorized pricing/scope/timeline commitments;
- use fake Re:/Fwd: threading;
- create fake urgency;
- insult the prospect, competitor, or current provider;
- ignore unsubscribe/stop requests;
- use prohibited scraping or automation;
- store irrelevant sensitive personal information.

### Country and channel rules
There is no single global cold-outreach rule. Use the **live Admin-approved market/channel compliance preset** shown in your assignment. If the preset says Admin review is required, do not send until confirmed.

Official reference points used in this module include:
- U.S. FTC CAN-SPAM guidance: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- UK ICO direct marketing guidance: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/
- Canada CASL guidance: https://ised-isde.canada.ca/site/canada-anti-spam-legislation/en
- Australia ACMA spam guidance: https://www.acma.gov.au/avoid-sending-spam
- LinkedIn User Agreement: https://www.linkedin.com/legal/user-agreement

### One-time certification
After all lessons, create one complete messaging sequence for a qualified prospect, including email, LinkedIn, Loom companion, follow-ups, cadence, reply handling, and compliance checks. Submit it for Admin review.

If approved, Module 7 is passed. **Normal future outreach does not require per-message Admin approval.** Use approved playbooks, CRM visibility, periodic audits, and coaching instead.$md$)
) AS v(ord,title,content)
WHERE m.slug='outreach-cadence';

-- Approved message playbooks. These are examples and starting structures, not copy/paste substitutes for research.
INSERT INTO public.outreach_message_playbooks(module_id,code,title,category,channel,niche_slug,market_code,subject_template,body_template,coaching_note,variables,active,sort_order,updated_at)
SELECT m.id,v.code,v.title,v.category,v.channel,v.niche_slug,v.market_code,v.subject_template,v.body_template,v.coaching_note,v.variables::jsonb,true,v.sort_order,now()
FROM public.training_modules m
CROSS JOIN (VALUES
('email_general','First Outreach — General','cold_email','Email',NULL,'GLOBAL','{{business_signal}}',E'{{first_name}} — {{observation}}\n\n{{relevance}}\n\n{{value_offer}}\n\n{{low_friction_cta}}','Use only after real research. Keep one idea and one CTA.','["first_name","business_signal","observation","relevance","value_offer","low_friction_cta"]',10),
('email_roofing','Roofing — Estimate Journey','cold_email','Email','roofing','GLOBAL','estimate journey',E'{{first_name}} — noticed your roof-replacement pages answer the big homeowner questions well, but {{verified_observation}}.\n\nFor a homeowner already comparing contractors, {{careful_relevance}}.\n\nI mapped {{useful_idea}}.\n\nWorth sending it over?','Do not claim lost leads or revenue unless verified.','["first_name","verified_observation","careful_relevance","useful_idea"]',20),
('email_hvac','HVAC — After-Hours Journey','cold_email','Email','hvac','GLOBAL','after-hours leads',E'{{first_name}} — saw you promote emergency HVAC service, and {{verified_observation}}.\n\nFor someone dealing with an urgent no-cool situation, {{careful_relevance}}.\n\nI sketched {{useful_idea}}.\n\nOpen to seeing it?','Use “may/might/appears” when the internal process is unknown.','["first_name","verified_observation","careful_relevance","useful_idea"]',30),
('email_web_journey','Website — Customer Journey','cold_email','Email',NULL,'GLOBAL','quote requests',E'{{first_name}} — I noticed {{verified_observation}}.\n\n{{careful_relevance}}\n\nI mapped a cleaner journey using what you already have.\n\nWorth sending the outline?','Keep the observation specific enough that it could not belong to 100 companies.','["first_name","verified_observation","careful_relevance"]',40),
('email_flow','Automation — Inquiry Follow-Up','cold_email','Email',NULL,'GLOBAL','inquiry follow-up',E'{{first_name}} — {{verified_observation}}.\n\n{{careful_relevance}}\n\nI have a simple follow-up flow I would test there.\n\nUseful if I send it?','Do not assume their internal CRM or follow-up process from the public website.','["first_name","verified_observation","careful_relevance"]',50),
('email_apps','Apps — Connected Workflow','cold_email','Email',NULL,'GLOBAL','customer workflow',E'{{first_name}} — {{verified_observation}}.\n\nI do not know how the internal handoff works yet, but {{careful_hypothesis}}.\n\nI mapped what a connected workflow could look like.\n\nWorth seeing?','Explicitly identify internal process assumptions as unknown until discovery.','["first_name","verified_observation","careful_hypothesis"]',60),
('linkedin_connect','LinkedIn — Connection Request','linkedin_connection','LinkedIn',NULL,'GLOBAL',NULL,E'Hi {{first_name}} — came across {{company_name}} while researching {{relevant_context}}. {{genuine_business_compliment}} Thought I would connect.','Do not pitch a full service in the connection request.','["first_name","company_name","relevant_context","genuine_business_compliment"]',70),
('linkedin_after_accept','LinkedIn — After Acceptance','linkedin_followup','LinkedIn',NULL,'GLOBAL',NULL,E'Thanks {{first_name}}. One thing caught my attention while looking through {{specific_area}} — {{verified_observation}}. I mapped a quick idea around it. Happy to send it if useful.','Keep this lighter than the email.','["first_name","specific_area","verified_observation"]',80),
('loom_companion','Loom Companion','loom_companion','Loom',NULL,'GLOBAL',NULL,E'{{first_name}} — noticed one thing in {{specific_area}} that was easier to show than explain, so I recorded a {{duration_seconds}}-second walkthrough: {{loom_url}}\n\nNo need for a call — if it is relevant, just reply and I will send the next idea too.','The Loom carries the insight. Do not add another full pitch around it.','["first_name","specific_area","duration_seconds","loom_url"]',90),
('followup_bump','Follow-Up — One-Line Bump','followup_bump','Email',NULL,'GLOBAL',NULL,E'{{first_name}} — worth sending over {{specific_value}} I mentioned?','One sentence is enough when it genuinely resurfaces the original value.','["first_name","specific_value"]',100),
('followup_new_observation','Follow-Up — New Observation','followup_insight','Email',NULL,'GLOBAL',NULL,E'One more thing I noticed, {{first_name}} — {{new_verified_observation}}. I can include that in the short walkthrough if useful.','Must add new evidence, not restate the first email.','["first_name","new_verified_observation"]',110),
('followup_value','Follow-Up — Give Something Useful','followup_value','Email',NULL,'GLOBAL',NULL,E'{{first_name}} — rather than keep describing it over email, I mapped {{useful_asset}}. Happy to send it if useful.','Use a real asset/insight you are prepared to deliver.','["first_name","useful_asset"]',120),
('followup_loom','Follow-Up — Loom / Alternate Format','followup_loom','Email',NULL,'GLOBAL',NULL,E'{{first_name}} — recorded the idea so you can see exactly what I mean rather than reading another email. {{duration_seconds}} seconds: {{loom_url}}\n\nWorth exploring?','Only send a Loom that follows the Module 6 standard.','["first_name","duration_seconds","loom_url"]',130),
('followup_proof','Follow-Up — Approved Proof or New Value','followup_proof','Email',NULL,'GLOBAL',NULL,E'{{first_name}} — one reason I kept thinking about this is {{approved_relevant_proof_or_new_value}}. I can show you the part that may be relevant to {{company_name}} if useful.','Use only verified Admin-approved proof. If none exists, use new value instead.','["first_name","approved_relevant_proof_or_new_value","company_name"]',140),
('followup_close','Follow-Up — Close the Loop','close_loop','Email',NULL,'GLOBAL',NULL,E'{{first_name}} — I will close the loop here so I do not keep filling your inbox.\n\nIf {{relevant_priority}} becomes a priority later, I am happy to send the notes I made.','No guilt, manipulation, or “have you given up?” language.','["first_name","relevant_priority"]',150),
('reply_interested','Reply — Interested','reply','Reply',NULL,'GLOBAL',NULL,E'Absolutely — here is {{requested_value_or_link}}. The main thing I would test first is {{priority}}. If the direction makes sense, happy to walk through what I would prioritize next.','Respond to what they asked for; do not restart the cold cadence.','["requested_value_or_link","priority"]',160),
('reply_send_info','Reply — Send Information','reply','Reply',NULL,'GLOBAL',NULL,E'Of course. Based on what I noticed, the most relevant piece is {{relevant_piece}}. I will send that rather than a general services deck.','Send relevance, not information overload.','["relevant_piece"]',170),
('reply_not_now','Reply — Not Now','reply','Reply',NULL,'GLOBAL',NULL,E'Completely understand. Is there a better month for me to circle back, or would you prefer I leave it with you?','If they give a date, record it in CRM and stop the active cadence.','[]',180),
('reply_wrong_person','Reply — Wrong Person','reply','Reply',NULL,'GLOBAL',NULL,E'Thanks for letting me know. Who normally looks after {{relevant_area}} on your team?','Do not restart the pitch. Ask for direction.','["relevant_area"]',190),
('reply_agency','Reply — Already Have an Agency','reply','Reply',NULL,'GLOBAL',NULL,E'Makes sense. I am not looking to replace something that is working. I reached out because of {{specific_observation}}. Happy to send that independently if it would still be useful.','Never attack their current supplier.','["specific_observation"]',200),
('reply_not_interested','Reply — Not Interested','reply','Reply',NULL,'GLOBAL',NULL,E'Understood — thanks for letting me know.','Respect the no. Do not force an objection-handling sequence into every rejection.','[]',210),
('reply_unsubscribe','Reply — Remove Me / Unsubscribe','reply','Reply',NULL,'GLOBAL',NULL,E'Understood. I will stop outreach.','Record the opt-out and do not switch channels to bypass it.','[]',220)
) AS v(code,title,category,channel,niche_slug,market_code,subject_template,body_template,coaching_note,variables,sort_order)
WHERE m.slug='outreach-cadence'
ON CONFLICT(module_id,code) DO UPDATE SET title=EXCLUDED.title,category=EXCLUDED.category,channel=EXCLUDED.channel,niche_slug=EXCLUDED.niche_slug,market_code=EXCLUDED.market_code,subject_template=EXCLUDED.subject_template,body_template=EXCLUDED.body_template,coaching_note=EXCLUDED.coaching_note,variables=EXCLUDED.variables,active=true,sort_order=EXCLUDED.sort_order,updated_at=now();

INSERT INTO public.outreach_compliance_presets(module_id,market_code,market_label,channel,status,summary,rules,reference_urls,active,sort_order,updated_at)
SELECT m.id,v.market_code,v.market_label,v.channel,v.status,v.summary,v.rules::jsonb,v.reference_urls::jsonb,true,v.sort_order,now()
FROM public.training_modules m
CROSS JOIN (VALUES
('GLOBAL','Global Baseline','Email','allowed_with_rules','Use truthful, relevant outreach only. Country-specific rules can be stricter than this baseline.','["Use accurate sender identity and truthful subjects.","Do not fabricate personalization, proof, urgency, or results.","Honor stop/unsubscribe requests immediately.","Do not use prohibited scraping, bots, fake accounts, or access-control bypasses.","Check the prospect market before sending."]','[]',10),
('GLOBAL','Global Baseline','LinkedIn','allowed_with_rules','Use LinkedIn manually and in line with platform terms and Admin-approved playbooks.','["No prohibited automation, scraping, browser extensions, fake accounts, or credential sharing.","Connection requests should be light and relevant.","Stop if the prospect asks you not to contact them."]','["https://www.linkedin.com/legal/user-agreement"]',20),
('US','United States','Email','allowed_with_rules','Follow the current Admin playbook and U.S. commercial email requirements. This training is operational guidance, not legal advice.','["Use truthful sender/header information and non-deceptive subjects.","Include required identification and opt-out elements in the approved sending system.","Honor opt-outs promptly.","Do not use the training example alone as a legal checklist; use the live Admin-approved sending setup."]','["https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business"]',30),
('UK','United Kingdom','Email','admin_review_required','UK direct-marketing rules can differ between corporate subscribers and individuals/sole traders. Follow the current Admin-approved market rule before first contact.','["Confirm whether the recipient type and contact method are permitted under the current Admin playbook.","Use accurate identity and a working opt-out method.","Do not assume that a public email address automatically permits outreach."]','["https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/"]',40),
('CA','Canada','Email','admin_review_required','Canada CASL has stricter consent, identification, and unsubscribe requirements. Use Admin-confirmed market rules before sending.','["Do not treat a public business address as automatic permission.","Use the approved consent/relationship basis documented by Admin.","Use accurate sender identification and unsubscribe handling."]','["https://ised-isde.canada.ca/site/canada-anti-spam-legislation/en"]',50),
('AU','Australia','Email','admin_review_required','Australia spam rules require an approved basis to send, clear identification, and unsubscribe handling. Use Admin-confirmed rules before sending.','["Confirm the approved consent/basis before sending.","Identify the sender accurately.","Use the approved unsubscribe mechanism and honor requests."]','["https://www.acma.gov.au/avoid-sending-spam"]',60)
) AS v(market_code,market_label,channel,status,summary,rules,reference_urls,sort_order)
WHERE m.slug='outreach-cadence'
ON CONFLICT(module_id,market_code,channel) DO UPDATE SET market_label=EXCLUDED.market_label,status=EXCLUDED.status,summary=EXCLUDED.summary,rules=EXCLUDED.rules,reference_urls=EXCLUDED.reference_urls,active=true,sort_order=EXCLUDED.sort_order,updated_at=now();
