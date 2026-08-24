# Module 4 HVAC content snapshot

HVAC content is operational Academy content stored in Supabase and editable from Admin. The production catalog currently contains:

- 25 baseline fluency prompts
- 39 guided HVAC/HVACR business lessons
- 5 written business-diagnostic prompts
- 60 server-scored certification questions
  - 20 industry-knowledge questions
  - 20 diagnosis scenarios
  - 10 ProFox architecture/recommendation cases
  - 10 critical trust/compliance questions
- Passing standard: 85% overall and zero critical misses

The lesson coverage includes residential/commercial HVAC, HVACR/refrigeration, revenue models, seasonality/capacity, terminology, emergency service, planned replacement, preventive maintenance, maintenance memberships, call intake, dispatch, technician workflow, service-to-replacement handoff, sizing/load-calculation boundaries, quality installation, financing, lead sources, speed-to-lead, website/local search, reviews, callbacks, inventory, customer communication, IAQ claims, refrigerant compliance, gas/electrical/combustion safety, technician safety/regional rules, symptom-vs-root-cause diagnosis, digital maturity, technology ecosystem, discovery, ProFox Web/Apps/Flow mapping, and owner/business outcome thinking.

The live content is intentionally Admin-editable rather than hard-coded into React. The schema/RPC migration preserves the secure delivery and completion rules; the production content itself can be maintained through Niche Catalog & Builder plus Niche Academy Controls.
