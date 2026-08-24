# Module 11 — ProFox Productivity & Action Engine

## Operating principle
Open ProFox → see what matters → take one action → ProFox updates the existing connected business records.

Module 11 is an orchestration layer, not a second CRM or task database.

## Connected sources of truth
- CRM leads / opportunities / activities
- Sales meetings
- Quotations and payments
- Clients
- Projects / project tasks / project team
- Recruitment applicants
- In-app notifications

## Productivity layers
- Unified all-role Today command center
- Priority scoring: Do Now / Overdue / Upcoming / Waiting
- Next Best Action on a universal record focus view
- One-click safe workflows that update existing records
- Global Ctrl/Cmd+K role-aware search
- Admin-configurable stage playbooks and checklists
- Low-noise cross-department handoff notifications
- Optional advisory-only AI Copilot
- Day Close and completion-based productivity metrics

## Safety boundaries
- No duplicate task system: existing CRM activities and project tasks remain authoritative.
- Payment verification remains Admin-only through the existing atomic RPC.
- Sale → project creation remains Admin/Project Manager-only through the existing atomic RPC.
- Recruitment activation and other protected lifecycle transitions remain in their existing controlled workflows.
- Copilot does not mutate business state. It receives only authorized context and returns drafts/briefs for human review.
- Gemini API key is stored in Supabase Vault; never browser/local storage or normal system configuration.
- Public/customer users do not receive internal productivity access.

## UX rules
- Default view surfaces a maximum focused queue before “show all”.
- Only cross-department responsibility changes create handoff alerts.
- Routine reminders/actions are pulled into Today instead of generating notification spam.
- Every productivity screen keeps a clear path back to the full underlying business module.
