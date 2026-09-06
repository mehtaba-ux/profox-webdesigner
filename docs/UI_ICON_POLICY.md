# ProFox UI Icon Policy

Status: **Mandatory system-wide design rule**

This policy applies to all public pages, CRM/admin interfaces, responsive states, experiments, refactors, and future features. It applies equally to human developers, designers, contractors, and coding agents.

## Prohibited sparkle/glint icon family

Do **not** use the sparkle/glint-cluster visual anywhere in the product UI.

The following are explicitly prohibited:

- Lucide `Sparkle`
- Lucide `Sparkles`
- Lucide `WandSparkles`
- the `✨` glyph/emoji when used as a UI icon or decorative affordance
- custom inline SVGs, local SVG assets, or hand-drawn graphics that recreate the same sparkle/glint-cluster motif
- decorative “magic/AI sparkle” icons used simply to make a card, label, button, badge, or heading look special

This is a design-system rule, not a component-specific preference.

## Use semantic icons instead

Choose the icon according to the actual meaning of the UI:

| Intent | Preferred alternatives |
| --- | --- |
| Guidance / information | `Info` |
| Qualification / protection / policy | `ShieldCheck` |
| Completed / verified | `CheckCircle2`, `BadgeCheck` |
| Suggestion / idea | `Lightbulb` |
| Help / explanation | `CircleHelp` |
| Warning / blocker | `TriangleAlert` |
| Progress / activity | `Activity`, `Clock3` |
| Rating / favorite only | `Star` |

Do not replace the prohibited icon with another decorative “magic” icon. The replacement should communicate a real function or state.

## Review rule

Before merging a UI change:

1. Confirm no prohibited sparkle/glint icon is imported or rendered.
2. Confirm no equivalent custom SVG or decorative glyph was introduced.
3. Confirm the replacement icon has a clear semantic meaning.
4. Confirm the icon remains understandable at desktop, tablet, and mobile sizes.

## Automated enforcement

`tests/security/ui-icon-policy.test.ts` recursively scans frontend source and UI assets for the prohibited sparkle identifiers and glyph. The security test suite runs in CI, so a future PR that reintroduces them will fail verification.

The automated check is intentionally backed by this written policy because arbitrary custom SVG paths cannot always be identified reliably by name alone. Reviewers must reject custom sparkle/glint-cluster artwork even if it bypasses identifier-based detection.
