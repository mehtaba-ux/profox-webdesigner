-- Module 12 — Product Presentation — Lessons 06–10

do $$
declare v_module uuid;
begin
  select id into v_module from public.training_modules where slug='presentation-skills';
  if v_module is null then raise exception 'Module 12 presentation-skills not found.'; end if;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Prioritize the Buyer’s 1–3 Most Important Issues',$lesson$
## Objective
Present in the buyer's priority order instead of the ProFox service-menu order.

Discovery may uncover many issues. Presentation should narrow them.

### Recommended hierarchy
**Priority 1 — greatest business consequence**

**Priority 2 — second meaningful constraint**

**Priority 3 — supporting issue**

Everything else can be secondary, deferred, or left out.

### Example
Discovery uncovered:
- outdated design;
- poor mobile conversion;
- referral dependence;
- weak follow-up;
- SEO concerns;
- inconsistent content;
- reporting gaps.

If the buyer's main commercial concern is predictable qualified estimates, a strong presentation might focus on:

**Trust → conversion journey → enquiry/follow-up process**

—not seven separate workstreams.

### Why this improves results
When everything is important, nothing feels important. Buyer attention is limited. Use it on the problems with the strongest verified relevance.

### Rule
> **Broad discovery. Narrow presentation.**

### Practice prompt
Take seven possible buyer issues and rank the three that deserve presentation time. Explain why each one is above the others.
$lesson$,6,true),

  (v_module,'Translate Features Into Buyer Value',$lesson$
## Objective
Explain why a capability matters instead of stopping at what it is.

Use the ProFox translation chain:

**FEATURE → CAPABILITY → BUSINESS EFFECT → BUYER OUTCOME**

### Example — Website
Weak:
> “We build responsive websites.”

Better:
> “The experience adapts across desktop, tablet and mobile.”

Stronger:
> “Because prospective customers may reach you from mobile, we design the enquiry journey to work properly there as well, reducing unnecessary friction before someone requests a quote.”

### Example — Automation
Weak:
> “We can automate emails.”

Stronger:
> “Instead of the team remembering every follow-up manually, agreed lifecycle messages can be triggered consistently so leads do not depend entirely on somebody remembering the next action.”

### ProFox value sentence
Use:

**YOU SAID → THIS MATTERS BECAUSE → WE RECOMMEND → WHICH ENABLES**

Example:
> “You said enquiries often wait until the following morning. That matters because prospects may still be comparing providers at that point. We recommend connecting lead capture with immediate acknowledgement and structured follow-up, which gives your team a more consistent response process without replacing personal sales conversations.”

### Critical discipline
Explain potential business value without turning it into a guaranteed result.

### Practice prompt
Translate five technical capabilities into buyer outcomes without using an unsupported ROI claim.
$lesson$,7,true),

  (v_module,'Present Website Design & Development Around the Customer Journey',$lesson$
## Objective
Present websites as business/customer experiences—not page counts and plugin lists.

### Recommended flow
**1. Acquisition** — how the right visitor arrives.

**2. First impression & trust** — what they must understand quickly.

**3. Decision journey** — what questions and concerns the site must answer.

**4. Conversion** — what action should become clear and easy.

**5. Follow-up** — what happens after enquiry or booking.

**6. Management** — how the business maintains useful content and operations.

### Example
Buyer says homeowners compare several roofers before requesting an estimate.

Strong presentation:
> “I would not treat the homepage as a brochure. Its job is to establish location/service relevance, credibility, roofing expertise and a clear estimate path quickly. From there, service pages and proof should answer the questions prospects normally ask before contacting you.”

### Do not lead with
- WordPress;
- page count;
- animation count;
- plugin names;
- “modern design” as the business case.

Those can matter, but only after the buyer understands the commercial/customer logic.

### Practice prompt
Create a three-part recommendation for a service business that has strong reviews but weak mobile enquiry conversion.
$lesson$,8,true),

  (v_module,'Present Custom Web Applications as Workflow Transformation',$lesson$
## Objective
Show how the work process changes without making unsupported technical promises.

Do not sell a custom app as:
> “We can build anything.”

Use:

**CURRENT WORKFLOW → BOTTLENECK → PROPOSED WORKFLOW → USERS/CONTROLS → BUSINESS EFFECT**

### Example
Current process:

Email → spreadsheet → WhatsApp → manual confirmation.

Strong seller:
> “The issue is not simply that you're using spreadsheets. The bigger problem is that booking status is distributed across tools, so staff cannot easily see one reliable source of truth. The direction we would explore is a centralized workflow where each booking has an owner, status, required action and history.”

### Explore the operating model
Present only validated concepts around:
- users and roles;
- permissions;
- approvals;
- data flow;
- integrations;
- visibility/reporting;
- security requirements;
- handoffs.

### Never promise without validation
- a specific third-party integration;
- security/compliance capability;
- API behavior;
- exact performance level;
- fixed delivery timeline;
- feasibility of an unknown requirement.

If uncertain:
> “I don't want to guess. I’ll capture that requirement and have the technical team verify the correct approach.”

### Practice prompt
Explain a centralized workflow to a non-technical operations director without mentioning a programming language.
$lesson$,9,true),

  (v_module,'Present Email Marketing & Business Automation as a Journey',$lesson$
## Objective
Sell the connected process—not “automatic emails.”

Map the journey:

**Lead enters → acknowledgement → qualification/segmentation → human action → nurture → purchase/project → post-purchase → retention/repeat opportunity**

### Example
Buyer currently has inconsistent manual lead follow-up.

Strong seller:
> “The issue is not a lack of email. It is that each lead receives a different experience depending on who notices it. The direction we would explore is a consistent lifecycle: acknowledge promptly, route the lead correctly, preserve human sales interaction where it adds value, and make follow-up less dependent on memory.”

### Important
Automation is not always the answer.

Do not automate a broken process without understanding it.

Do not remove human touch from high-value moments just because automation is possible.

### Connect to ProFox positioning
**From site to system.**

A website, app, CRM flow or email journey should connect when that connection solves a real business problem.

### Practice prompt
Take a manual lead-follow-up process and explain a better lifecycle in five stages without promising a revenue increase.
$lesson$,10,true);
end $$;
