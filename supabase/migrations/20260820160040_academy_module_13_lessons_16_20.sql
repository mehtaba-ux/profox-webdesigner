-- Module 13 lessons 16–20

do $$ declare v_module uuid; begin
  select id into v_module from public.training_modules where slug='objections';
  if v_module is null then raise exception 'Module 13 objections is missing.'; end if;

  insert into public.training_lessons(module_id,title,content,sort_order,active) values
  (v_module,'Trust: “I’ve Never Heard of ProFox”',$md$
## Objective
Reduce uncertainty with verifiable trust signals instead of hype.

## Operating rule
**Trust objections require evidence.**

Useful proof may include verified portfolio work, relevant case studies, company registration, process transparency, clear scope, team expertise, approved references, secure payment process and realistic commitments.

Professional response: “That’s a reasonable question. Rather than asking you to rely on a promise, let me show you the work and process we can verify, including how scope, approvals and delivery are controlled.”

### Mistakes to avoid
- “We’re the best.”
- fake testimonials;
- fake client logos;
- unverified company statistics;
- pressure disguised as confidence.

### Practice prompt
Choose three trust signals you would use for a cautious buyer who has never heard of ProFox.
$md$,16,true),
  (v_module,'Previous Bad Experience: Rebuild Trust Through Process',$md$
## Objective
Use a buyer’s previous bad experience to understand the risk they need reduced.

## Operating rule
Ask what happened before saying ProFox is different.

Buyer: “We were burned by an agency before.”

Ask: **“What happened?”**

If the agency disappeared, the concern is delivery visibility. If they guaranteed rankings, the concern is credibility. If scope kept changing, the concern is governance.

Respond with the part of the ProFox process that directly reduces that risk.

### Mistakes to avoid
“We’re completely different” with no evidence, attacking the previous provider, promising zero risk, or guaranteeing outcomes merely to restore trust.

### Practice prompt
The buyer’s previous developer missed deadlines and stopped communicating. Which ProFox process evidence would matter most?
$md$,17,true),
  (v_module,'Technical and Feature Objections',$md$
## Objective
Handle integration, security and capability questions without inventing technical commitments.

## Operating rule
Know the difference between **approved capability**, **needs verification**, and **unsupported requirement**.

If verified, explain accurately.

If uncertain: **“That may be possible, but I don’t want to give you an inaccurate commitment. I’ll document the exact system, version and requirement and have our technical team verify it.”**

If unsupported, be transparent.

## Critical rule
**An objection is never permission to invent a capability.**

Do not promise integrations, certifications, performance levels, timelines, API support or architecture unless approved or verified.

### Practice prompt
Buyer asks whether ProFox can integrate with a proprietary ERP you have never seen. Write the correct response and the information you need to collect.
$md$,18,true),
  (v_module,'Website-Specific Objections',$md$
## Objective
Apply the objection framework to Website Design & Development.

### “Our current website is fine.”
Ask: “What would make changing it worthwhile?” If there is no meaningful business reason, do not force a redesign.

### “Why not use Wix or Squarespace?”
“That can absolutely make sense for some businesses. The right comparison depends on what the website needs to accomplish.”

### “Can you guarantee first-page Google rankings?”
Do not guarantee a specific organic ranking.

### “Can you guarantee leads?”
No. Explain the design, journey and optimization approach without promising uncontrolled outcomes.

### Mistakes to avoid
Insulting the current website, claiming platform superiority without context, guaranteed SEO rankings, guaranteed lead volume or invented conversion percentages.

### Practice prompt
A buyer only needs a simple credibility site and has no complex requirements. What should stop you from forcing a larger recommendation?
$md$,19,true),
  (v_module,'Custom Web Application Objections',$md$
## Objective
Handle custom-software resistance with commercial and technical judgment.

### “Why not buy existing software?”
Sometimes that is the better answer. Explore workflow fit, licensing, customization, integrations, ownership, reporting, security and scale.

If off-the-shelf software solves the need at lower risk, say so.

### “Custom software seems risky.”
Address scoping, phased delivery, testing, approvals and acceptance criteria. Never claim there is no risk.

### “Can you build everything in four weeks?”
Do not commit before scope and technical validation.

### Mistakes to avoid
“We can build anything,” forcing custom software, unapproved dates, unsupported security claims or hiding implementation complexity.

### Practice prompt
The buyer’s requirements are 95% covered by an existing product. What is the ethical ProFox recommendation?
$md$,20,true);
end $$;
