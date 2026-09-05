-- Refresh the public Content Writer careers copy while preserving the internal
-- content_writer role and recruitment controls.

update public.career_jobs
set
  title = 'Content Writer — Website & Conversion Copy',
  short_summary = 'Research real businesses, write clear conversion-focused website content, and get paid per project with a $1,000–$1,500+ monthly earning opportunity based on project availability, capacity and performance.',
  description = 'Join the ProFox Content team as a remote, project-based independent Content Writer. You will research client businesses and customers, structure website messaging, write conversion-focused copy, verify important claims, complete quality review and prepare approved content for UI/UX implementation. Strong performers who build at least six months of consistently high-quality, reliable service can earn the opportunity to transition into a salaried ProFox role, with salary and employment terms discussed at that time.',
  engagement_type = 'Independent Contractor / Project-Based',
  experience = 'Professional website, conversion, UX or commercial writing experience required',
  responsibilities = jsonb_build_array(
    'Research the client business, services, customers, offer, competitors and project objectives before writing.',
    'Understand customer intent, questions, objections and decision-making needs using available project evidence.',
    'Turn scattered information into a clear website message hierarchy and customer journey.',
    'Write headlines, service sections, supporting copy, proof positioning, calls to action and other project-specific website content.',
    'Verify important claims and never invent statistics, credentials, testimonials, guarantees, comparisons or results.',
    'Review your own work for accuracy, clarity, structure, tone, consistency and conversion logic before submitting.',
    'Respond professionally to editorial, fact-checking, SEO/conversion, project and client feedback.',
    'Prepare structured, approved content for a clear handoff to the UI/UX team.'
  ),
  requirements = jsonb_build_array(
    'Strong written English and the ability to make complex ideas clear and natural.',
    'Demonstrable website, landing-page, conversion, UX, service-page or similar commercial writing experience.',
    'Research discipline and the ability to separate verified facts from assumptions and missing information.',
    'Strong information-structure and message-hierarchy skills.',
    'Commercial awareness of how website copy helps the right customer understand an offer and decide what to do next.',
    'Professional feedback and revision discipline.',
    'Reliable laptop, internet connection and approximately 20 hours per week of available project capacity when actively accepting work.'
  ),
  selection_process = jsonb_build_array(
    jsonb_build_object('title','Application','text','Submit your details, current CV/resume and a short professional introduction video.'),
    jsonb_build_object('title','Initial Review','text','We review relevant experience, communication, availability, reliability and overall role fit.'),
    jsonb_build_object('title','Portfolio Review','text','Shortlisted applicants receive a secure request to submit three structured case studies showing their experience and contribution.'),
    jsonb_build_object('title','Content Assessment','text','Complete a role-specific assessment covering clarity, structure, content judgment and commercial thinking.'),
    jsonb_build_object('title','Conditional Selection & Agreement','text','Successful applicants review and accept the approved project-based Content Writer contractor agreement.'),
    jsonb_build_object('title','Content Academy','text','Complete the required ProFox Content training and learn the delivery and quality standards.'),
    jsonb_build_object('title','Practical Certification','text','Complete production-style work that is independently reviewed. A minimum 90% score is required.'),
    jsonb_build_object('title','Production Approval','text','Complete the required approval and system-access process before becoming eligible for ProFox client projects.')
  ),
  compensation = jsonb_build_array(
    jsonb_build_object('label','Project-Based Payment','rate','Paid per accepted project according to the agreed project fee and payment terms.'),
    jsonb_build_object('label','Monthly Earning Opportunity','price','$1,000–$1,500+','example','Potential only; actual earnings depend on available projects, accepted fees, capacity, performance and successful delivery.'),
    jsonb_build_object('label','6-Month Career Path','rate','After at least six months of consistently strong quality, reliability and service, qualifying writers can be offered the opportunity to transition into a salaried ProFox role. Salary and terms are discussed at that time.')
  ),
  role_details = coalesce(role_details, '{}'::jsonb) || jsonb_build_object(
    'publicTitle','Content Writer — Website & Conversion Copy',
    'earningOpportunity','$1,000–$1,500+ per month',
    'earningCurrency','USD',
    'earningGuaranteed',false,
    'earningDisclaimer','Potential project-based earnings are not guaranteed and depend on available projects, project fees, accepted workload, capacity, performance and successful delivery.',
    'salaryPathAfterMonths',6,
    'salaryPathPerformanceBased',true,
    'salaryPathGuaranteed',false,
    'salaryPathNote','After at least six months of consistently strong quality, reliability and service, qualifying writers can be offered the opportunity to transition into a salaried ProFox role. Salary, responsibilities and employment terms are discussed at that time.'
  ),
  application_cta = 'Apply for Content Writer',
  seo_title = 'Content Writer — Website & Conversion Copy Careers | ProFox',
  seo_description = 'Apply for remote, project-based Content Writer work at ProFox. Paid per project, with a $1,000–$1,500+ monthly earning opportunity based on project availability and performance, plus a performance-based path toward a salaried role after 6+ months.',
  updated_at = now()
where slug = 'content-writer';
