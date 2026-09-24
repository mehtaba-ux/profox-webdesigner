-- Persist the complete candidate-facing hiring offer in CMS so Admin edits are the source of truth.
UPDATE public.content c
SET data=(
  SELECT jsonb_agg(
    CASE WHEN p->>'id'='careers' OR p->>'slug'='careers' THEN
      p || jsonb_build_object(
        'careersData',
        COALESCE(p->'careersData','{}'::jsonb) || jsonb_build_object(
          'hero',COALESCE(p->'careersData'->'hero','{}'::jsonb) || jsonb_build_object(
            'badge','REMOTE · COMMISSION-BASED · INTERNATIONAL SALES',
            'title','Independent Sales Representative',
            'line','Help businesses move from site to system.',
            'description','Represent ProFox with businesses in the US, UK, Canada and Australia. Find qualified prospects, start useful conversations, run discovery calls and close website, application and automation projects.'
          ),
          'role',COALESCE(p->'careersData'->'role','{}'::jsonb) || jsonb_build_object(
            'location','Remote · Worldwide',
            'type','Independent contractor · Commission-only',
            'experience','6+ months sales experience',
            'summary','This role is for salespeople who can work independently, communicate clearly in English and stay consistent from prospect research through follow-up and close.'
          ),
          'compensation',jsonb_build_array(
            jsonb_build_object('label','Website Package','price','$599','rate','10%','example','$59.90'),
            jsonb_build_object('label','Business Package','price','$2,379','rate','12%','example','$285.48'),
            jsonb_build_object('label','Premium Package','price','$5,799+','rate','15%','example','$869.85+'),
            jsonb_build_object('label','Custom Web Application','price','Approved quotation','rate','10–15%','example','Set per quotation')
          ),
          'responsibilities',jsonb_build_array(
            'Research and qualify businesses that fit ProFox services.',
            'Use thoughtful email, LinkedIn, phone and personalized outreach to start conversations.',
            'Book and conduct discovery meetings by Zoom or Google Meet.',
            'Understand the client’s goals, current website or workflow, decision process and next step.',
            'Present the right ProFox Web, ProFox Apps or ProFox Flow service without overselling.',
            'Keep leads, follow-ups, meetings and quotations accurate in the ProFox CRM.',
            'Close responsibly and hand verified sales into the delivery system.'
          ),
          'requirements',jsonb_build_array(
            'At least 6 months of sales, business development or client-facing experience.',
            'Clear spoken and written English for international client conversations.',
            'Confidence conducting professional video meetings and asking discovery questions.',
            'A reliable laptop, internet connection and a suitable place for client calls.',
            'Comfort with a commission-only independent contractor model.',
            'Ability to research prospects, follow up consistently and work without daily supervision.'
          ),
          'process',jsonb_build_array(
            jsonb_build_object('title','Apply','text','Tell us about your experience and send a 60–120 second introduction video.'),
            jsonb_build_object('title','Review & assessment','text','We review communication, sales judgment, lead research and CRM readiness.'),
            jsonb_build_object('title','Agreement','text','Selected candidates review and sign the ProFox Independent Sales Partner Agreement.'),
            jsonb_build_object('title','Sales Academy','text','Complete the required 20-module training, practical reviews and final certification.'),
            jsonb_build_object('title','Final approval','text','ProFox reviews training evidence and activation readiness.'),
            jsonb_build_object('title','Start selling','text','Approved representatives receive active sales access and begin managing their own pipeline.')
          )
        )
      )
    ELSE p END
  )
  FROM jsonb_array_elements(c.data) p
)
WHERE c.id='customPages' AND jsonb_typeof(c.data)='array';
