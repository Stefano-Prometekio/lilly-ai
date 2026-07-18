# MVP implementation plan

## Product decision

The proposed catering approach is a strong fit for the challenge. The production-oriented design is retained as a direction, but the hackathon implementation is optimized around the shortest complete judging story.

## Scope decisions

### Required now

- Catering only.
- One immutable, versioned brief schema used by voice and PDF intake.
- One real vendor data source with visible provenance.
- Three live role-play calls demonstrating lowball/hidden fees, upselling, and stonewalling.
- Structured outcomes: itemized quote, callback/email commitment, or documented decline.
- Deterministic quote normalization for the demo scenario.
- One finalist negotiation callback using only verified leverage.
- A ranked report with recordings, transcripts, and timestamped evidence.

### Deferred until the end-to-end demo works

- General-purpose vertical configuration framework.
- Multiple discovery providers and complex deduplication.
- Learned behavior classification or sophisticated hysteresis.
- Full multi-objective auction optimization.
- Production telephony scale, user teams, booking, payment, and long-term retention.

## Delivery sequence

### 0. Freeze the demo

- Choose the frontend route.
- Confirm the event scenario and three role-player personas.
- Confirm accounts, deadline, demo duration, and recording consent.
- Define the pass/fail checklist from the challenge brief.

Exit: one signed-off demo scenario and an agreed stack.

### 1. Domain foundation

- Define `BriefVersion`, `Vendor`, `CallSession`, `QuoteVersion`, `QuoteLineItem`, `EvidenceItem`, `NormalizedOffer`, and `NegotiationPlan` schemas.
- Add invariants for immutable confirmed briefs, evidence-gated leverage, and no autonomous booking.
- Implement deterministic completeness and normalization functions with fixtures.

Exit: the same fixtures can drive the UI, agent tools, and tests.

### 2. Intake

- Build the visible catering form and review screen.
- Connect the browser voice intake agent.
- Have agent tool calls patch fields and request the next missing critical field.
- Extract one uploaded PDF into the same draft brief schema.
- Require explicit confirmation and create an immutable version/hash.

Exit: voice and document paths produce one confirmed brief.

### 3. Discovery and call setup

- Fetch catering businesses from one provider and retain source metadata.
- Let the user approve a shortlist.
- Map the demo calls to consenting role-player destinations while clearly labeling the demo setup.
- Refuse to start calls unless the confirmed brief and authority settings are present.

Exit: the campaign has three approved call targets and one frozen brief version.

### 4. Initial vendor calls

- Configure the ElevenLabs procurement agent and native Twilio integration.
- Inject campaign, vendor, brief version, call mode, and allowed actions as dynamic variables.
- Persist critical quote facts during the call through webhook tools.
- Ingest the post-call transcript, recording metadata, and analysis payload.
- Reconcile the structured outcome after every call.

Exit: three calls have complete structured outcomes and evidence.

### 5. Normalize and select finalists

- Normalize staffing, food, service, delivery, tableware, tax, and conditional charges to one scenario.
- Treat unknown required components as uncertainty, not zero.
- Flag suspicious low totals for verification.
- Rank eligible offers using a small, visible scoring model.

Exit: a reviewer can explain every total and finalist decision.

### 6. Negotiate

- Freeze the leverage-eligible quote snapshot.
- Generate one vendor-specific plan with permitted and prohibited claims.
- Call the finalist in negotiation mode.
- Evaluate proposed changes in the backend and request explicit final read-back.
- Store a new quote version without overwriting the initial quote.

Exit: at least one price or commercial term changes because of verified leverage.

### 7. Report and rehearse

- Show recommended, lowest normalized cost, and initial-to-final changes.
- Add audio/transcript tabs and timestamp seeking.
- Run the full flow with the three private persona cards.
- Test interruption, AI disclosure, refusal, correction, and unauthorized-condition cases.

Exit: the challenge success checklist passes in one continuous demo.

## Suggested architecture

- Web: Lovable-generated TanStack Start app if Lovable is selected; otherwise a conventional React full-stack app.
- Data and auth: Supabase/Postgres with object storage for documents and evidence.
- Voice: ElevenLabs Agents React SDK for intake; ElevenLabs native Twilio integration for outbound calls.
- Orchestration: server-only HTTP endpoints used as ElevenLabs webhook tools.
- Extraction/planning: OpenAI API behind the server boundary.
- Deployment: choose after the frontend decision; all secret-bearing operations remain server-side.

## Non-negotiable invariants

- A confirmed brief is immutable; edits create a new version.
- Every vendor call records the exact brief version used.
- No competitive statement is returned to the agent without an eligible evidence ID.
- Low-confidence money values cannot become leverage.
- Missing mandatory scope is never priced as zero.
- Scope-reducing concessions are revalidated before acceptance.
- The agent cannot book, bind, or exceed the user's authority.
