# The Negotiator - Catering MVP

An evidence-constrained voice procurement demo for the Hack-Nation / ElevenLabs "The Negotiator" challenge.

The hackathon path is intentionally narrow:

1. Build and confirm one canonical catering brief by voice or document.
2. Reuse the exact confirmed brief for three live, role-played vendor calls.
3. Capture itemized quotes and evidence from every call.
4. Normalize the quotes to the same scope.
5. Make one evidence-backed negotiation callback that changes a price or term.
6. Rank the final offers and link every important claim to call evidence.

## Current status

The first end-to-end browser demo is implemented and connected to `Stefano-Prometekio/lilly-ai`. It includes the campaign UI, independent market-baseline research, three private persona call rooms, deterministic normalization, evidence-gated negotiation, Supabase persistence, and ElevenLabs token/webhook functions.

## Run locally

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local`. Keep `OPENAI_API_KEY`, `GOOGLE_PLACES_API_KEY`, and
`ELEVENLABS_API_KEY` server-only; never give them a `VITE_` prefix. Configure the same server
secrets in the Lovable deployment environment before publishing. Browser-safe IDs may use the
documented `VITE_*` variables.

After changing Lilly's prompt or intake-tool schema, apply it to the live ElevenLabs agent with:

```bash
npm run elevenlabs:update-agent
```

Verification:

```bash
npm run lint
npm run test
npm run build
```

## Project documents

- [MVP implementation plan](docs/implementation-plan.md)
- [ElevenLabs agent design](docs/elevenlabs-agent-design.md)
- [Inputs and decisions](docs/inputs-needed.md)

## Live integrations

- `/api/market-research`: Google Places discovery followed by OpenAI web research, with only
  verifiable price-bearing sources allowed to set the benchmark.

## Supabase functions

- `market-baseline`: optional edge-function implementation retained for a future Supabase-hosted research path.
- `elevenlabs-token`: short-lived private WebRTC session token issuance.
- `elevenlabs-webhook`: HMAC-verified transcript, analysis, audio, and failure ingestion.
- `agent-tools`: authenticated intake, quote capture, completeness, counteroffer, and structured-outcome tools for Lilly.

## Safety defaults

- The agent identifies itself as AI when asked and never fabricates bids or authority.
- No quote is used as leverage without an evidence reference.
- No vendor is booked and no binding commitment is accepted.
- Secrets stay in local environment files and are never committed.
- Demo calls use consenting role-players.
