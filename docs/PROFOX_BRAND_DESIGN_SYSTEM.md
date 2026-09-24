# ProFox Digital Solution — Brand & Design System Specification

**Status:** Required implementation standard  
**Applies to:** public website, CRM/admin UI, Seller workspace, client-facing product surfaces, forms, marketing pages, proposals rendered in product, reusable UI components and future product features  
**Primary audience:** developers, AI builders/coding agents, designers and QA

This document defines the visual design system for ProFox. It must be read together with:

- `docs/PROFOX_BRAND_MESSAGING_IDENTITY_BIBLE.md`
- `docs/UI_ICON_POLICY.md`
- `AGENTS.md`

---

## 0. Codebase Compatibility Rule

The source brand specification describes a Bootstrap 5 grid. **The current ProFox application is React + Vite + Tailwind CSS 4.** Do not add Bootstrap or a second CSS framework simply to reproduce the grid notation in this document.

The grid values below are **layout targets**, not permission to replace the existing technology stack.

Implementation rule:

> Preserve the current ProFox codebase structure and achieve the same brand dimensions, spacing, breakpoints and visual behavior using the existing Tailwind/CSS architecture unless the repository is formally migrated by a separate approved task.

Do not create duplicate component libraries, duplicate token systems or parallel styling frameworks.

For existing CRM/admin surfaces, preserve operational density and usability while applying the same brand colors, typography, spacing rhythm, borders, states and interaction discipline. Do not apply public-page hero typography to dense application screens.

---

## 01. Brand Colors

| Role | Color Name | Value | Primary usage |
| --- | --- | --- | --- |
| Primary | Navy Blue | `#000080` | Logo, navigation, H1/H2 on public pages, primary buttons, footer, dark sections, structural emphasis |
| Accent | Vivid Red | `#FF0E0E` | Eyebrows, selected secondary CTAs, tags, left-border accents, directional emphasis, hover highlights |
| Background | White | `#FFFFFF` | Main page and card backgrounds |
| Background Alt | Navy Tint | `#F0F2F9` | Alternate section backgrounds, subtle panels, placeholders, trust bars |
| Body Text | Near Black | `#111827` | Strong headings/card titles on light backgrounds |
| Secondary Text | Muted Gray | `#555B6E` | Body copy, descriptions, secondary nav text |
| Border Light | Soft Blue-Gray | `#E5E8F0` | Card borders, dividers, fields, tables |
| Hover Fill | Navy 8% | `rgba(0, 0, 128, 0.08)` | Pill hover, subtle row highlighting |
| Footer Text | White 65% | `rgba(255,255,255,0.65)` | Footer links/body |
| Footer Heading | White 45% | `rgba(255,255,255,0.45)` | Footer column headings |
| Copyright | White 35% | `rgba(255,255,255,0.35)` | Footer copyright/meta |
| Card Border Hover | Navy | `#000080` | Hover/focus border for interactive cards |
| Input Focus Ring | Navy 15% | `rgba(0,0,128,0.15)` | Focus ring |

### Color behavior

- Navy leads. Red directs.
- White or Navy should normally be the dominant visual field.
- Red is an action/emphasis color, not a replacement primary field.
- Do not invent random brand colors.
- Semantic status colors already used by application workflows (success, warning, error) may remain where meaning requires them, but they must not become new decorative brand colors.
- Ensure sufficient contrast for accessible text and controls.

---

## 02. Typography

### Font family

**Primary:** Inter  
**Fallback:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`

Do not introduce another general-purpose UI font without formal brand approval.

The source design uses no monospace font for normal UI. A monospace font may still be used in genuinely technical/code contexts if already required by the product.

### Public-facing type scale

| Element | Desktop | Mobile | Weight | Line height | Letter spacing | Color |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| H1 — Hero display | 64–80px | 36–44px | 700 | 1.1 | `-0.025em` | `#000080` |
| H2 — Section heading | 48–56px | 32–40px | 700 | 1.2 | `-0.02em` | `#000080` |
| H3 — Sub-section | 28–32px | 22–26px | 600 | 1.35 | `-0.01em` | `#111827` |
| H4 — Card title | 18–20px | 16–18px | 600 | 1.4 | `0` | `#111827` |
| Body large | 18–20px | 16px | 400 | 1.65 | `0` | `#555B6E` |
| Body regular | 16px | 15px | 400 | 1.65 | `0` | `#555B6E` |
| Body small | 14px | 13px | 400 | 1.5 | `0` | `#555B6E` |
| Caption / meta | 12–13px | 12px | 400–500 | 1.5 | `0` | `#555B6E` |
| Eyebrow / label | 11–12px | 11px | 500–600 | 1 | `0.08–0.12em` | `#FF0E0E` |
| Button text large | 15–16px | 14px | 500–600 | 1 | `0` | `#FFFFFF` |
| Button text small | 13–14px | 13px | 500 | 1 | `0` | `#FFFFFF` |
| Nav link | 14px | 14px | 400–500 | 1 | `0` | `#555B6E` |
| Footer link | 14px | 13px | 400 | 1.5 | `0` | white 65% |
| Footer column heading | 11px | 11px | 600 | 1 | `0.10em` | white 45% |

### Application/CRM typography rule

Dense application screens must preserve clarity and hierarchy rather than blindly using public marketing sizes. Use Inter and the same weight/color system, but scale headings appropriately for workspaces, drawers, tables, cards and dashboards.

### Text transform

- Eyebrow labels: uppercase.
- Footer column headings: uppercase.
- Button text: sentence case.
- Nav links: sentence case.
- Avoid unnecessary all-caps body text.

---

## 03. Grid & Layout

### Layout targets

- 12-column responsive grid behavior.
- Maximum wide-container target: **1320px**.
- Mobile horizontal gutter target: **12px**.
- Small+ horizontal gutter target: approximately **15px** where compatible with component system.
- Standard column/grid gap: **24px**.
- Standard row gap: **24px**.

### Breakpoints / behavior targets

| Name | Minimum width | Target container behavior | Typical layout |
| --- | ---: | --- | --- |
| xs | <576px | fluid | 1 column |
| sm | ≥576px | ~540px target | 1–2 columns |
| md | ≥768px | ~720px target | 2 columns |
| lg | ≥992px | ~960px target | 3 columns / desktop nav |
| xl | ≥1200px | ~1140px target | 3–4 columns |
| xxl | ≥1400px | up to 1320px | 4 columns max where appropriate |

Use existing Tailwind responsive utilities/tokens to achieve the equivalent behavior. Do not import Bootstrap for these values.

---

## 04. Spacing System

Base rhythm: **8px**. Most spacing should resolve to multiples of 4px or 8px.

| Token | Value | Typical use |
| --- | ---: | --- |
| `--space-1` | 4px | icon/text micro-gap |
| `--space-2` | 8px | badges/tags |
| `--space-3` | 12px | compact padding |
| `--space-4` | 16px | common control/card inner gap |
| `--space-5` | 20px | small component margin |
| `--space-6` | 24px | standard card padding/grid gap |
| `--space-8` | 32px | content block gap |
| `--space-10` | 40px | larger inner section separation |
| `--space-12` | 48px | mobile section padding |
| `--space-16` | 64px | medium section padding |
| `--space-20` | 80px | standard desktop section padding |
| `--space-24` | 96px | large section padding |
| `--space-28` | 112px | large flagship/hero rhythm |
| `--space-30` | 120px | maximum common desktop section padding |

### Public section padding

- Hero: `120px 0` desktop / `64px 0` mobile, with bottom reduced to ~80px/48px as composition requires.
- Standard sections: `80px 0` desktop / `48px 0` mobile.
- Tight/logo/award sections: `40px 0` desktop / `32px 0` mobile.

### App/CRM spacing

CRM/admin surfaces should use the same 4/8px rhythm, but may use tighter combinations for dense operational screens. Consistency and scanability take priority over marketing-page whitespace.

---

## 05. Buttons

### Primary — Navy

```text
Background:       #000080
Text:             #FFFFFF
Border:           1.5px solid #000080
Radius:           6–8px
Large padding:    12px 28px
Medium padding:   10px 22px
Small padding:    8px 16px
Weight:           500–600
Hover bg/border:  #0000a0
Transition:       0.2s ease
```

### Accent — Red

```text
Background:       #FF0E0E
Text:             #FFFFFF
Border:           1.5px solid #FF0E0E
Radius:           6–8px
Weight:           500–600
Hover bg/border:  #e00000
Transition:       0.2s ease
```

Use for deliberate secondary/highlight actions. Do not make every CTA red.

### Ghost / Outline Navy

```text
Background:       transparent
Text:             #000080
Border:           1.5px solid #000080
Radius:           6–8px
Weight:           500
Hover bg:         #000080
Hover text:       #FFFFFF
Transition:       0.2s ease
```

### Button behavior

- Maintain visible focus state.
- Disabled controls must remain visibly disabled and accessible.
- Destructive application actions may use semantic destructive styling rather than brand red-as-accent semantics.
- Do not use color alone to communicate critical state.

---

## 06. Navigation

### Public navigation

```text
Height:           64–72px
Background:       #FFFFFF
Bottom border:    1px solid #E5E8F0
Scrolled shadow:  0 1px 4px rgba(0,0,128,0.10)
Position:         sticky; top: 0
Z-index:          appropriate top-navigation layer
```

Logo treatment:

- Use official artwork where logo is shown.
- Preserve proportions and clear space.

Nav links:

- 14px.
- Weight 400–500.
- Default `#555B6E`.
- Hover/active `#000080`.
- Optional active/hover underline `2px solid #FF0E0E`.
- Typical gap 24–32px.

Primary navigation CTA:

- Navy background.
- White text.
- Approximately `8px 18px` padding.
- 6px radius.

Dropdown:

- White background.
- `1px solid #E5E8F0`.
- 12px radius.
- Navy-tinted shadow.
- Clear keyboard/focus support.

Mobile:

- Collapse below approximately 992px where appropriate.
- Trigger/icon should use Navy unless state semantics require another color.
- Drawer/background should remain White.

---

## 07. Hero Section

```text
Background:       #FFFFFF or #F0F2F9
Min height:       ~90–100vh when appropriate
Desktop padding:  ~120px top / 80px bottom
Mobile padding:   ~64px top / 48px bottom
```

Eyebrow:

- 11–12px.
- 500–600.
- Red.
- Uppercase.
- `0.10–0.12em` tracking.
- ~16px margin below.

H1:

- 64–80px desktop.
- 36–44px mobile.
- 700.
- 1.1 line height.
- `-0.025em` tracking.
- Navy.

Subtext:

- 18–20px desktop / 15–16px mobile.
- 1.65 line height.
- `#555B6E`.
- Typical max width 600–680px.

CTA row:

- Primary Navy.
- Secondary Red only where intentionally selected.
- 12–16px gap.

Trusted-by area:

- 48–64px margin above where applicable.
- Red uppercase label.
- Logos subdued to approximately 40–60% opacity.
- Logo height 24–32px.

---

## 08. Cards

### Case study / project cards

```text
Background:       #FFFFFF
Border:           1px solid #E5E8F0
Radius:           12–16px
Overflow:         hidden
Hover border:     #000080
Hover transform:  translateY(-4px)
Hover shadow:     0 8px 24px rgba(0,0,128,0.10)
Transition:       ~0.25s ease
```

Image area:

- Background `#F0F2F9` while empty/loading.
- Typical 200–240px desktop / ~180px mobile.
- `object-fit: cover` when photographic.

Card body:

- 20–24px padding.

Category label:

- 11–12px.
- 500–600.
- Red.
- Uppercase.
- `0.08em` tracking.

Card title:

- 16–18px.
- 500–600.
- `#111827`.

Card CTA/link:

- 13–14px.
- 500.
- Navy.

### Service / feature cards

```text
Background:       #FFFFFF or #F0F2F9
Border:           1px solid #E5E8F0
Left accent:      3px solid #FF0E0E
Radius:           12px
Padding:          24–32px
Title:            20–22px / 600 / Navy
Body:             #555B6E
```

### Application cards

For CRM/admin cards, preserve the same border, radius and Navy/Red hierarchy but use operationally appropriate density. Do not add lift animation to controls where movement would reduce usability.

---

## 09. Footer

```text
Background:       #000080
Top padding:      80px desktop
Bottom padding:   40px desktop
Text:             white variants
Optional accent:  3px red top border
```

Footer links:

- 14px desktop / 13px mobile.
- White 65%.
- Hover White.

Footer headings:

- 11px.
- 600.
- Uppercase.
- `0.10em` tracking.
- White 45%.

Social icons:

- White 55% default.
- Red hover.
- 20–22px.

Copyright bar:

- `1px solid rgba(255,255,255,0.12)` top border.
- ~24px top padding.
- ~40px top margin.
- 12–13px text.
- White 35%.

---

## 10. Logo Ticker / Trust Bar

```text
Background:       #F0F2F9 or #FFFFFF
Padding:          40px 0 desktop / 32px 0 mobile
Borders:          1px #E5E8F0 top and bottom
```

Trusted-by label:

- 12px.
- 500–600.
- Uppercase.
- `0.10em` tracking.
- Red.

Logos:

- 24–32px high.
- 40–60% opacity.
- Grayscale or restrained Navy treatment when appropriate.
- 48–64px gap.

If marquee animation is used:

- ~35s linear infinite.
- Continuous horizontal movement.
- Pause on hover.
- Respect `prefers-reduced-motion`; do not force continuous animation for users who request reduced motion.

---

## 11. Borders & Radius

| Element | Radius | Border |
| --- | --- | --- |
| Case/blog cards | 12–16px | `1px solid #E5E8F0`, hover Navy |
| Service cards | 12px | light border + 3px Red left accent |
| Buttons | 6–8px | 1.5px variant border |
| Dropdown | 12px | `1px solid #E5E8F0` |
| Inputs | 6–8px | light border, focus Navy |
| Tags / pills | full pill | Navy where brand-neutral/interactive |
| Modal/dialog | 16px | typically no outer border |
| Section divider | — | `1px solid #E5E8F0` |
| Accent/progress bar | 2–3px | Red where brand emphasis, semantic colors where status-driven |

---

## 12. Section Layout Patterns

| Section | Background | Desktop padding | Mobile padding | Common layout |
| --- | --- | --- | --- | --- |
| Navigation | White | height via flex | same | sticky row |
| Hero | White / Navy Tint | 120px top / 80px bottom | 64px / 48px | centered or left copy |
| Trusted By | Navy Tint | 40px | 32px | marquee/logo row |
| How We Help | White | 80–100px | 48px | 3-column grid |
| Featured Case Studies | Navy | 80–100px | 48px | high-contrast cards/banners |
| Success Stories | White | 80–100px | 48px | up to 4 columns |
| About / Mission | Navy Tint | 80–100px | 48px | focused centered content |
| Awards / Logos | Navy Tint | 40–60px | 32px | logo row |
| Insights / Blog | White | 80–100px | 48px | 3-column grid |
| Final CTA | Navy | 80–100px | 48px | centered CTA composition |
| Footer | Navy | 80px 0 40px | 48px 0 32px | responsive multi-column |

### Dark Navy section overrides

On `#000080`:

- Heading: White.
- Body: White ~70%.
- Subtext: White ~50%.
- Primary button may invert to White background / Navy text.
- Red accent button may stay Red / White.

---

## 13. Motion & Transitions

| Element | Effect | Duration | Easing |
| --- | --- | ---: | --- |
| Interactive card | up to `translateY(-4px)` + Navy shadow | 0.25s | ease |
| Card border | → Navy | 0.25s | ease |
| Primary button | → `#0000a0` | 0.2s | ease |
| Red button | → `#e00000` | 0.2s | ease |
| Outline button | Navy fill + White text | 0.2s | ease |
| Nav link | → Navy | 0.15s | ease |
| Sticky nav | border/shadow transition | 0.3s | ease |
| Dropdown | fade + translateY | 0.2s | ease |
| Section entry | subtle fade + up | ~0.6s | ease-out |
| Logo ticker | continuous movement | ~35s | linear |
| Input focus | Navy focus ring | 0.15s | ease |
| Social icon | → Red | 0.15s | ease |

### Motion rules

- Motion must support comprehension, hierarchy or feedback; never add animation merely for decoration.
- Respect `prefers-reduced-motion`.
- Avoid motion that interferes with CRM/admin productivity.
- Preserve existing functional animations where they are part of product behavior.

---

## 14. Responsive Behavior

| Width | Key behavior |
| --- | --- |
| `<576px` | H1 36–40px, 1 column, mobile navigation, 48–64px public section padding, full-width buttons where appropriate |
| `576–767px` | H1 ~44px, selective 2-column compact grids |
| `768–991px` | H1 ~52px, 2-column grids, footer ~2-column |
| `992–1199px` | H1 ~60px, 3-column grids, full desktop navigation |
| `≥1200px` | H1 64–80px, up to 4-column project grid, 3-column insights, max content width ~1320px |

All new UI must be tested at mobile, tablet and desktop widths.

CRM drawers/modals must remain usable on small screens and should collapse responsibly rather than force desktop dimensions.

---

## 15. Form Inputs & Fields

```text
Background:           #FFFFFF
Border:               1px solid #E5E8F0
Radius:               6–8px
Padding:              ~12px 16px
Font size:            15–16px public forms; application forms may use compatible dense scale
Font weight:          400
Text:                 #111827
Placeholder:          #9CA3AF
```

### Focus

```text
Border:      1px solid #000080
Box-shadow:  0 0 0 3px rgba(0,0,128,0.15)
Outline:     none only when a visible equivalent focus ring is present
```

### Error

```text
Border:      1px solid #FF0E0E
Box-shadow:  0 0 0 3px rgba(255,14,14,0.15)
```

### Label

- 13–14px.
- 500.
- `#111827`.
- ~6px gap to field.

### Helper/error

- 12px.
- Helper `#555B6E`.
- Error Red.

### Form requirements

- Every field must have an accessible label or equivalent association.
- Keyboard/focus behavior must be visible.
- Error text must explain the actual problem where possible.
- Do not use placeholder text as the only label.

---

## 16. Shadows

| Use | Shadow |
| --- | --- |
| Card default | none |
| Card hover | `0 8px 24px rgba(0,0,128,0.10)` |
| Dropdown/popover | `0 8px 24px rgba(0,0,128,0.12)` |
| Sticky navigation | `0 1px 4px rgba(0,0,128,0.10)` |
| Modal/dialog | `0 20px 60px rgba(0,0,128,0.20)` |
| Input focus | `0 0 0 3px rgba(0,0,128,0.15)` |
| Optional button depth | `0 4px 12px rgba(0,0,128,0.25)` |

Use shadows sparingly. Borders and whitespace should do most structural work.

---

## 17. Canonical Design Tokens

These values are the target semantic tokens. Before creating a second token definition, inspect existing global CSS/theme variables and extend/reuse them. Do not duplicate token systems.

```css
:root {
  /* Brand Colors */
  --color-primary: #000080;
  --color-primary-hover: #0000a0;
  --color-primary-light: #F0F2F9;
  --color-accent: #FF0E0E;
  --color-accent-hover: #e00000;

  /* Backgrounds */
  --bg-white: #FFFFFF;
  --bg-light: #F0F2F9;
  --bg-dark: #000080;

  /* Text */
  --text-heading: #111827;
  --text-body: #555B6E;
  --text-muted: #9CA3AF;
  --text-on-dark: #FFFFFF;
  --text-on-dark-muted: rgba(255, 255, 255, 0.65);

  /* Borders */
  --border-light: #E5E8F0;
  --border-primary: #000080;
  --border-accent: #FF0E0E;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;
  --space-24: 96px;
  --space-28: 112px;
  --space-30: 120px;

  /* Typography */
  --font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-size-xs: 11px;
  --font-size-sm: 13px;
  --font-size-base: 16px;
  --font-size-md: 18px;
  --font-size-lg: 20px;
  --font-size-xl: 24px;
  --font-size-2xl: 32px;
  --font-size-3xl: 48px;
  --font-size-4xl: 64px;
  --font-size-5xl: 80px;

  /* Border Radius */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-pill: 100px;

  /* Shadows */
  --shadow-card-hover: 0 8px 24px rgba(0, 0, 128, 0.10);
  --shadow-dropdown: 0 8px 24px rgba(0, 0, 128, 0.12);
  --shadow-nav: 0 1px 4px rgba(0, 0, 128, 0.10);
  --focus-ring: 0 0 0 3px rgba(0, 0, 128, 0.15);

  /* Transitions */
  --transition-fast: 0.15s ease;
  --transition-base: 0.2s ease;
  --transition-slow: 0.3s ease;
}
```

### Token implementation rule

Do not blindly paste this `:root` block into a new file if equivalent global tokens already exist. First inspect the current theme/global CSS. Reuse and normalize existing variables/classes wherever possible. This table is the semantic source of truth, not a command to create duplicate CSS.

---

## 18. Quick Reference

| Item | Standard |
| --- | --- |
| Primary | `#000080` |
| Accent | `#FF0E0E` |
| Background | `#FFFFFF` / `#F0F2F9` |
| Body | `#555B6E` |
| Strong heading | `#111827` on light / White on Navy |
| Font | Inter |
| Base public body | 16px |
| Public H1 | 64–80px desktop / 36–44px mobile |
| Layout | 12-column behavior / ~1320px max |
| Standard grid gap | 24px |
| Public section padding | 80–120px desktop / 48–64px mobile |
| Card radius | 12–16px |
| Button radius | 6–8px |
| Primary button | Navy / White |
| Accent button | Red / White |
| Footer | Navy |
| Dark sections | Navy with White text hierarchy |

---

## 19. Accessibility & Product Quality Requirements

Brand consistency does not override accessibility or usability.

Every developer must also ensure:

- accessible color contrast;
- visible keyboard focus;
- keyboard-operable controls;
- semantic labels/headings;
- responsive behavior;
- readable text at zoom;
- reduced-motion handling;
- usable touch targets;
- error states with text, not color alone;
- no text clipped by fixed heights;
- no decorative styling that makes dense CRM workflows harder to use.

Where a brand value conflicts with an accessibility requirement, preserve the brand intent while adjusting implementation to remain accessible.

---

## 20. Developer / AI Builder Rules

Before changing any visual UI, reusable component, page layout, form, navigation, card, modal, drawer, typography, color, spacing, branded copy or responsive behavior:

1. Read this file completely.
2. Read `docs/PROFOX_BRAND_MESSAGING_IDENTITY_BIBLE.md`.
3. Read `docs/UI_ICON_POLICY.md` when icons are involved.
4. Inspect the existing component/theme before creating something new.
5. Reuse existing components and tokens whenever they already satisfy the requirement.
6. Do not introduce Bootstrap into the current Tailwind codebase just because the source specification references Bootstrap grid conventions.
7. Do not create a second theme/token system.
8. Do not hard-code arbitrary colors when an approved semantic brand token exists.
9. Do not introduce unrelated fonts.
10. Keep Navy dominant and Red intentional.
11. Keep the UI visually clean, organized and understandable.
12. Preserve working product behavior while applying brand consistency.
13. Test mobile, tablet and desktop.
14. Test keyboard focus and key interaction states.
15. If existing production UI conflicts with this guide, do not perform an uncontrolled system-wide redesign. Make scoped changes safely and document broader inconsistencies for later remediation.

---

## 21. Visual Definition of Done

A UI change is not complete until applicable checks pass:

- [ ] Uses Inter/fallback stack consistently.
- [ ] Uses approved Navy/Red hierarchy.
- [ ] Introduces no arbitrary decorative brand colors.
- [ ] Uses the established 4/8px spacing rhythm.
- [ ] Uses approved radii/borders/shadows.
- [ ] Buttons match approved variants or justified semantic status variants.
- [ ] Form focus/error states are clear.
- [ ] Responsive behavior works at relevant breakpoints.
- [ ] Keyboard/focus interaction works.
- [ ] Motion respects reduced-motion preferences.
- [ ] Official logo proportions/artwork are preserved when logo is used.
- [ ] Copy follows the Brand Messaging & Identity Bible.
- [ ] Icons follow `docs/UI_ICON_POLICY.md`.
- [ ] Existing reusable components/tokens were reused where possible.
- [ ] No duplicate CSS framework/theme/component system was introduced.
