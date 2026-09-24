-- Module 1 — Welcome to ProFox
-- Approved seller-facing curriculum, split into clear sequential lessons.
-- All substantive content remains editable through the existing Admin Curriculum & Module Editor.

UPDATE public.training_modules
SET description = 'Understand who ProFox is, how our three connected service families work, your role as a Sales Partner, and the standards expected throughout Sales Academy & Onboarding.',
    module_type = 'lesson',
    required = true,
    active = true,
    requires_admin_review = false,
    updated_at = now()
WHERE slug = 'welcome';

DELETE FROM public.training_lessons
WHERE module_id = (SELECT id FROM public.training_modules WHERE slug = 'welcome' LIMIT 1);

INSERT INTO public.training_lessons (module_id, title, content, video_url, sort_order, active, updated_at)
SELECT m.id, v.title, v.content, '', v.sort_order, true, now()
FROM public.training_modules m
CROSS JOIN (VALUES
(1, 'Welcome to ProFox', $lesson$
# Welcome to ProFox

Welcome to ProFox.

You are beginning the first step of the **ProFox Sales Academy & Onboarding** program.

This Academy is designed to help you understand **who ProFox is, what we build, how we work, how we serve clients, and how you will represent the company as a Sales Partner.**

You do not need to memorize everything immediately. Each module will take you through one part of the ProFox sales process in a clear, practical sequence.

By the end of the Academy, you should understand the complete journey from finding the right prospect to handing a successful sale over to the ProFox delivery team.

## Who We Are

ProFox is a **digital design and technology company**.

We design digital experiences and systems that help businesses communicate more clearly, operate more effectively, and move forward.

Our positioning is simple:

> **We design the digital experiences and systems that move business forward.**

Our work is not limited to building a website and walking away.

We look at the wider business journey:

- How customers discover the business.
- What they experience online.
- How they take action.
- What happens after they become a lead or customer.
- How technology can make that journey work better.

That thinking is reflected in our core brand idea:

## **From site to system.**
$lesson$),

(2, 'What “From Site to System” Means', $lesson$
# What “From Site to System” Means

A website is often the first part of a customer's digital experience, but it is rarely the entire experience.

A business may also need:

- a system for managing enquiries;
- a custom application;
- automated follow-up;
- email communication;
- internal workflows;
- booking or customer-management processes;
- connected tools that reduce repetitive work.

ProFox looks at these parts as one connected business journey.

Our belief is:

> **The best digital experiences do not work alone.**

That is why we do not think about websites, applications and automation as disconnected services.

We connect what customers see with the systems the business needs to run.
$lesson$),

(3, 'The Three ProFox Service Families', $lesson$
# The Three ProFox Service Families

ProFox organizes its core capabilities into three clear service families.

## ProFox Web
### Website Design & Development

ProFox Web creates websites designed around what customers need to:

**understand, feel and do next.**

The goal is not simply to create something visually attractive.

The website must help the business communicate clearly, build confidence and move visitors toward the right action.

Examples may include:

- business websites;
- service websites;
- landing pages;
- e-commerce experiences;
- website redesigns;
- custom WordPress development;
- conversion-focused digital experiences.

## ProFox Apps
### Custom Web Application Development

ProFox Apps creates applications shaped around the actual workflows, users and operating needs of a business.

Instead of forcing a business into a generic system, we can build technology around the way that business needs to work.

Examples may include:

- CRM systems;
- operational applications;
- management platforms;
- customer portals;
- internal dashboards;
- booking systems;
- workflow applications;
- custom business tools.

The idea is simple:

> **Built around your business.**

## ProFox Flow
### Email Marketing & Business Automation

ProFox Flow connects communication and repetitive business processes so work can continue without everything depending on manual follow-up.

Examples may include:

- lead nurture;
- automated email journeys;
- enquiry follow-up;
- customer lifecycle communication;
- reminders;
- internal workflow automation;
- sales automation;
- business process automation.

The purpose is to:

> **Keep the journey moving.**
$lesson$),

(4, 'One Journey. Three Connected Capabilities.', $lesson$
# One Journey. Three Connected Capabilities.

The three ProFox service families should not be viewed as separate businesses.

They work together.

> **ProFox Web · ProFox Apps · ProFox Flow**

A client may initially come to us for only one service.

For example, they may ask for a website.

But during discovery, we may learn that the real business problem also involves:

- poor lead follow-up;
- repetitive administrative work;
- disconnected customer information;
- an inefficient booking process;
- an outdated internal application.

Your responsibility as a Sales Partner is **not to push additional services simply to increase the sale.**

Your responsibility is to understand the business well enough to identify what actually needs to be solved.

That is the ProFox approach.
$lesson$),

(5, 'We Sell Solutions, Not Features', $lesson$
# We Sell Solutions, Not Features

A customer usually does not wake up wanting:

“React.”

“WordPress.”

“Supabase.”

“Automation workflows.”

Those are technologies.

The customer usually wants something more practical:

- **More enquiries.**
- **A clearer website.**
- **Less repetitive work.**
- **A better customer experience.**
- **A system that fits their business.**
- **A smoother sales process.**
- **Better visibility over operations.**

Technology is how we may solve the problem.

It is not the starting point of the conversation.

As a ProFox Sales Partner, always begin with:

> **What is the business trying to improve?**
$lesson$),

(6, 'Your Role as a ProFox Sales Partner', $lesson$
# Your Role as a ProFox Sales Partner

Your role is bigger than sending cold messages.

A strong ProFox Sales Partner helps connect the right businesses with the right ProFox solution.

## Research
Find businesses that are suitable for ProFox.

## Qualification
Understand whether there is a genuine need and whether the opportunity is worth pursuing.

## Outreach
Start a relevant and professional conversation.

## Discovery
Understand the business, problem, priorities, decision process and desired outcome.

## Solution
Connect the customer's needs with the appropriate ProFox service.

## Proposal & Follow-Up
Help the prospect understand the proposed solution and next step.

## Sale
Guide an appropriate opportunity toward an approved purchase.

## Handover
Give the ProFox delivery team the information they need to serve the customer properly.

You will learn each of these areas in detail during the Academy.
$lesson$),

(7, 'What ProFox Expects From You', $lesson$
# What ProFox Expects From You

We expect every Sales Partner to represent ProFox professionally.

## Be accurate
Do not invent features, prices, timelines, results or capabilities.

## Be curious
Understand the customer's situation before recommending a solution.

## Be clear
Use simple language rather than unnecessary technical terminology.

## Be respectful
Never pressure, mislead, spam or manipulate a prospect.

## Keep records accurate
Important sales activity belongs in the ProFox CRM.

## Protect information
Customer, prospect and company information must be handled responsibly.

## Follow the approved process
Pricing, quotations, discounts, payment instructions and contractual commitments must follow the authorized ProFox process.

## Think long term
A bad sale can create problems for the customer, the delivery team and the company.

The objective is not merely:

**“Close the deal.”**

The objective is:

> **Close the right deal, in the right way.**
$lesson$),

(8, 'How Customers Should Experience ProFox', $lesson$
# How We Want Customers to Experience ProFox

Every interaction contributes to the ProFox brand.

A customer should experience ProFox as:

## Clear
They understand what we mean.

## Professional
We respect their business and their time.

## Capable
We understand the problem before recommending technology.

## Dependable
We do what we say we will do.

## Human
We communicate like people, not scripts.

You will receive scripts, frameworks and playbooks during the Academy.

Use them as guidance.

Do not sound like a robot.
$lesson$),

(9, 'Trust Comes Before the Sale', $lesson$
# Trust Comes Before the Sale

ProFox does not need exaggerated claims to appear credible.

Trust should come from:

- **Proof of work.**
- **Understanding the problem.**
- **A clear solution.**
- **A professional process.**
- **Consistent communication.**
- **Realistic commitments.**

Never promise something simply because you think it will help you close a prospect.

If you are unsure about:

- technical feasibility;
- pricing;
- timeline;
- scope;
- discounts;
- contractual terms;
- custom requirements;

say that you will confirm it with the appropriate ProFox team member.

That is professional selling.
$lesson$),

(10, 'Your Sales Academy Journey', $lesson$
# Your Sales Academy Journey

This Welcome module is only the beginning.

The complete ProFox Sales Academy contains **20 required modules** covering subjects such as:

- agreement and sales rules;
- products and packages;
- niche knowledge;
- lead research;
- personalized outreach;
- follow-up;
- meeting booking;
- discovery calls;
- call practice;
- product presentation;
- objection handling;
- closing;
- quotations;
- payments;
- CRM usage;
- meetings;
- confidentiality;
- data protection;
- final certification.

Some modules are learning modules.

Some include quizzes.

Some include practical exercises.

Some require Admin review.

You must complete the required Academy requirements before final Sales Partner activation.
$lesson$),

(11, 'Training Is Not Activation', $lesson$
# Training Is Not Activation

Receiving access to training does **not** mean that you are already authorized to operate as an active ProFox Sales Partner.

The Academy is part of the onboarding and approval process.

Before receiving final live sales access, the required:

> **agreement → training → practical assessments → certification → Admin approval**

must be completed.

This protects you, our customers and ProFox.
$lesson$),

(12, 'How to Approach the Academy', $lesson$
# How to Approach the Academy

Do not rush simply to finish the modules.

For every lesson, ask yourself:

> **Do I understand this well enough to use it with a real prospect?**

If not, review it again.

Take notes.

Practice the examples.

Complete practical activities properly.

A seller who understands the process will normally perform much better than someone who has simply memorized scripts.
$lesson$),

(13, 'The ProFox Sales Mindset', $lesson$
# The ProFox Sales Mindset

As you continue through the Academy, remember five principles:

## Understand before recommending.
Do not diagnose a business before listening to it.

## Value before pressure.
Give prospects a reason to continue the conversation.

## Clarity before complexity.
Simple explanations usually sell better than technical demonstrations.

## Fit before commission.
Recommend what makes sense for the customer.

## Relationship before transaction.
A customer may stay with ProFox far longer than the initial project.

Your first sale can become the beginning of a much larger business relationship.
$lesson$),

(14, 'Success, Review & Acknowledgement', $lesson$
# What Success Looks Like

A successful ProFox Sales Partner is not simply someone who sends the most messages.

Success means consistently being able to:

- **identify good opportunities;**
- **start relevant conversations;**
- **understand business problems;**
- **communicate ProFox clearly;**
- **handle conversations professionally;**
- **maintain accurate CRM records;**
- **move qualified opportunities forward;**
- **close appropriate business;**
- **handover clients without confusion.**

The remaining Sales Academy modules are designed to teach you how to do that.

---

# Before You Continue

You should now understand:

- what ProFox is;
- what **From site to system.** means;
- the difference between ProFox Web, ProFox Apps and ProFox Flow;
- why we start with the business problem instead of technology;
- your role in the sales journey;
- the standard expected when representing ProFox;
- why trust and accuracy matter;
- how the Sales Academy fits into your onboarding;
- why completing training does not automatically mean activation.

## Module 1 Acknowledgement

**I understand the purpose of ProFox, its three core service families, the role of a ProFox Sales Partner and the professional standards expected during the Sales Academy and future sales activity.**

When you are ready, select **Complete Module** below to confirm this acknowledgement and finish Module 1.

### Next Module
**Module 2 — Agreement & Sales Rules**
$lesson$)
) AS v(sort_order, title, content)
WHERE m.slug = 'welcome';
