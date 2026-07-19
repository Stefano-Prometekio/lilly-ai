# ElevenLabs webhook tool contracts

Base URL:

`https://<project-ref>.supabase.co/functions/v1/agent-tools/<route>`

Authentication header stored as an ElevenLabs secret:

`x-lilly-tool-secret: <LILLY_AGENT_TOOL_SECRET>`

## Intake tools

### `get_intake_state`

POST `/get-intake-state`

```json
{ "campaign_id": "...", "brief_version": 1 }
```

### `record_brief_fields`

POST `/record-brief-fields`

```json
{
  "campaign_id": "...",
  "brief_version": 1,
  "fields": { "guestCount": 120, "city": "Brussels" }
}
```

### `mark_intake_ready_for_review`

POST `/mark-intake-ready-for-review`

## Procurement tools

### `get_call_context`

POST `/get-call-context`

```json
{
  "campaign_id": "...",
  "call_session_id": "...-negotiation",
  "brief_version": 1
}
```

Returns the frozen brief, allowed authority, and phase-specific permitted claims.

### `record_quote_fact`

POST `/record-quote-fact`

```json
{
  "campaign_id": "...",
  "vendor_id": "...",
  "vendor_name": "Vendor A",
  "call_session_id": "...",
  "brief_version": 1,
  "call_mode": "INITIAL_QUOTE",
  "fact_type": "delivery_fee",
  "fact_value": { "amount": 250, "currency": "EUR", "inclusion": "excluded" },
  "confidence": 0.94,
  "time_in_call_secs": 222
}
```

### `check_quote_completeness`

POST `/check-quote-completeness`

Returns missing critical fact types and the next clarification objective.

### `evaluate_counteroffer`

POST `/evaluate-counteroffer`

```json
{
  "call_session_id": "...",
  "current_total": 5450,
  "leverage_evidence_id": "evidence-uuid",
  "changes": [{ "component": "delivery", "previous_value": 250, "new_value": 0 }],
  "scope_change": false,
  "conditional_commitment": null
}
```

### `finalize_call_outcome`

POST `/finalize-call-outcome`

Outcome must be `itemized_quote`, `callback_commitment`, `email_commitment`, or `decline`.
