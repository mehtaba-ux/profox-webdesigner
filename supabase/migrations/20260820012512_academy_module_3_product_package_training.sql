-- Module 3 — Product & Package Training
-- Approved founder-reviewed curriculum. Permanent teaching stays in Academy lessons; changing commercial values are read from the live Admin Sales Catalog.

UPDATE public.training_modules
SET description = 'Learn how to diagnose customer needs, position ProFox Web, Apps and Flow, select the right package and add-ons, use the live Sales Catalog correctly, and recommend high-value solutions without overselling.',
    module_type = 'lesson', passing_score = 80, required = true, active = true,
    requires_admin_review = false, updated_at = now()
WHERE slug = 'product-packages';

DELETE FROM public.training_lessons
WHERE module_id = (SELECT id FROM public.training_modules WHERE slug='product-packages' LIMIT 1);

INSERT INTO public.training_lessons(module_id,title,content,video_url,sort_order,active,updated_at)
SELECT m.id,v.title,v.content,'',v.sort_order,true,now()
FROM public.training_modules m
CROSS JOIN (VALUES
(1,'From Site to System · What ProFox Sells',$lesson$
# From Site to System — What ProFox Sells

**Learning goal:** See ProFox as one connected digital system, not a menu of unrelated services.

ProFox designs the digital experiences and systems that move business forward.

Our core model is:

> **ProFox Web · ProFox Apps · ProFox Flow**

- **ProFox Web — Make every visit matter.** Creates the customer-facing digital experience.
- **ProFox Apps — Built around your business.** Creates custom business capability, workflows and systems.
- **ProFox Flow — Keep the journey moving.** Connects communication, follow-up and repetitive operational actions.

The customer may need one capability or several. Your job is not to push all three. Your job is to understand the business journey well enough to identify what actually needs to be solved.

## Example
A roofing company says, “We need a better website.”

A weak seller hears only **website project**.

A trained seller investigates. Maybe the website is unclear, leads wait hours for follow-up, and staff manually copy enquiries into a CRM. The real solution could involve **Web** for the experience, an **integration/App capability** for the system connection, and **Flow** for routing and follow-up.

> **Sell the problem that needs solving, then assemble the capability required to solve it.**

Do not begin with technology. Begin with the business outcome.
$lesson$),
(2,'ProFox Web · Launch',$lesson$
# ProFox Web — Make Every Visit Matter

**Learning goal:** Understand the role of ProFox Web and when a focused Launch-level website is appropriate.

ProFox Web is Website Design & Development. It is the digital front door of the business.

A strong website can help a business establish credibility, explain its offer clearly, guide visitors, generate enquiries, support booking or commerce, strengthen brand experience and create a better foundation for marketing and search.

The goal is not simply to make something attractive.

> **The right visitor should be able to understand, trust and act.**

## ProFox Launch
Launch is designed for businesses that need a focused professional website without unnecessary complexity.

Typical fit signals include:

- a small local or service business;
- a startup establishing a credible presence;
- a consultant or independent professional;
- a straightforward service offer;
- an outdated/basic website that needs a professional replacement;
- a business with a small number of core pages and a simple conversion journey.

Common customer statements:

- “Our current site looks unprofessional.”
- “We do not really have a proper website.”
- “Customers cannot understand what we offer.”
- “The website does not work well on mobile.”
- “We need somewhere credible to send prospects.”

Do **not** call Launch the “cheap package.” Position it as the right level for a focused requirement.

Do not choose Launch only because the company is small. A small organization can still have a sophisticated customer journey or operational requirement.

**Commercial rule:** Review the live catalog shown in this Academy for the current price, scope and technology. Never quote a number from memory.
$lesson$),
(3,'ProFox Growth & Scale',$lesson$
# ProFox Growth & Scale

**Learning goal:** Recognize when the website has become a strategic growth asset rather than a basic presence.

## ProFox Growth
Growth becomes appropriate when the website needs to support stronger positioning, customer journeys and conversion.

Common fit signals:

- several services or audience types;
- weak current conversion;
- messaging needs professional work;
- the website is central to lead generation;
- multiple customer journeys must be designed;
- the company is investing in marketing;
- stronger search foundations are required;
- a template website limits differentiation.

Do not describe Growth as “Launch with more pages.” The business role is different.

> **“Growth is for a business where the website needs to do more than establish presence—it needs to support positioning, customer journeys and conversion.”**

## ProFox Scale
Scale is designed for established organizations and more sophisticated digital experiences.

Fit signals can include several audiences/journeys, complex content, strong differentiation, a sophisticated brand, a larger evolving site, reusable design components, multiple stakeholders, scalability requirements, or a website that functions as a strategic business asset.

Do not sell Scale by saying, “It costs more because the technology is better.” Sell the business need for a stronger experience and system underneath it.

> **Complexity should be intentional—not merely expensive.**

Never push Scale when Growth properly solves the requirement.

**Commercial rule:** Current pricing and scope come from the live Admin Sales Catalog below.
$lesson$),
(4,'ProFox Apps · Custom Digital Systems',$lesson$
# ProFox Apps — Built Around Your Business

**Learning goal:** Recognize when the customer needs ongoing business capability, not another brochure website.

A website primarily presents information and captures action. A web application performs ongoing business functions.

ProFox Apps may include SaaS products, portals, dashboards, booking/management systems, CRM-style systems, role-based operational tools, databases, APIs, custom workflows and integrations.

Customers often describe the problem without saying “web application.” Listen for statements such as:

- “Our staff manage everything in spreadsheets.”
- “Customers keep calling because they cannot check anything themselves.”
- “We use five different tools.”
- “Every booking is entered manually.”
- “Managers do not have a live dashboard.”
- “Our software does not follow our process.”
- “Customers need to log in.”
- “Different staff need different permissions.”

These are **business-system signals**.

## Custom Digital Experience & Web Application
Custom solutions can involve user roles, permissions, workflows, integrations, databases, security, reporting, notifications, payment systems, migrations and APIs.

A seller does not estimate custom software from imagination.

> **Complex requirement → discovery → technical validation → approved scope → quotation.**

Never casually promise, “Yes, we can build all of that,” before the requirement is understood and validated.
$lesson$),
(5,'Solution Blueprint & Discovery Sprint',$lesson$
# Solution Blueprint & Discovery Sprint

**Learning goal:** Understand why structured discovery is itself a valuable product for complex work.

Discovery is not a delay before the “real project.” For complex work, discovery is how both sides reduce uncertainty and build the right foundation.

Recommend structured discovery when requirements are incomplete, stakeholders disagree, the application has many user roles, integrations are unknown, workflows are unclear, scope could change dramatically, or a reliable custom quotation cannot yet be produced.

> **“Before we ask you to commit to a large build based on assumptions, we should define the users, workflows, requirements and solution properly. The Blueprint gives both sides a clear foundation for the final project.”**

Discovery should create clarity around the problem, users, workflows, features, constraints and next commercial decision.

Do not use discovery to avoid straightforward questions. Use it where complexity genuinely makes assumptions expensive.

**Commercial rule:** The current Discovery product, price and scope are shown from the live Sales Catalog.
$lesson$),
(6,'ProFox Flow · Integrations & Automation',$lesson$
# ProFox Flow — Keep the Journey Moving

**Learning goal:** Recognize communication and process problems that continue after a visitor takes action.

A website can generate an enquiry. Then someone may need to receive it, route it, reply, follow up, schedule a meeting, update CRM, remind the prospect, onboard the customer or trigger an internal action.

When those steps depend entirely on memory and repetitive manual work, opportunities are lost.

Listen for Flow signals:

- “We forget to follow up.”
- “Leads wait too long for a response.”
- “Staff send the same emails manually.”
- “Nothing happens after a form is completed.”
- “We copy information between systems.”
- “Customers miss appointments.”
- “Our onboarding is repetitive.”
- “CRM is not updated consistently.”

These are **journey and process problems**, not merely email problems.

Flow can include email automation, CRM routing, business-process automation, integrations, payment connections and other approved system connections.

> **Automate repetition. Keep human judgment where it matters.**

Never promise to “automate everything.” Understand the process first, then determine which parts should be automated and which should remain human.

Use the live catalog below to see currently approved Flow/integration products and prices.
$lesson$),
(7,'Add-ons & Connected Cross-Selling',$lesson$
# Add-ons & Connected Cross-Selling

**Learning goal:** Use add-ons to complete a real solution—not to inflate a quotation.

The live ProFox catalog contains supporting products across Pages & Content, Lead Generation, Search, Branding, E-commerce and Integrations.

The wrong question is: “How many add-ons can I attach?”

The right question is:

> **“What does this customer journey require that the core project does not already include?”**

## Connected selling examples

A service-business website may reveal slow form follow-up and an existing CRM. A relevant connected solution could include the Web project plus an advanced lead form, CRM connection and approved routing/follow-up capability.

An e-commerce redesign may reveal weak repeat purchase and poor post-purchase communication. A wider opportunity may include the commerce experience plus relevant lifecycle/retention Flow.

A clinic “website” request may reveal patient registration, booking, role-based access, dashboards and reminders. That request may actually belong in ProFox Apps and structured discovery.

> **Cross-sell from discovered need—not commission opportunity.**

If an add-on provides no meaningful business value, do not recommend it.
$lesson$),
(8,'ProFox Care · Continuity After Launch',$lesson$
# ProFox Care — Continuity After Launch

**Learning goal:** Recognize when a customer needs ongoing ownership after the initial project.

The relationship does not necessarily end when a website or system goes live. Ongoing needs may include maintenance, updates, monitoring, improvements, content changes, optimization or priority help.

A useful discovery question is:

> **“Once this is live, who will be responsible for keeping it maintained and improving it?”**

The answer naturally reveals whether an ongoing Care plan is relevant.

Do not invent maintenance commitments or imply that every client needs the highest plan. Match the plan to the expected level of ongoing ownership.

The Academy shows current Care plans and monthly prices directly from the live Admin Sales Catalog. Those live values—not screenshots or memory—are the commercial source of truth.
$lesson$),
(9,'Sell Business Value, Not Technology',$lesson$
# Sell Business Value, Not Technology

**Learning goal:** Translate technical capability into an outcome the buyer understands.

A prospect usually does not wake up thinking “I need React,” “I need Supabase,” or “I need an API.” They think “We are losing enquiries,” “Our software slows down the team,” “Our website makes us look small,” “Customers cannot book properly,” or “Staff repeat this task every day.”

Technology matters in delivery, but the sales conversation should connect it to business value.

## Feature → capability → value

**Responsive implementation** — Better: “Customers get a usable experience whether they arrive from desktop, tablet or phone.”

**Role-based permissions** — Better: “Each user sees and manages only the areas appropriate to their role.”

**CRM integration** — Better: “New enquiries can enter the sales workflow without staff manually copying the information.”

Before presenting a feature, ask yourself:

> **Why should this customer care?**
$lesson$),
(10,'Product Discovery & Matching Method',$lesson$
# Product Discovery & Matching Method

**Learning goal:** Diagnose before recommending and use a simple internal matching framework.

Explore five areas:

## 1. Business
What does the company do? Who is the customer? How do they acquire customers? What objective triggered this conversation?

## 2. Problem
What is not working? How does it affect customers or staff? What happens if nothing changes?

## 3. Journey
How does someone move from prospect to customer? Where do people drop off? Which steps are manual? Which systems are involved?

## 4. Requirement
What must the solution do? Who will use it? What integrations or data are required?

## 5. Commercial decision
Why now? Who approves? What will determine provider selection? What happens after the proposal?

## Internal matching guide

- **Presence problem** → consider Launch.
- **Positioning / growth / conversion problem** → consider Growth.
- **Larger experience or organizational complexity** → consider Scale.
- **Users + data + permissions + workflows** → consider Apps.
- **Undefined complex system** → consider Discovery Sprint.
- **Manual follow-up / repetitive process** → consider Flow.
- **Ongoing ownership after launch** → consider Care.

This is a guide, not a substitute for discovery.

> **Right problem → right capability → right scope.**
$lesson$),
(11,'Boundaries · Confirm, Escalate, Never Oversell',$lesson$
# Confirm, Escalate, Never Oversell

**Learning goal:** Know where product knowledge ends and technical/commercial approval begins.

Confirm before promising unusual integrations, migration complexity, security architecture, high transaction volume, sophisticated e-commerce logic, unusual accessibility/regulatory requirements, AI functionality, exact SEO outcomes, custom API feasibility, third-party limitations, data residency, complex payment flows or exact delivery dates on custom software.

Your credibility increases when the customer sees that you take commitments seriously.

## Never oversell
The correct package is the smallest solution that properly solves the problem.

Selling Scale where Launch genuinely solves the requirement is not sophisticated selling. Adding automation with no real benefit is not sophisticated selling. Building custom software where a simpler solution works is not sophisticated selling.

A trusted seller is willing to say:

> **“You do not need that yet.”**

## Five critical rules
1. Current Admin Sales Catalog values are the commercial source of truth.
2. Custom scope must be understood and validated before commitment.
3. Unknown integrations must be confirmed before they are promised.
4. Never guarantee an outcome outside your control without an approved, supported basis.
5. Never create unauthorized packages, discounts, scope or commitments.
$lesson$),
(12,'Present the Recommendation · Product Standard',$lesson$
# Present the Recommendation

**Learning goal:** Turn discovery into a clear, confident, value-led recommendation.

Use a five-part recommendation:

## 1. What we understood
“Your current site gets traffic, but visitors struggle to understand which service is right for them.”

## 2. Why it matters
“That means marketing reaches the website without consistently turning into qualified enquiries.”

## 3. What we recommend
“I would recommend the Growth-level solution rather than a basic Launch build.”

## 4. Why this level fits
“You need a custom customer journey, stronger messaging and enough depth to organize the services properly—not simply a new visual theme.”

## 5. Next step
“I'll document the agreed requirements so we can prepare the exact approved scope and quotation.”

## ProFox language standard
Our voice is calm, intelligent, concise, certain and human.

Use clear ProFox positioning:

> **We design the digital experiences and systems that move business forward.**

> **ProFox Web — Make every visit matter.**

> **ProFox Apps — Built around your business.**

> **ProFox Flow — Keep the journey moving.**

## The complete model
**Attention → Experience (Web) → Action → Capability (Apps) → Movement (Flow) → Continuity (Care)**

That is how **From site to system.** becomes a sales method rather than only a tagline.

Before the assessment, you should be able to explain what ProFox does, distinguish Web/Apps/Flow, recognize package fit, identify when discovery is needed, use add-ons responsibly, explain Care, translate features into value, use the live catalog correctly and know when to escalate.
$lesson$)
) AS v(sort_order,title,content)
WHERE m.slug='product-packages';

ALTER TABLE public.training_assessment_questions
  ADD COLUMN IF NOT EXISTS assessment_section text NOT NULL DEFAULT 'knowledge',
  ADD COLUMN IF NOT EXISTS case_key text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS critical boolean NOT NULL DEFAULT false;

DELETE FROM public.training_assessment_questions
WHERE module_id=(SELECT id FROM public.training_modules WHERE slug='product-packages' LIMIT 1);

INSERT INTO public.training_assessment_questions(module_id,prompt,options,correct_index,explanation,sort_order,active,assessment_section,case_key,critical)
SELECT m.id,v.prompt,v.options::jsonb,v.correct_index,v.explanation,v.sort_order,true,v.section,v.case_key,v.critical
FROM public.training_modules m
CROSS JOIN (VALUES
(1,'What is the best description of the ProFox product model?','["A list of unrelated technical services","Three connected capabilities—Web, Apps and Flow—assembled around the business problem","Only website design with optional extras","A software resale business"]',1,'ProFox teaches From site to system: Web, Apps and Flow work as connected capabilities around the customer journey.','knowledge','',false),
(2,'What is the primary job of ProFox Web?','["Sell a specific programming language","Create the customer-facing digital experience that helps the right visitor understand, trust and act","Replace every internal business process","Provide only graphic design"]',1,'ProFox Web creates the visible customer experience and should support clarity, trust and action.','knowledge','',false),
(3,'Which situation is generally the strongest Launch fit?','["A straightforward service business needing a focused professional web presence","A multi-role SaaS platform with complex workflows","An enterprise portal with permissions and reporting","A business requiring undefined custom integrations"]',0,'Launch is a focused professional website solution for a relatively straightforward presence and journey.','knowledge','',false),
(4,'Why is Growth not simply “Launch with more pages”?','["Growth always uses a different hosting company","Growth is positioned around stronger messaging, custom journeys, conversion and business growth requirements","Growth cannot include pages","There is no difference"]',1,'Growth has a different business role: positioning, customer journeys and conversion—not merely page count.','knowledge','',false),
(5,'When is Scale most appropriate?','["Whenever the prospect asks for the cheapest option","For established organizations with sophisticated journeys, design systems, scalability or larger digital-experience requirements","Only when the business has no existing website","For every company with more than five pages"]',1,'Scale should be justified by experience/system complexity and strategic importance, not by arbitrary size rules.','knowledge','',false),
(6,'Which customer statement most strongly signals ProFox Apps?','["We need a new color palette","Different staff need different permissions, customers need login access and managers need dashboards","We need a five-page brochure site","We need a new logo only"]',1,'Users, data, permissions, dashboards and workflows are application/system signals.','knowledge','',false),
(7,'What is the purpose of the Solution Blueprint & Discovery Sprint?','["Delay the project unnecessarily","Define users, workflows, requirements and solution direction when complexity makes assumptions risky","Replace every final quotation","Guarantee a fixed development price before discovery"]',1,'Structured discovery reduces uncertainty and creates a sound basis for complex scope and quotation.','knowledge','',false),
(8,'Which problem most strongly signals ProFox Flow?','["Our logo is outdated","Leads arrive but follow-up, routing and repeated communication depend on staff remembering every step","We need a one-page portfolio","Our office needs new furniture"]',1,'Flow addresses communication and process movement after actions occur.','knowledge','',false),
(9,'How should add-ons be selected?','["Attach as many as possible to increase commission","Use only those that complete a discovered customer need not already covered by the core solution","Always attach SEO and automation to every sale","Let the seller choose based on personal preference"]',1,'Add-ons complete a real solution. They are not quotation padding.','knowledge','',false),
(10,'What is a good discovery question for a Care plan?','["Do you want our most expensive monthly plan?","Once this is live, who will be responsible for keeping it maintained and improving it?","Can I add maintenance so my commission increases?","Do you want unlimited support forever?"]',1,'The question reveals the real ownership need after launch without forcing a plan.','knowledge','',false),
(11,'How should a seller translate a CRM integration into value?','["We connect an API","New enquiries can enter the sales workflow without staff manually copying the information","It uses JSON","It is technically impressive"]',1,'Value language explains what changes for the business rather than naming implementation details.','knowledge','',false),
(12,'What is the best internal product-matching principle?','["Most expensive package first","Right problem → right capability → right scope","Every website lead should receive Scale","Technology first, business problem second"]',1,'The seller diagnoses the problem and then matches the capability and scope.','knowledge','',false),
(13,'What should determine the current sellable price and scope for a new quotation?','["The seller’s memory","An old PDF or screenshot","The current Admin-controlled ProFox Sales Catalog and approved quotation process","A competitor website"]',2,'Changing commercial data must come from the current Admin-controlled source of truth.','knowledge','',true),
(14,'Which statement best describes cross-selling at ProFox?','["Add services whenever commission increases","Connect additional capabilities only when discovery reveals a genuine linked need","Cross-selling is never allowed","Every Web deal must include Apps and Flow"]',1,'Connected selling is based on discovered need, not commission opportunity.','knowledge','',false),
(15,'What should a seller do when the prospect asks for a capability they are unsure ProFox can deliver?','["Promise it to keep momentum","Capture the requirement and confirm feasibility/scope with the appropriate team before committing","Ignore the question","Invent a likely answer"]',1,'Professional sellers know when to confirm rather than invent.','knowledge','',true),
(16,'A small consultant needs a credible, focused website with a simple service journey and no complex system requirements. What is the most sensible starting direction?','["ProFox Launch","Custom Web Application","Scale by default","Business Process Automation only"]',0,'A focused professional presence with limited complexity is a strong Launch signal.','scenario','',false),
(17,'A growing B2B company has several services, paid traffic, weak conversion and unclear messaging. Which direction is most appropriate to investigate?','["Launch only because it is cheaper","Growth because the website must support positioning, messaging, journeys and conversion","Custom application without discovery","Care plan only"]',1,'The website is playing a growth/conversion role, which points toward Growth.','scenario','',false),
(18,'An established organization has multiple audiences, a complex information architecture and needs a reusable design system for continued expansion. What should you investigate?','["Launch","Scale","Only a logo refresh","A basic chat integration"]',1,'Sophisticated journeys, reusable components and strategic scale are Scale signals.','scenario','',false),
(19,'A clinic asks for a website but needs patient registration, bookings, staff roles, dashboards and reminders. What should the seller recognize?','["It is definitely a basic website project","It may be an Apps/system opportunity requiring discovery and possibly Flow","Only an SEO add-on is needed","Promise everything inside Launch"]',1,'The requirement includes users, workflows and system behavior, so it goes beyond a normal brochure website.','scenario','',false),
(20,'A prospect describes a custom warehouse integration you have never seen and asks you to guarantee it will work. What is the correct action?','["Guarantee it verbally","Capture the requirement and obtain technical validation before scope or commitment","Tell them all integrations are always included","Add a standard integration price immediately and promise delivery"]',1,'Unknown integrations must be validated before they become commitments.','scenario','',true),
(21,'A customer says staff manually send the same follow-up emails and copy each form lead into CRM. What connected opportunity should you explore?','["Branding only","Flow/automation and an appropriate CRM connection, based on discovery","A larger package only because it costs more","No solution because the website already works"]',1,'The problem is repetitive follow-up and disconnected data movement—strong Flow/integration signals.','scenario','',false),
(22,'A prospect asks for Scale, but discovery shows a simple five-page requirement with no advanced experience or system complexity. What should you do?','["Sell Scale because they asked for it","Explain the smaller appropriate solution and recommend only what the requirement needs","Add more features until Scale becomes necessary","Refuse the project"]',1,'The right package is the smallest solution that properly solves the problem.','scenario','',false),
(23,'A customer wants a guaranteed #1 Google ranking as a condition of purchase. What should you do?','["Guarantee it to close","Explain realistic approved objectives/evidence and do not guarantee an outcome outside ProFox control","Promise it verbally but not in writing","Guarantee it only on Scale"]',1,'Unsupported outcome guarantees are not allowed.','scenario','',true),
(24,'A client asks you to create a special package, add free custom functionality and reduce the price without Admin involvement. What should you do?','["Agree because the customer is high-value","Do not create unauthorized scope or commercial terms; document the request and follow the approval process","Change the quotation privately","Promise it first and seek approval later"]',1,'Sellers cannot create unauthorized packages, discounts or scope.','scenario','',true),
(25,'A website prospect has an existing CRM and complains that good leads wait hours before anyone responds. What is the best selling approach?','["Only sell the website that was originally requested","Explore the website journey and the follow-up problem, then recommend connected Web/Flow capabilities only if discovery supports them","Automatically add every integration","Tell them CRM is outside ProFox capability"]',1,'A trained seller sees the whole journey and cross-sells only from a real connected need.','scenario','',false),
(26,'CASE 1 — Local service company: The current site looks dated, is hard to use on mobile and has only four core services. Leads call or complete one simple form. What is the primary problem?','["Complex internal workflow management","Credibility and focused website experience","Multi-tenant SaaS architecture","Enterprise data migration"]',1,'The core issue is a focused customer-facing experience and credibility problem.','recommendation','case-local-service',false),
(27,'CASE 1 — Which primary ProFox service/package direction is the best starting recommendation?','["ProFox Launch","Custom Web Application","Scale","Business Process Automation only"]',0,'A focused small service website with straightforward conversion is a strong Launch fit.','recommendation','case-local-service',false),
(28,'CASE 1 — The owner also wants visitors to book consultations directly. What is the best add-on logic?','["Recommend a relevant booking/calendar integration if it fits the workflow","Add every Lead Gen item","Upgrade automatically to Scale","Build a custom SaaS platform"]',0,'The booking requirement creates a specific add-on need; do not inflate the rest of the scope.','recommendation','case-local-service',false),
(29,'CASE 1 — What information is still most useful before finalizing scope?','["Which programming language the owner likes","Exact pages/content, desired calls-to-action, brand/content readiness and booking workflow","The owner’s favorite color only","Nothing; quote immediately without clarification"]',1,'Even a focused website requires enough discovery to define content, actions and workflow accurately.','recommendation','case-local-service',false),
(30,'CASE 1 — What is the best next step?','["Promise a final delivery date before scope","Document the agreed requirements and prepare the approved scope/quotation using current catalog data","Collect money personally","Tell the client to choose technology"]',1,'Move from understood requirement into the controlled quotation process.','recommendation','case-local-service',false),
(31,'CASE 2 — Growing B2B company: Paid campaigns drive traffic, but messaging is unclear across 10+ services and conversion is weak. What is the primary problem?','["Only server capacity","Positioning, customer journey and conversion","Staff payroll","Custom permissions system"]',1,'The business needs a stronger strategic web experience, not merely technical hosting changes.','recommendation','case-growth-b2b',false),
(32,'CASE 2 — Which package direction is the strongest starting recommendation?','["Launch","Growth","Custom application regardless of need","Care only"]',1,'Multiple services, messaging and conversion needs are strong Growth signals.','recommendation','case-growth-b2b',false),
(33,'CASE 2 — Discovery reveals marketing cannot tell which campaigns generate qualified enquiries. What supporting capability is relevant?','["Advanced conversion tracking if it fits the measurement plan","Random branding add-ons","A custom application automatically","No additional capability can help"]',0,'Measurement is a discovered need, so appropriate conversion tracking may complete the solution.','recommendation','case-growth-b2b',false),
(34,'CASE 2 — What is still important to understand before the recommendation is final?','["Traffic sources, audience groups, priority services, conversion actions, decision process and measurement requirements","Only the company logo file","Nothing once Growth is mentioned","A competitor’s exact codebase"]',0,'Good product matching still requires discovery around audiences, journeys, measurement and decision context.','recommendation','case-growth-b2b',false),
(35,'CASE 2 — How should the seller present Growth?','["It has more pages so it costs more","Connect the custom messaging/journey/conversion requirement to why Growth fits, then agree the next scoping step","Say it uses modern technology and stop there","Guarantee a specific revenue increase"]',1,'Recommendation should connect understood problem → impact → recommended level → why it fits → next step.','recommendation','case-growth-b2b',false),
(36,'CASE 3 — Clinic operations: Patients need registration and booking; staff need different permissions; managers need dashboards; reminders should be automated. What is the primary problem class?','["Basic brochure website only","Operational system plus connected customer journey","Logo design only","Blog content only"]',1,'Users, data, permissions, workflows and automation indicate an operational system opportunity.','recommendation','case-clinic-system',false),
(37,'CASE 3 — Which primary ProFox capability should lead the recommendation?','["ProFox Apps, with structured discovery before a committed custom scope","Launch only","Care plan only","A single landing-page add-on"]',0,'The central requirement is custom operational capability; structured discovery should precede a committed build scope.','recommendation','case-clinic-system',false),
(38,'CASE 3 — Which connected capability should also be explored because reminders and onboarding actions must happen automatically?','["ProFox Flow","Logo Refresh","Additional Standard Page only","No connected capability"]',0,'Automated reminders and process movement are Flow signals.','recommendation','case-clinic-system',false),
(39,'CASE 3 — What information must be clarified before promising the application scope?','["User roles, workflows, data, integrations, security/privacy requirements, reporting and operational rules","Only the preferred button color","Nothing; custom apps can be estimated from one sentence","Only the domain name"]',0,'Custom systems require careful discovery and validation across users, workflows, data, integrations and constraints.','recommendation','case-clinic-system',false),
(40,'CASE 3 — What is the best next commercial step?','["Promise a fixed full-build price immediately","Recommend the appropriate Solution Blueprint/Discovery process, then move to a validated scope and approved quotation","Create an unofficial package","Guarantee every requested integration before technical review"]',1,'Complex custom work should move through discovery and validation before a final committed scope/quotation.','recommendation','case-clinic-system',false)
) AS v(sort_order,prompt,options,correct_index,explanation,section,case_key,critical)
WHERE m.slug='product-packages';

CREATE OR REPLACE FUNCTION public.get_product_package_training(p_module_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_products jsonb; v_questions jsonb; v_passing integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF NOT public.can_access_sales_academy_module(p_module_id) THEN RAISE EXCEPTION 'Training module access denied.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.training_modules WHERE id=p_module_id AND slug='product-packages' AND active=true) THEN RAISE EXCEPTION 'Product & Package Training module not found.'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'code',p.code,'name',p.name,'category',p.category,'productType',p.product_type,'priceMode',p.price_mode,'basePrice',p.base_price,'currency',p.currency,'billingPeriod',p.billing_period,'shortDescription',p.short_description,'scope',p.scope,'technology',p.technology,'managerApprovalRequired',p.manager_approval_required,'sortOrder',p.sort_order) ORDER BY p.sort_order),'[]'::jsonb) INTO v_products FROM public.sales_products p WHERE p.active=true;
  SELECT COALESCE(passing_score,80) INTO v_passing FROM public.training_modules WHERE id=p_module_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',q.id,'prompt',q.prompt,'options',q.options,'sortOrder',q.sort_order,'section',q.assessment_section,'caseKey',q.case_key) ORDER BY q.sort_order),'[]'::jsonb) INTO v_questions FROM public.training_assessment_questions q WHERE q.module_id=p_module_id AND q.active=true;
  RETURN jsonb_build_object('passingScore',v_passing,'products',v_products,'questions',v_questions);
END; $$;

CREATE OR REPLACE FUNCTION public.submit_product_package_assessment(p_progress_id uuid,p_answers integer[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_progress public.user_training_progress%ROWTYPE; v_module public.training_modules%ROWTYPE; v_question public.training_assessment_questions%ROWTYPE; v_count integer; v_index integer:=0; v_correct integer:=0; v_score integer; v_critical_misses integer:=0; v_passed boolean; v_feedback jsonb:='[]'::jsonb; v_event_time timestamptz:=clock_timestamp();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT * INTO v_progress FROM public.user_training_progress WHERE id=p_progress_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Training progress record not found.'; END IF;
  IF v_progress.user_id<>auth.uid() THEN RAISE EXCEPTION 'You may only submit your own product assessment.'; END IF;
  SELECT * INTO v_module FROM public.training_modules WHERE id=v_progress.module_id AND active=true;
  IF NOT FOUND OR v_module.slug<>'product-packages' THEN RAISE EXCEPTION 'This progress record is not Product & Package Training.'; END IF;
  SELECT count(*) INTO v_count FROM public.training_assessment_questions q WHERE q.module_id=v_module.id AND q.active=true;
  IF v_count=0 THEN RAISE EXCEPTION 'No active product assessment questions are configured.'; END IF;
  IF COALESCE(array_length(p_answers,1),0)<>v_count THEN RAISE EXCEPTION 'Exactly % assessment answers are required.',v_count; END IF;
  FOR v_question IN SELECT * FROM public.training_assessment_questions q WHERE q.module_id=v_module.id AND q.active=true ORDER BY q.sort_order LOOP
    v_index:=v_index+1;
    IF p_answers[v_index]=v_question.correct_index THEN v_correct:=v_correct+1; ELSIF v_question.critical THEN v_critical_misses:=v_critical_misses+1; END IF;
    v_feedback:=v_feedback||jsonb_build_array(jsonb_build_object('questionId',v_question.id,'correct',p_answers[v_index]=v_question.correct_index,'critical',v_question.critical,'explanation',v_question.explanation,'section',v_question.assessment_section,'caseKey',v_question.case_key));
  END LOOP;
  v_score:=round((v_correct::numeric*100)/v_count)::integer;
  v_passed:=v_score>=COALESCE(v_module.passing_score,80) AND v_critical_misses=0;
  PERFORM set_config('profox.training_product_rpc','1',true);
  INSERT INTO public.training_assignments(user_id,module_id,progress_id,submission_data,created_at,updated_at) VALUES(v_progress.user_id,v_module.id,v_progress.id,jsonb_build_object('type','product_package_assessment','answers',to_jsonb(p_answers),'score',v_score,'passed',v_passed,'criticalMisses',v_critical_misses,'submittedAt',v_event_time),v_event_time,v_event_time);
  UPDATE public.user_training_progress SET status=CASE WHEN v_passed THEN 'Completed' ELSE 'Retry Required' END, score=v_score, progress_percent=CASE WHEN v_passed THEN 100 ELSE 75 END, completed_at=CASE WHEN v_passed THEN v_event_time ELSE NULL END,updated_at=v_event_time WHERE id=v_progress.id;
  RETURN jsonb_build_object('score',v_score,'passed',v_passed,'passingScore',COALESCE(v_module.passing_score,80),'criticalMisses',v_critical_misses,'criticalPass',v_critical_misses=0,'feedback',v_feedback,'status',CASE WHEN v_passed THEN 'Completed' ELSE 'Retry Required' END);
END; $$;

CREATE OR REPLACE FUNCTION public.protect_training_progress_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_module public.training_modules%ROWTYPE; v_quiz_rpc text:=COALESCE(current_setting('profox.training_quiz_rpc',true),''); v_agreement_rules_rpc text:=COALESCE(current_setting('profox.training_agreement_rules_rpc',true),''); v_product_rpc text:=COALESCE(current_setting('profox.training_product_rpc',true),'');
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Training progress may only be changed by its owner or an Admin.'; END IF;
  SELECT * INTO v_module FROM public.training_modules WHERE id=NEW.module_id;
  IF NOT FOUND OR v_module.active IS NOT TRUE THEN RAISE EXCEPTION 'Training module is missing or inactive.'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_status IS NOT NULL OR COALESCE(trim(NEW.feedback),'')<>'' THEN RAISE EXCEPTION 'Training review fields are Admin-only.'; END IF;
    IF NEW.score IS NOT NULL AND v_quiz_rpc<>'1' AND v_product_rpc<>'1' THEN RAISE EXCEPTION 'Training scores must be recorded through the secure quiz/review workflow.'; END IF;
    IF v_module.requires_admin_review AND NEW.status IN ('Passed','Completed','Retry Required') THEN RAISE EXCEPTION 'This module requires Admin review before it can be passed.'; END IF;
  ELSE
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.module_id IS DISTINCT FROM OLD.module_id THEN RAISE EXCEPTION 'Training progress ownership and module are immutable.'; END IF;
    IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR NEW.review_status IS DISTINCT FROM OLD.review_status OR NEW.feedback IS DISTINCT FROM OLD.feedback THEN RAISE EXCEPTION 'Training review fields are Admin-only.'; END IF;
    IF NEW.score IS DISTINCT FROM OLD.score AND v_quiz_rpc<>'1' AND v_product_rpc<>'1' THEN RAISE EXCEPTION 'Training scores must be recorded through the secure quiz/review workflow.'; END IF;
    IF v_module.requires_admin_review AND NEW.status IN ('Passed','Completed') AND OLD.status IS DISTINCT FROM NEW.status THEN RAISE EXCEPTION 'This module requires Admin review before it can be passed.'; END IF;
    IF v_module.slug IN ('product-training','product-package-training','product-packages') AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.score IS DISTINCT FROM OLD.score) AND NEW.status IN ('Passed','Retry Required','Completed') AND v_quiz_rpc<>'1' AND v_product_rpc<>'1' THEN RAISE EXCEPTION 'Product training results must be recorded through the secure product assessment workflow.'; END IF;
    IF v_module.slug='agreement-rules' THEN
      IF NEW.score IS DISTINCT FROM OLD.score AND v_quiz_rpc<>'1' THEN RAISE EXCEPTION 'Agreement & Sales Rules assessment scores must be recorded through the secure assessment workflow.'; END IF;
      IF NEW.status='Retry Required' AND OLD.status IS DISTINCT FROM NEW.status AND v_quiz_rpc<>'1' THEN RAISE EXCEPTION 'Agreement & Sales Rules retry status must come from the secure assessment workflow.'; END IF;
      IF NEW.status IN ('Passed','Completed') AND OLD.status IS DISTINCT FROM NEW.status AND v_agreement_rules_rpc<>'1' THEN RAISE EXCEPTION 'Agreement & Sales Rules can only be completed after the secure knowledge check and acknowledgement.'; END IF;
    END IF;
  END IF;
  IF v_module.requires_admin_review AND NEW.status NOT IN ('Not Started','In Progress','Submitted','Retry Required') THEN RAISE EXCEPTION 'Reviewed modules may only be submitted by trainees; pass/fail is Admin-controlled.'; END IF;
  IF NOT v_module.requires_admin_review AND NEW.status IN ('Passed','Completed') AND v_module.passing_score IS NOT NULL AND COALESCE(NEW.score,0)<v_module.passing_score THEN RAISE EXCEPTION 'Passing score of % is required for this module.',v_module.passing_score; END IF;
  NEW.progress_percent:=GREATEST(0,LEAST(COALESCE(NEW.progress_percent,0),100)); NEW.attempts:=GREATEST(COALESCE(NEW.attempts,0),0); RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.get_product_package_training(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.submit_product_package_assessment(uuid,integer[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_product_package_training(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_product_package_assessment(uuid,integer[]) TO authenticated;
