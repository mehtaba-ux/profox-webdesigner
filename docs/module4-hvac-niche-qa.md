# Module 4 — HVAC + Extensible Niche Academy QA

## Production expectations

- Roofing: published, required, 29 lessons, 40 certification questions, 25 baseline questions, 5 diagnostic prompts.
- HVAC: published, required, 39 lessons, 60 certification questions, 25 baseline questions, 5 diagnostic prompts.
- Nine future niche tracks are visible as Coming Soon with no training content and are not required for Module 4 completion.
- Admin can create a new Draft niche from Niche Catalog & Builder, edit its catalog settings and lesson content, and use Niche Academy Controls for survey, diagnostic and certification questions.
- A niche may only be progressed when `content_status = published`.
- Module 4 completes when all currently required + published niche certifications are complete. At launch this means Roofing + HVAC.

## Security verification

- Learner payload must not expose `correct_index`, `correctIndex`, `critical`, or `explanation` before assessment submission.
- Niche assessment grading remains server-side.
- Anonymous execute must remain revoked for all niche learner RPCs.
- Direct learner writes must not be able to set Module 4 completion/score outside the secure niche certification workflow.

## Functional QA performed before merge

- Getter returned 11 tracks: 2 published + 9 coming soon.
- HVAC learner payload returned 39 lessons, 60 questions, 25 baseline prompts and 5 diagnostic prompts with answer-key fields hidden.
- Coming-soon Plumbing progression was rejected.
- HVAC attempt with one critical miss scored 98% and correctly returned Retry Required.
- Correct HVAC attempt scored 100% and passed.
- With Roofing already certified, HVAC pass returned `moduleComplete=true`, `requiredPublished=2`, `completedRequired=2`, and wrote Module 4 progress to Completed / 100%.
- Direct Module 4 score/completion bypass was rejected by the training progress protection trigger.
- Disposable QA identity is removed after final verification.
