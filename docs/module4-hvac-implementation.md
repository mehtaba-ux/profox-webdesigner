# Module 4 — HVAC + Extensible Niche Academy

Module 4 now uses a reusable niche catalog rather than requiring every industry to be built at once.

## Current required certifications

1. Roofing Contractors
2. HVAC & Climate Control

A learner completes Module 4 only after all **required + published** niche tracks are certified. Future Coming Soon or Draft tracks do not block Module 5.

## Planned niche catalog

The Academy reserves Plumbing, Medical & Specialty Clinics, Dental Practices, Hotels & Hospitality, Real Estate Agencies, Professional Services, E-commerce & Brands, Technology & SaaS Companies, and General Home Services & Remodeling. Their content can be added later.

## Admin workflow

`/admin/niche-catalog` — Niche Catalog & Builder

- Create a new Draft niche without code.
- Edit name, summary, pass score, sort order, visibility and whether it is required.
- Move a niche between Draft, Coming Soon and Published.
- Add/edit/delete niche lesson content in Markdown.
- Publishing UI verifies that baseline survey, diagnostic prompts, active lessons and active certification questions exist.

`/admin/niche-academy` — Niche Academy Controls

- Manage baseline survey prompts.
- Manage written diagnostic prompts.
- Manage certification questions, choices, correct answer, explanation, section and critical flag.

## Learner states

- `draft`: Admin only.
- `coming_soon`: visible in the planned niche library but cannot be started.
- `published`: full certification flow available.

## Security

Correct answers, critical flags and explanations are not returned in the learner payload before submission. Certification scoring occurs in the secure RPC. Module 4 score/completion is written only through the niche-certification workflow, and anonymous execution is revoked from learner RPCs.
