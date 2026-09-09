# CRM Sales — Part 5: Meeting Management & Meeting Close-Out

## Objective

Part 5 turns the existing Sales meeting record into the Seller's in-CRM workspace for running a meeting and closing it out without creating a second meeting ledger, result table, Discovery system, Requirements system, task engine, or customer-communication path.

The implementation is intentionally an extension of the canonical systems already in production:

- `public.sales_meetings` remains the meeting source of truth.
- `meetingService` remains the frontend meeting service.
- `finalize_sales_meeting(...)` remains the canonical finalization RPC.
- `save_sales_meeting_customer_followup(...)` remains the customer-safe recap write path.
- Part 3 `crm_discovery_responses` and `crm_client_voice` remain canonical for meeting-captured Discovery and Client Voice.
- Part 2 `crm_requirements` remains canonical for structured Requirements.
- Part 4 Meeting Prep remains canonical for Meeting Objective, Intended Advance and selected questions.
- Existing meeting status and customer-communication automations remain responsible for post-meeting side effects.

No parallel Meeting Management or Meeting Close-Out business system is introduced.

## Reuse audit

Before implementation, the existing meeting architecture, `meetingService`, `finalize_sales_meeting`, No Show status automation, reviewed/fallback customer recap automation, Part 3 Discovery/Client Voice and Part 4 Meeting Prep were audited.

The audit identified one important interaction: the previous `finalize_sales_meeting` implementation could create a generic `Meeting Follow-Up` whenever `p_follow_up_at` and `p_next_step` were supplied, including a No Show finalization. The existing `queue_meeting_status_automation()` already creates the dedicated `No Show Follow-Up` and existing rebooking communication. Part 5 therefore hardens the canonical finalizer so the generic `Meeting Follow-Up` is a **Completed-only** path. No Show continues through the existing No Show automation.

## Existing meeting architecture

`sales_meetings` remains the only meeting business table used by Part 5. Existing canonical statuses remain:

- `Scheduled`
- `Rescheduled`
- `Completed`
- `No Show`
- `Cancelled`

The UI derives presentation phases from the canonical status and timestamps:

- Upcoming
- Meeting time
- Needs close-out
- Completed
- No Show

Those labels are presentation only and do not create a new database lifecycle.

## Existing finalize behavior and Part 5 hardening

Part 5 replaces the body of the existing `finalize_sales_meeting(...)` RPC without changing its canonical name/signature or creating a v2 finalizer.

The finalizer remains server-authoritative and verifies authentication, Seller/Admin authorization, meeting existence and meeting state. It preserves idempotent same-status retry behavior and rejects a conflicting final status once the meeting is closed.

For `Completed` CRM-linked Sales meetings, the server now requires:

1. a meaningful Outcome;
2. a meaningful Next Step while the related Sales lifecycle remains active; and
3. Follow-Up timing while that lifecycle remains active.

The live CRM lifecycle audit found the terminal opportunity state is `Won`. Part 5 therefore treats a linked `Won` opportunity as the existing closed-state exception to the Next Step / Follow-Up requirement. It does not invent a new Lead or Opportunity status.

Completion does **not** require every Discovery question to be answered, does **not** treat Part 4 Prep `READY` as Discovery completeness and does **not** fabricate unknown values.

Finalization does not automatically advance Lead status, Opportunity stage, quotation state, payment state or Won state.

## Existing No Show automation

No Show continues to use the existing `No Show` meeting status and `queue_meeting_status_automation()` behavior. That automation already owns:

- the dedicated `No Show Follow-Up` CRM activity;
- the existing no-show rebooking customer communication; and
- the existing Seller notification/in-app behavior.

Part 5 does not create a second No Show task or customer-message path. The generic `Meeting Follow-Up` in `finalize_sales_meeting` is now gated to `Completed` only.

## Existing customer follow-up automation

Part 5 reuses `save_sales_meeting_customer_followup(...)` for reviewed customer-safe recap data and reuses the existing communication triggers that distinguish a reviewed recap from the delayed fallback.

The existing communication update trigger remains responsible for cancelling/reconciling a pending fallback when a complete Seller-reviewed recap becomes available after completion and for enqueueing the reviewed follow-up through the existing dedupe key.

Part 5 creates no new notification outbox, email sender, fallback timer or rebooking sender.

## Lead Drawer integration

Meeting Management appears exactly once in the existing Lead Drawer, after **Meeting Prep** and before **Complete log**. It is a drawer workspace, not a new page or route.

The workspace is lazy-mounted in the same style as Requirements, Discovery and Meeting Prep so the Seller stays in context. Lead changes reset Part 5 state. Switching meetings or refreshing with unsaved work requires explicit confirmation.

## Meeting selection logic

The selector uses the canonical `sales_meetings.id` value.

Default selection is deterministic:

1. an active Scheduled/Rescheduled meeting already due for management/close-out;
2. otherwise the nearest upcoming active meeting;
3. otherwise the most recent Completed/No Show meeting for review.

Meetings stay isolated by meeting ID. Part 5 does not copy one meeting's close-out, selected questions, Discovery provenance or Client Voice provenance to another meeting.

## Part 4 Meeting Prep reuse

The Meeting Management header reads the existing Part 4 preparation workspace for the selected meeting and displays:

- preparation state;
- Meeting Objective;
- Intended Advance; and
- selected-question count.

`Open Meeting Prep` returns the Seller to the existing Part 4 editor. Part 5 does not duplicate preparation editing or create another selected-question store.

Prep not being `READY` is a visible quality warning, not a false completion gate.

## Secure meeting launch

CRM Meeting Management deliberately does not select/expose the raw `meeting_url` column in its normal meeting list. The Join action calls the existing authorized `get_my_meeting_launch_url` RPC through `meetingService.getLaunchUrl(...)`.

The meeting launch mechanism therefore remains server-authorized and separate from customer-safe/public meeting access.

## Selected-question behavior

Part 4 `selectedQuestionIds` are the primary live question list in Meeting Management. The current canonical Discovery response is shown alongside each selected question so a Seller is not encouraged to blindly re-ask already-resolved information.

The full Part 3 workspace remains available through `Open all Discovery`.

## Discovery response reuse

Part 5 reuses the Part 3 `QuestionAnswerPanel`, Discovery state model, certainty model, save service and `crm_discovery_responses` table.

Meeting-captured responses save the current `meeting.id` and a `SALES_MEETING` source reference. Existing states such as `NEEDS_FOLLOW_UP` and existing certainty such as `NEEDS_SPECIALIST_VALIDATION` remain available.

Part 5 does not create a meeting-answer table and does not automatically confirm linked Requirements.

## Client Voice reuse

Part 5 reuses the Part 3 `ClientVoiceForm`, `crmSalesDiscoveryService.saveClientVoice(...)` and `crm_client_voice` table.

A meeting-captured Client Voice entry records the current meeting ID. `customer_statement` and `seller_interpretation` remain separate fields. Linking Client Voice to a Requirement adds context only; it does not auto-confirm that Requirement.

## Requirements context

Structured Requirements stay in `crm_requirements`. Meeting Management shows read-only context grouped by the existing certainty model, including:

- Client Confirmed;
- Awaiting Client; and
- Needs Specialist Validation.

The canonical Requirements workspace remains the editing location. The meeting's `requirements_summary` field is a close-out summary and does not replace structured Requirements.

## Meeting-linked new information

`What We Learned Today` is derived at render time from existing meeting-linked records:

- meaningful Discovery responses whose `meeting_id` is the selected meeting;
- Client Voice entries whose `meeting_id` is the selected meeting; and
- the meeting Outcome.

No `meeting_learnings` table or duplicate fact store is created.

## Open-question derivation

Open Questions are derived from canonical active Discovery questions/responses, prioritizing selected Part 4 questions and Core questions while preserving existing response state/certainty semantics.

A response remains open when it is unasked/unresolved, explicitly needs follow-up, awaits the client, needs specialist validation or otherwise does not meet the existing resolution rules. No `open_questions` business table is created.

## Close-out draft behavior

Part 5 adds one narrow RPC, `save_sales_meeting_closeout_draft(...)`, because the existing meeting table already contains the required internal fields but there was no safe draft-save function for the in-progress close-out UI.

The RPC updates only existing `sales_meetings` columns:

- `outcome`
- `requirements_summary`
- `problems_identified`
- `decision_makers`
- `commercial_notes`
- `timeline_notes`
- `next_step`
- `follow_up_at`

It does not change meeting status, advance Pipeline, create a CRM activity or enqueue customer communication. It rejects anonymous access, unauthorized Sellers, Cancelled meetings and permanently closed meetings.

The UI uses an explicit **Save Close-Out Draft** action rather than per-keystroke writes. Unsaved work is protected on refresh, meeting switching and browser unload.

## Completed rules

The canonical `finalize_sales_meeting(...)` enforces completion rules on the server. Frontend validation and confirmation are usability layers only.

For an active related Sales lifecycle, Completed requires meaningful Outcome, Next Step and Follow-Up timing. A linked opportunity already in canonical `Won` state is treated as terminal and does not require a fabricated future Sales action.

The Completed path may create the existing generic `Meeting Follow-Up` CRM activity. That activity uses the selected meeting's canonical Lead, Opportunity and Seller. Part 5 adds a deterministic meeting-specific automation key and `NOT EXISTS` check so an idempotent retry does not duplicate the next-action activity.

## No Show rules

No Show does not require fake Outcome, Discovery answers, Requirements, decision-maker data, commercial notes or timeline facts.

`finalize_sales_meeting` closes the meeting with the existing `No Show` status, but does not create the generic Completed `Meeting Follow-Up`. The existing No Show status automation remains the single intentional owner of No Show follow-up/rebooking side effects.

## Next-action behavior

For a Completed active deal, the Seller records the real Next Step and Follow-Up time in the existing `next_step` and `follow_up_at` fields. Finalization links the resulting CRM activity to the meeting's canonical Lead, Opportunity and Seller.

Part 5 does not create a separate task engine or task table.

## Customer-safe recap behavior

Customer-facing recap is deliberately separated from internal close-out content and uses only the existing approved fields:

- `customer_summary`
- `customer_next_step`
- `customer_next_step_timing`

The UI explicitly labels the content customer-facing and requires Seller confirmation before save. Unsaved recap text is never sent automatically. No AI suggestion is automatically approved or saved as customer content.

If a complete reviewed recap is saved before completion, the existing Completed automation can use it. If it becomes complete after completion, the existing communication update automation handles the reviewed-send/fallback reconciliation.

## Communication side effects and deduplication

Part 5 does not send email directly.

Existing automation continues to own:

- reviewed Completed follow-up;
- fallback Completed follow-up;
- No Show rebooking communication;
- Seller reminders/notifications.

Existing notification dedupe keys are reused. The Part 5 finalizer's Completed CRM activity additionally uses `Automation key: meeting-follow-up:<meeting_id>` for activity dedupe. No Show uses the existing `no-show:<meeting_id>` activity key and existing no-show notification dedupe keys.

## Seller Guidance

Part 5 reuses `SellerGuidanceHelp` and adds guidance entries for the new workspace/action concepts, including:

- Meeting Management;
- Meeting Close-Out;
- Meeting Outcome;
- Problems / Needs;
- Decision Makers;
- Commercial Notes;
- Timeline Notes;
- Next Step;
- Follow-Up Time;
- Customer Summary;
- Customer Next Step;
- Customer Timing;
- Save Close-Out Draft;
- Save Reviewed Customer Recap;
- Complete Meeting;
- Mark No Show;
- Meeting Completed; and
- Meeting No Show.

Guidance remains explanatory and does not create lifecycle decisions.

## Security and RLS

Part 5 relies on the existing `sales_meetings` RLS for direct CRM reads and on server-side authorization for write/launch RPCs.

The new close-out draft RPC and hardened finalizer:

- require `auth.uid()`;
- allow Admin or the assigned active Sales Seller according to the existing authorization pattern;
- use `SECURITY DEFINER` with explicit safe `search_path`;
- deny anonymous execution;
- grant only authenticated execution;
- reject invalid meeting state.

The Meeting Management list selects an explicit safe CRM column set. The raw meeting launch URL is retrieved only through the existing authorized launch RPC.

Internal close-out fields are not added to the customer communication payload. Customer recap writes are limited to the existing customer-safe fields.

## Tests

`tests/security/crm-sales-meeting-management-closeout-part-5.test.ts` contains all 103 focused acceptance cases required by the Part 5 specification plus additional utility checks for derived phases, Discovery resolution and customer-recap completeness.

The focused cases cover canonical-system reuse, Lead Drawer placement, meeting selection/isolation, Part 4 reuse, secure launch, Part 3 reuse, meeting provenance, Client Voice separation, Requirements integrity, derived learning/gaps, draft safety, server-authoritative finalization, No Show dedupe, CRM activity linkage/dedupe, customer-safe recap automation, Seller Guidance, lead/meeting state isolation, data leakage/anonymous access protections, explicit deferred scope, Parts 1–4 regression presence and executable TypeScript/security/migration/build commands.

Repository validation must still report the actual command/CI result; test presence is not treated as a substitute for execution.

## Production verification

Production verification is intentionally read-only after migration/deployment. Verify:

- `sales_meetings` is still the only canonical meeting business table;
- no duplicate meeting/close-out business table exists;
- functions exist once with expected definitions/grants;
- RLS remains enabled/least privilege;
- anonymous execution is denied;
- No Show automation/dedupe remains intact;
- reviewed/fallback communication dedupe remains intact;
- no fake rows were added;
- existing meeting rows were not unintentionally rewritten by deployment; and
- deployment verification did not queue customer communication.

Do **not** mark a real customer meeting Completed/No Show or save fake customer recap solely to test production side effects. A status transition/recap save is allowed only against an explicitly approved test meeting/account.

## Deferred scope

Part 5 intentionally does not implement:

- Requirements Confirmed enforcement;
- Package Fit;
- Technical Escalation workflow;
- Commercial Escalation workflow;
- Timeline Escalation workflow;
- Proposal Readiness;
- quotation gating;
- Promise Register;
- an Assumptions / Exclusions / Dependencies engine;
- payment/Won changes; or
- Sales-to-Delivery handoff changes.

Those remain separate future scope.

## Canonical-system confirmation

MEETING MANAGEMENT REUSES THE EXISTING `sales_meetings` SYSTEM.

MEETING CLOSE-OUT REUSES THE EXISTING `finalize_sales_meeting` WORKFLOW.

DISCOVERY ANSWERS AND CLIENT VOICE REMAIN IN THEIR EXISTING CANONICAL SYSTEMS.

STRUCTURED REQUIREMENTS REMAIN IN `crm_requirements`.

NO PARALLEL MEETING OR CLOSE-OUT BUSINESS SYSTEM WAS CREATED.

NO-SHOW FOLLOW-UP USES THE EXISTING AUTOMATION WITHOUT UNINTENDED DUPLICATION.

CUSTOMER-SAFE MEETING RECAP USES THE EXISTING COMMUNICATION AUTOMATION AND REQUIRES SELLER REVIEW.

MEETING COMPLETION DOES NOT AUTOMATICALLY ADVANCE THE PIPELINE.

NO FAKE CLIENT DATA WAS ADDED TO PRODUCTION BY PART 5 IMPLEMENTATION OR VERIFICATION.

NO PACKAGE FIT, PROPOSAL READINESS, QUOTATION GATING, PAYMENT/WON, OR SALES-TO-DELIVERY CHANGES WERE IMPLEMENTED.
