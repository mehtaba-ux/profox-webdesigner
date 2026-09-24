-- Sales Academy Module 6 — Personalized Loom Outreach
-- One-time onboarding certification only. Passing this module does NOT create an ongoing per-video approval requirement.

CREATE TABLE IF NOT EXISTS public.loom_outreach_training_config (
  module_id uuid PRIMARY KEY REFERENCES public.training_modules(id) ON DELETE CASCADE,
  min_duration_seconds integer NOT NULL DEFAULT 30 CHECK (min_duration_seconds BETWEEN 15 AND 60),
  target_duration_min integer NOT NULL DEFAULT 40 CHECK (target_duration_min BETWEEN 20 AND 90),
  target_duration_max integer NOT NULL DEFAULT 50 CHECK (target_duration_max BETWEEN 20 AND 90),
  max_duration_seconds integer NOT NULL DEFAULT 60 CHECK (max_duration_seconds BETWEEN 30 AND 120),
  approval_scope text NOT NULL DEFAULT 'onboarding_only' CHECK (approval_scope='onboarding_only'),
  profox_fit_options jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(profox_fit_options)='array'),
  rubric jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(rubric)='array'),
  critical_failures jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(critical_failures)='array'),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (min_duration_seconds <= target_duration_min),
  CHECK (target_duration_min <= target_duration_max),
  CHECK (target_duration_max <= max_duration_seconds)
);

CREATE TABLE IF NOT EXISTS public.loom_outreach_training_state (
  progress_id uuid PRIMARY KEY REFERENCES public.user_training_progress(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.training_modules(id) ON DELETE CASCADE,
  lessons_completed integer NOT NULL DEFAULT 0 CHECK (lessons_completed >= 0),
  draft_data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(draft_data)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,module_id)
);

CREATE TABLE IF NOT EXISTS public.loom_outreach_review_details (
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

CREATE INDEX IF NOT EXISTS idx_loom_outreach_state_user_module ON public.loom_outreach_training_state(user_id,module_id);
CREATE INDEX IF NOT EXISTS idx_loom_outreach_review_progress_created ON public.loom_outreach_review_details(progress_id,created_at DESC);

ALTER TABLE public.loom_outreach_training_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loom_outreach_training_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loom_outreach_review_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loom_outreach_config_admin_all ON public.loom_outreach_training_config;
CREATE POLICY loom_outreach_config_admin_all ON public.loom_outreach_training_config
FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS loom_outreach_config_learner_select ON public.loom_outreach_training_config;
CREATE POLICY loom_outreach_config_learner_select ON public.loom_outreach_training_config
FOR SELECT TO authenticated USING (public.can_access_sales_academy_module(module_id));

DROP POLICY IF EXISTS loom_outreach_state_select ON public.loom_outreach_training_state;
CREATE POLICY loom_outreach_state_select ON public.loom_outreach_training_state
FOR SELECT TO authenticated USING (public.is_admin() OR user_id=auth.uid());

DROP POLICY IF EXISTS loom_outreach_review_admin_all ON public.loom_outreach_review_details;
CREATE POLICY loom_outreach_review_admin_all ON public.loom_outreach_review_details
FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS loom_outreach_review_owner_select ON public.loom_outreach_review_details;
CREATE POLICY loom_outreach_review_owner_select ON public.loom_outreach_review_details
FOR SELECT TO authenticated USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM public.user_training_progress p
    WHERE p.id=loom_outreach_review_details.progress_id AND p.user_id=auth.uid()
  )
);

UPDATE public.training_modules
SET title='Personalized Loom Outreach',
    description='Create a research-backed 30–60 second personalized Loom that earns the next conversation. One approved test video is required during onboarding only; after certification, normal outreach videos do not require per-video Admin approval.',
    module_type='assignment', required=true, active=true, passing_score=80, requires_admin_review=true, updated_at=now()
WHERE slug='loom-outreach';

INSERT INTO public.loom_outreach_training_config(
  module_id,min_duration_seconds,target_duration_min,target_duration_max,max_duration_seconds,
  approval_scope,profox_fit_options,rubric,critical_failures,updated_at
)
SELECT m.id,30,40,50,60,'onboarding_only',
'["ProFox Web","ProFox Apps","ProFox Flow","Integration","Care","Discovery"]'::jsonb,
'[
 {"key":"research_accuracy","label":"Prospect research accuracy","max":10},
 {"key":"personalization","label":"Quality of personalization","max":15},
 {"key":"observation_relevance","label":"Strength and relevance of observation","max":15},
 {"key":"business_understanding","label":"Business understanding","max":10},
 {"key":"value_insight","label":"Useful value / insight offered","max":10},
 {"key":"message_structure","label":"NOTICE → IMPACT → IDEA → INVITATION structure","max":10},
 {"key":"high_ticket_communication","label":"High-ticket communication quality","max":10},
 {"key":"delivery_confidence","label":"Natural confidence and delivery","max":10},
 {"key":"cta_quality","label":"Low-pressure CTA / next step","max":5},
 {"key":"technical_professionalism","label":"Technical and video professionalism","max":5}
]'::jsonb,
'[
 {"key":"over_max_duration","label":"Actual video exceeds the maximum allowed duration"},
 {"key":"wrong_company_person","label":"Wrong company, person, or materially incorrect prospect identity"},
 {"key":"fabricated_fact","label":"Fabricated business fact or unsupported claim presented as fact"},
 {"key":"invented_loss_metrics","label":"Invented revenue loss, conversion data, or financial impact"},
 {"key":"misrepresented_observation","label":"Materially misrepresented what was actually observed"},
 {"key":"guaranteed_results","label":"Promised or guaranteed business results"},
 {"key":"unauthorized_commitment","label":"Made an unauthorized pricing, scope, timeline, legal, security, or delivery commitment"},
 {"key":"deceptive_personalization","label":"Used deceptive personalization or pretended generic outreach was individualized"},
 {"key":"disrespectful_outreach","label":"Insulted, embarrassed, pressured, or disrespected the prospect"},
 {"key":"privacy_confidentiality","label":"Exposed private, confidential, or unrelated personal information in the recording"},
 {"key":"generic_not_personalized","label":"Video is materially generic rather than prospect-specific"},
 {"key":"sent_before_approval","label":"Certification video was sent to the real prospect before Admin approval"},
 {"key":"no_face_visible","label":"Seller face is not visibly present in the certification video"},
 {"key":"no_prospect_context","label":"Video does not visibly or verbally demonstrate real prospect context"}
]'::jsonb,now()
FROM public.training_modules m WHERE m.slug='loom-outreach'
ON CONFLICT(module_id) DO UPDATE SET
  min_duration_seconds=EXCLUDED.min_duration_seconds,
  target_duration_min=EXCLUDED.target_duration_min,
  target_duration_max=EXCLUDED.target_duration_max,
  max_duration_seconds=EXCLUDED.max_duration_seconds,
  approval_scope='onboarding_only',
  profox_fit_options=EXCLUDED.profox_fit_options,
  rubric=EXCLUDED.rubric,
  critical_failures=EXCLUDED.critical_failures,
  updated_at=now();

DELETE FROM public.training_lessons
WHERE module_id=(SELECT id FROM public.training_modules WHERE slug='loom-outreach' LIMIT 1);

INSERT INTO public.training_lessons(module_id,title,content,video_url,sort_order,active,updated_at)
SELECT m.id,v.title,v.content,'',v.ord,true,now()
FROM public.training_modules m
CROSS JOIN (VALUES
(1,'Phase 1 · Strategy — The First Loom Has One Job',$md$# Earn the next conversation — do not try to close the project in the first video
Your first personalized Loom is **not** a company presentation and not a mini proposal.
Its job is to make one relevant prospect think: **“This person actually looked at our business, noticed something useful, and may be worth replying to.”**
For high-ticket outreach, relevance beats volume. Keep the message short, evidence-based, and useful.
> **Sell the conversation, not the whole solution.**$md$),
(2,'Phase 1 · Strategy — One-Time Certification, Not Ongoing Approval',$md$# Important ProFox operating rule
This Module 6 Loom is a **one-time onboarding certification test**.
You must submit one certification video and receive Admin approval before this module passes.
If Admin requests a retry, record a new version using the feedback and resubmit.
**After you pass Module 6 and complete onboarding, normal prospecting Loom videos do not require per-video Admin approval.**
The purpose of this test is to prove that you can represent ProFox safely and professionally before you begin independent outreach.$md$),
(3,'Phase 2 · Research — Start From a Qualified Prospect',$md$# Module 6 begins where Module 5 ends
Do not choose a random business and press Record.
Start with a **genuinely qualified prospect**. Recheck:
- correct company and geography;
- legitimate business and contact route;
- likely relevant stakeholder;
- one evidence-backed opportunity;
- no duplicate or obvious disqualifier;
- source URLs still support your observation.
If you cannot explain **why this prospect, why this observation, and why it may matter**, you are not ready to record.$md$),
(4,'Phase 2 · Research — Personalization Must Be Business-Relevant',$md$# Saying the prospect's name is not enough
Weak personalization: “Hi Sarah, I saw you are the owner of ABC Roofing.”
Strong personalization uses a meaningful business signal such as:
- customer-journey friction;
- website/service-page behavior;
- a new location or service;
- hiring or expansion activity;
- booking, quote, follow-up, or workflow signals;
- a recent public announcement;
- a visible technology or customer-process gap.
Choose context that helps the prospect immediately understand **why this video was made for them**.$md$),
(5,'Phase 2 · Research — One Video = One Insight',$md$# Do not dump every problem you found
A good first Loom has **one central idea**.
Avoid listing SEO, website design, CRM, automation, reviews, social media, email marketing, apps, and integrations in the same minute.
Pick the strongest relevant observation and build the video around it.
Continue the Module 5 discipline:
- **Fact** — supported by evidence;
- **Observation** — what you can directly see;
- **Hypothesis** — a reasonable possibility that needs discovery;
- **Unknown** — something you do not yet know.
Never turn a hypothesis into a fact to make the pitch sound stronger.$md$),
(6,'Phase 3 · Message — The ProFox 45-Second Framework',$md$# NOTICE → IMPACT → IDEA → INVITATION
Use this sequence as your default:
1. **NOTICE** — prove relevance immediately.
2. **IMPACT** — show what you observed and why it may matter.
3. **IDEA** — offer one useful direction, not a full solution pitch.
4. **INVITATION** — ask for a small, low-pressure next step.
Current live standard: **30–60 seconds accepted; 40–50 seconds is the target.** The assignment screen always shows the current Admin-controlled timing standard.$md$),
(7,'Phase 3 · Message — NOTICE: Win the First Five Seconds',$md$# Start with the prospect, not ProFox
Within the first few seconds, make the relevance obvious.
Good pattern:
**“Hi Sarah — I was looking through the ABC Roofing estimate journey and noticed one thing I wanted to show you quickly.”**
Avoid spending the opening on your job title, company history, awards, service list, or “I hope you are well.”
The prospect should know almost immediately that this is **their** video.$md$),
(8,'Phase 3 · Message — IMPACT: Describe What You Actually Saw',$md$# Show the evidence without exaggerating
Use the prospect's website or relevant public context and point to the observation.
Example:
**“On mobile, once someone gets into the roof-replacement details, the estimate action becomes easy to lose.”**
Then use careful language for the implication:
**“That may add friction for a homeowner who is already ready to take the next step.”**
Do not claim lost revenue, bad conversion rates, failed CRM processes, or internal operational problems unless verified.$md$),
(9,'Phase 3 · Message — IDEA: Give Useful Thinking, Not a Service Dump',$md$# Expertise should be visible in the idea
Weak: “We build conversion websites, apps, CRM and automation.”
Better: **“One approach I would test is keeping the estimate action visible throughout this part of the journey so the next step never disappears.”**
Offer enough insight to demonstrate judgment, but do not prescribe a large implementation before discovery.
Your product knowledge should help you **think**, not make you list every ProFox service.$md$),
(10,'Phase 3 · Message — INVITATION: Use a Small Next Step',$md$# End without pressure
Do not force a 30-minute meeting in the first touch.
Better options:
- **“If useful, I can show you the two changes I would test first.”**
- **“If that is something you are already thinking about, happy to send over the approach.”**
- **“Worth exploring?”**
A good CTA creates curiosity and permission. It does not corner the prospect.$md$),
(11,'Phase 4 · Recording — Show Their World First',$md$# Face + relevant prospect context
For this certification:
- your face must be visible;
- show the prospect's relevant website/page or clearly demonstrate the real prospect context;
- keep unrelated tabs, notifications, private data, and clutter off-screen.
Do **not** open by showing the ProFox website, portfolio, pricing page, or a generic deck. Start in the prospect's world.$md$),
(12,'Phase 4 · Recording — Sound Like a Trusted Business Advisor',$md$# Calm, prepared, natural
Aim for:
- conversational confidence;
- clear pace;
- genuine curiosity;
- concise language;
- certainty without arrogance.
Avoid sounding robotic, desperate, over-rehearsed, hyperactive, or like a telemarketer.
Use talking points rather than reading a full script word-for-word. Your eyes and voice should feel like you are speaking to one intelligent business owner, not performing for an audience.$md$),
(13,'Phase 4 · Recording — Professional Minimum Standard',$md$# Human is good. Careless is not.
Before recording:
- camera near eye level;
- face clearly lit;
- clear audio with no distracting noise;
- clean/professional background;
- prospect page ready;
- private tabs closed;
- notifications off;
- browser cleaned up;
- no confidential information visible.
You do not need studio production. You do need a video that feels safe to send to a serious buyer.$md$),
(14,'Phase 4 · Recording — The Companion Message',$md$# Keep the text around the video short
The Loom should carry the insight. Do not repeat the entire video in a long email.
Example pattern:
**“Sarah — noticed one thing on the estimate journey on your site and recorded a 47-second video showing it. Thought it may be useful. [Loom link] Worth exploring?”**
Module 7 will teach the full outreach and follow-up cadence. In Module 6, focus on making the video itself excellent.$md$),
(15,'Phase 5 · Trust — What Makes a Loom Fail',$md$# Critical mistakes are more important than polish
A video can fail even with a high rubric score if it:
- exceeds the live maximum duration;
- targets the wrong company/person;
- invents business facts, losses, conversion data, or results;
- misrepresents the observation;
- guarantees outcomes;
- makes unauthorized price/scope/timeline/legal/security commitments;
- uses deceptive or fake personalization;
- insults or pressures the prospect;
- exposes private/confidential information;
- is generic while pretending to be personalized;
- is sent to the real prospect before the certification is approved.
**Trust beats cleverness.**$md$),
(16,'Phase 5 · Certification — Pre-Record Checklist & Submission',$md$# Before pressing Record
Confirm:
- qualified prospect;
- correct company/person;
- one verified observation;
- business relevance;
- one idea only;
- Fact / Observation / Hypothesis / Unknown discipline;
- no invented claims or guarantees;
- low-pressure CTA;
- face visible;
- prospect context ready;
- clean screen and clear audio;
- can finish inside the live time limit.
Then record **one certification Loom**, complete the structured assignment, and submit the Loom link for Admin review.
If approved, Module 6 is permanently passed for onboarding. **You will not submit every future outreach Loom for approval.**$md$)
) AS v(ord,title,content)
WHERE m.slug='loom-outreach';