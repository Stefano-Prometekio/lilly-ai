# ElevenLabs agent design

## Recommendation: two agent configurations

Use two ElevenLabs agent configurations backed by the same application API.

### 1. Intake agent

Channel: browser voice through the ElevenLabs React SDK.

Responsibilities:

- Conduct a natural interview rather than read form labels.
- Update the visible draft brief.
- Resolve missing, conditional, contradictory, or low-confidence values.
- Summarize the final brief but never confirm it on the user's behalf.

Tools:

- `get_intake_state(brief_id)`
- `record_brief_fields(brief_id, fields, evidence)`
- `get_next_intake_objective(brief_id)`
- `mark_intake_ready_for_review(brief_id)`

The browser obtains an authorized conversation token from the backend; the ElevenLabs API key never reaches the client.

### 2. Procurement agent

Channel: phone through ElevenLabs' native Twilio integration.

One configuration supports two runtime modes:

- `INITIAL_QUOTE`: gather a complete, itemized offer for the frozen brief.
- `NEGOTIATION_CALLBACK`: reconfirm an existing offer and request only backend-authorized improvements.

Required dynamic variables:

- `campaign_id`
- `vendor_id`
- `call_session_id`
- `brief_id`
- `brief_version`
- `call_mode`
- `buyer_identity`
- `event_summary`
- `hard_constraints_summary`
- `authority_summary`

Do not inject raw secrets, full transcripts, or unverified competitor prices into prompt variables.

Tools:

- `get_call_context(call_session_id)` returns the frozen brief and phase-specific objective.
- `record_quote_fact(call_session_id, fact)` stores a price, inclusion, exclusion, condition, or commitment with the current conversation context.
- `check_quote_completeness(call_session_id)` returns missing or ambiguous components and the next best clarification objective.
- `evaluate_counteroffer(call_session_id, changes)` deterministically checks scope, authority, total, and BATNA impact.
- `finalize_call_outcome(call_session_id, outcome)` requires a complete quote, callback/email commitment, or decline before closing.

Use the built-in end-call system tool only after `finalize_call_outcome` succeeds or after a documented connection failure.

## Prompt contract

The prompt is organized into stable sections:

1. Identity and disclosure.
2. Current call objective and frozen brief version.
3. Conversation behavior and interruption recovery.
4. Tool rules and structured end condition.
5. Honesty, authority, and evidence constraints.
6. Mode-specific instructions.

Core rules:

- State that you are an AI voice agent calling on behalf of the buyer when asked; do not evade the question.
- Never invent a competing offer, price, deadline, budget, requirement, or decision authority.
- Never disclose a maximum budget unless the backend explicitly authorizes it.
- Treat unspecified required items as unknown, not included.
- Do not accuse the vendor of being a lowballer, upseller, or stonewaller.
- Keep the same confirmed scope unless a possible substitution is explicitly recorded for user review.
- Do not book or accept binding terms.
- End with a concise read-back and a structured outcome.

## Runtime flow

### Initial quote

1. Identify the buyer and purpose.
2. Confirm availability and willingness to quote.
3. Describe the frozen event scope consistently.
4. Gather base price and each required inclusion.
5. Probe delivery, staffing, equipment, tax, deposits, cancellation, validity, and conditional charges.
6. Ask targeted follow-ups from `check_quote_completeness`.
7. Read back the complete offer.
8. Finalize the structured outcome, then end the call.

### Negotiation callback

1. Reconfirm the initial quote version.
2. State that the vendor is a finalist.
3. Retrieve the permitted gap/claim from `get_call_context`.
4. Make one specific price or non-price request.
5. Send every counteroffer to `evaluate_counteroffer` before responding substantively.
6. Try one alternate attribute after a firm price position.
7. Read back the final terms and create a new quote version.
8. Finalize, then end the call.

## Post-call processing

Enable post-call transcription webhooks and ingest:

- Conversation ID and agent/version IDs.
- Transcript turns and timestamps.
- Analysis/data-collection fields.
- Call status and telephony metadata.
- Recording/audio availability.

Mid-call tool facts are the operational state. Post-call extraction reconciles and enriches that state; it does not silently overwrite confirmed facts.

## Conversation settings to test first

- Interruptions enabled.
- Normal turn eagerness for vendor calls; patient behavior during structured intake.
- Moderate silence timeout so role-players can inspect their persona cards.
- A short static soft-timeout phrase such as "Let me make sure I compare that correctly."
- Truthful AI disclosure and explicit recording notice appropriate to the demo setup.

## Agent test suite

Create ElevenLabs scenario/tool/simulation tests for:

- AI identity question.
- Hidden fees revealed after a low headline price.
- Upsell redirect before the base quote is complete.
- Refusal to quote by phone.
- Interruption and topic change.
- Multiple or corrected monetary values.
- Conditional concession outside authority.
- Scope-reducing discount.
- Firm price with a non-price concession.
- No end-call before a structured outcome.
