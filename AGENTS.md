# Custom Guidelines

## Image Generation & Visual Guidelines
- **Modesty & Islamic Dress Code Requirement**: Whenever adding, sourcing, selecting, or generating images representing females or women, ensure that they are properly dressed in a modest, Islamic manner (including hijab and modest Islamic attire where applicable). Never use revealing, immodest, or non-compliant imagery.
- **Visual & Design Consistency**: Maintain consistent layout, typography, color harmony, and formatting across all public and admin pages.
- **Reliable Media Resolution**: All blog and portfolio graphics must be securely mapped to local static assets and Cloudflare R2 storage without broken 404 links.

## Mandatory ProFox Brand Standards
- Before changing public copy, product copy, service naming, navigation labels, marketing content, proposals, CTAs, trust/proof messaging, social-facing content, or any other branded language, **read `docs/PROFOX_BRAND_MESSAGING_IDENTITY_BIBLE.md` completely**.
- Before changing any page layout, reusable UI component, CRM/admin surface, typography, color, spacing, button, form, card, modal, drawer, navigation, responsive behavior, motion, logo treatment, or visual styling, **read `docs/PROFOX_BRAND_DESIGN_SYSTEM.md` completely**.
- The master brand line is **`From site to system.`** Do not invent or substitute a new master tagline for a campaign or feature.
- The locked service-family names are **ProFox Web**, **ProFox Apps**, and **ProFox Flow**. Do not rename them casually or create random alternatives.
- Brand voice must remain calm, intelligent, concise, certain, human and specific. Avoid generic/hype language such as `cutting-edge`, `world-class`, `revolutionary`, `one-stop solution`, `best-in-class`, and similar filler unless a separately approved factual context explicitly requires a term.
- Official brand colors are Navy `#000080` and Red `#FF0E0E`. Navy leads; Red directs. Do not introduce arbitrary decorative brand colors.
- Primary UI font is **Inter** with the approved fallback stack defined in `docs/PROFOX_BRAND_DESIGN_SYSTEM.md`.
- Use the official supplied ProFox logo artwork. Preserve proportions and clear space; do not stretch, skew, casually recolor, add shadows/outlines, or recreate the logo with improvised artwork.
- Numerical trust claims, ratings, project/client counts, certifications, awards and performance claims must be current and verifiable. Never invent proof for visual or conversion impact.
- **Current codebase compatibility:** this repository uses React + Vite + Tailwind CSS. Do not add Bootstrap or a second CSS framework/theme system merely because the source brand specification describes Bootstrap-style grid dimensions. Reproduce the approved visual behavior within the existing stack.
- Before creating new tokens/components/styles, inspect and reuse existing theme/components where possible. Do not create a parallel design system.
- Brand consistency does not override accessibility. Preserve sufficient contrast, keyboard focus, semantic structure, responsive usability and reduced-motion behavior.
- Existing production UI that conflicts with the guide must be corrected through safe, scoped implementation. Do not perform an uncontrolled system-wide redesign as a side effect of an unrelated task.

## UI Icon Policy
- **System-wide prohibited icon**: Never use the Lucide `Sparkle`, `Sparkles`, or `WandSparkles` icons, the `✨` glyph, or a custom SVG/graphic that recreates the same sparkle/glint-cluster motif anywhere in the product UI.
- This rule applies to every public page, CRM/admin surface, responsive state, new feature, refactor, and UI produced by human developers or coding agents.
- Use a semantic alternative instead: `Info` for guidance, `ShieldCheck` for rules/qualification, `CheckCircle2` or `BadgeCheck` for completion/approval, `Lightbulb` for suggestions, `CircleHelp` for help, and `Star` only when the meaning is specifically rating/favorite.
- Do not use decorative “magic/AI sparkle” affordances as a substitute.
- Read `docs/UI_ICON_POLICY.md` before adding or changing UI icons. CI contains a system-wide regression check that blocks the prohibited sparkle identifiers/glyph from frontend source.

## Sales SOP / CRM Workflow Policy
- Before changing the Seller Command Center, CRM leads/opportunities, pipeline stages or transitions, Meeting Prep/Management, Sales Catalog integration, quotations, Sales communication, payments/Won behavior, client onboarding, or Sales-to-Delivery handoff, **read `docs/sales-sop-system-implementation-spec.md` completely**.
- Also read `docs/seller-command-center-source-of-truth.md`. Extend the existing authoritative CRM/Sales records instead of creating parallel business records or hard-coded commercial truth.
- Critical SOP gates must remain server-authoritative. A disabled frontend control is not sufficient enforcement.
- Current package/product commercial truth comes from `sales_products`; individual client commercial truth comes from the quotation snapshot/accepted quotation. Do not duplicate package price, scope, payment terms, or delivery guidance in UI components.
- Do not make sellers fabricate values to satisfy required fields. Preserve explicit unknown/awaiting/specialist-validation states and route the appropriate downstream gate or escalation.
- Do not allow AI inference, seller convenience, or UI-only logic to bypass technical/commercial review, accepted-quotation requirements, verified-payment-controlled Won, or Sales-to-Delivery handoff requirements.
- Any implementation that changes SOP behavior must include the applicable authorization/RLS review, audit behavior, blocker messaging, and automated tests defined by the implementation specification.
