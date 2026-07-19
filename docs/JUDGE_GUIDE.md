# Hackathon judge guide

## The 30-second pitch

Lilly is an evidence-constrained AI sourcing assistant for event catering. A buyer confirms one
brief, Lilly researches the local market, holds comparable vendor conversations, structures each
offer, identifies hidden costs, and calls finalists back with a precise counter-offer. Every
commercial claim stays attached to its source, and Lilly never has authority to book.

The design addresses the difficult part of autonomous negotiation: not merely having a convincing
conversation, but proving that the agent used the same scope, did not invent leverage, and did not
cross the buyer's authority boundary.

## Suggested five-minute demo

### 1. Freeze the requirement (45 seconds)

Create a workspace and choose **Load sample event**. Show that the intake supports manual entry,
browser voice, and PDF/DOCX/PPTX upload. Confirming a brief serializes its commercial scope and
authority settings, then computes a SHA-256 hash. Any later amendment returns the brief to draft and
invalidates downstream research and quotes.

### 2. Establish an independent benchmark (45 seconds)

Open **Scan the market**. In the live path, Google Places supplies local vendor candidates while
OpenAI web search finds current public menus, packages, and price guides. URLs are accepted only when
they came from Places or the web-search result set. The confidence score is capped by the number of
sources that contain an actual price.

### 3. Compare difficult vendor conversations (90 seconds)

Open **Contact vendors** and explain the three role-play behaviors: a low headline with hidden fees,
an upseller who asks for the maximum budget, and a stonewaller who initially avoids an exact quote.
The application can run browser conversations sequentially or import existing ElevenLabs
conversation IDs in bulk. After a call, the transcript is retrieved and converted into a strict
structured quote.

### 4. Inspect deterministic ranking (60 seconds)

Open **Compare**. Point out that a cheap quote is not automatically eligible. Required line items,
evidence confidence, transcript provenance, market context, finalization state, and the confirmed
brief hash are all hard gates. Select at least two eligible finalists.

### 5. Negotiate with permitted evidence (60 seconds)

Open **Improve the offer**. For each finalist, Lilly may use only a cheaper eligible alternative on
the same brief. The generated claim says the price gap without disclosing the competing vendor's
identity, and the ask targets a fee or a non-price term without changing scope. The final screen
retains both the initial and negotiated totals.

## What to evaluate

| Challenge capability           | Where it is demonstrated                                                    |
| ------------------------------ | --------------------------------------------------------------------------- |
| Natural voice interaction      | ElevenLabs React SDK in `BrowserPhoneCall` and reusable Lilly prompt        |
| Vendor calling                 | Browser role-play flow plus ElevenLabs/Twilio outbound-call API             |
| Constraint handling            | Canonical brief, version, hash, and explicit authority flags                |
| Difficult negotiation behavior | Hidden-fee, upseller, and stonewaller role-play personas                    |
| Grounded reasoning             | Source allow-listing, evidence confidence, transcript citations             |
| Measurable improvement         | Initial/final totals and changed terms in each negotiation record           |
| Explainability                 | Visible eligibility reasons, normalized totals, scoring, and evidence links |
| Safe autonomy                  | No booking, no binding acceptance, no unsupported competitor claim          |

## Technical highlights

- Strict typed domain model for briefs, sources, quotes, evidence, and negotiation records.
- Client and server routes in one TanStack Start application.
- OpenAI structured outputs for document and transcript extraction.
- OpenAI Responses web search combined with Google Places discovery for live benchmarking.
- ElevenLabs dynamic variables carry the exact brief JSON, hash, version, call mode, and vendor.
- HMAC-verified ElevenLabs webhook ingestion and private call-audio storage in Supabase.
- Authenticated ElevenLabs tools for fact capture, completeness checks, permitted claims,
  counter-offer evaluation, and structured call finalization.
- Deterministic normalization and negotiation-plan functions covered by unit tests.

## Reproducibility

```bash
npm install
npm run test
npm run build
npm run lint
```

Verified on 19 July 2026: 5 test files and 16 tests passed; the production client, SSR, and Nitro
builds succeeded; ESLint reported zero errors and six non-blocking Fast Refresh warnings.

## Honest implementation status

The browser campaign currently keeps active workflow state in React memory, and the home page keeps
its project list in browser local storage. Supabase migrations and Edge Functions implement the
durable audit model for calls, transcripts, evidence, quotes, and plans, but the full campaign UI is
not yet hydrated from those tables. This is intentional hackathon scope: the end-to-end judging path
is complete while the production persistence boundary is explicit.

The sample event uses transparent simulation fixtures. Live research needs Google Places and OpenAI
credentials; transcript extraction needs ElevenLabs and OpenAI credentials; private browser tokens
and webhook persistence need Supabase configuration. The application does not book a vendor,
transfer money, or make a binding purchase decision.

## Repository map for reviewers

- `src/App.tsx` - six-stage workflow and state gates.
- `src/lib/canonical-brief.ts` - canonical serialization and SHA-256 hashing.
- `src/lib/procurement.ts` - outcome validation, normalization, ranking, and leverage rules.
- `src/routes/api.market-research.ts` - live vendor discovery and grounded market benchmark.
- `src/routes/api.extract-quote.ts` - post-call structured quote extraction.
- `src/components/VendorCalls.tsx` - sequential calls and conversation import.
- `src/components/Negotiation.tsx` - finalist callbacks and initial-to-final tracking.
- `supabase/functions/agent-tools/index.ts` - authenticated runtime policy tools.
- `supabase/functions/elevenlabs-webhook/index.ts` - signed post-call ingestion.
- `elevenlabs/prompts/lilly-agent.md` - conversation and safety contract.
