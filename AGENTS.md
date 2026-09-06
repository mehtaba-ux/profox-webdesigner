# Custom Guidelines

## Image Generation & Visual Guidelines
- **Modesty & Islamic Dress Code Requirement**: Whenever adding, sourcing, selecting, or generating images representing females or women, ensure that they are properly dressed in a modest, Islamic manner (including hijab and modest Islamic attire where applicable). Never use revealing, immodest, or non-compliant imagery.
- **Visual & Design Consistency**: Maintain consistent layout, typography, color harmony, and formatting across all public and admin pages.
- **Reliable Media Resolution**: All blog and portfolio graphics must be securely mapped to local static assets and Cloudflare R2 storage without broken 404 links.

## UI Icon Policy
- **System-wide prohibited icon**: Never use the Lucide `Sparkle`, `Sparkles`, or `WandSparkles` icons, the `✨` glyph, or a custom SVG/graphic that recreates the same sparkle/glint-cluster motif anywhere in the product UI.
- This rule applies to every public page, CRM/admin surface, responsive state, new feature, refactor, and UI produced by human developers or coding agents.
- Use a semantic alternative instead: `Info` for guidance, `ShieldCheck` for rules/qualification, `CheckCircle2` or `BadgeCheck` for completion/approval, `Lightbulb` for suggestions, `CircleHelp` for help, and `Star` only when the meaning is specifically rating/favorite.
- Do not use decorative “magic/AI sparkle” affordances as a substitute.
- Read `docs/UI_ICON_POLICY.md` before adding or changing UI icons. CI contains a system-wide regression check that blocks the prohibited sparkle identifiers/glyph from frontend source.
