# Lilly - AI event sourcing assistant

Lilly turns one confirmed catering brief into comparable vendor offers and an evidence-backed
negotiation. It combines ElevenLabs voice agents, live market research, deterministic quote
normalization, and explicit buyer authority controls for the Hack-Nation / ElevenLabs
**The Negotiator** challenge.

## Judge quick start

1. Install [Node.js 22](https://nodejs.org/) and run `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Run `npm run dev` and open the local URL shown by Vite.
4. Create a workspace, choose **Load sample event**, and follow the guided workflow.

The sample event demonstrates the frozen brief, researched benchmark, three structured vendor
outcomes, normalization, comparison, and evidence-linked leverage without presenting fixture data
as live market evidence. Live research, transcript extraction, and voice calls require the relevant
credentials described in [Architecture and setup](docs/ARCHITECTURE.md).

For a short judging script, challenge fit, and evaluation checklist, see the
[Hackathon judge guide](docs/JUDGE_GUIDE.md).

## What Lilly demonstrates

- **One frozen scope:** manual, voice, PDF, DOCX, and PPTX intake converge on a canonical brief;
  confirmation produces a SHA-256 content hash.
- **Grounded market context:** Google Places discovers local vendors and OpenAI web search builds a
  price benchmark from allow-listed source URLs.
- **Voice procurement:** ElevenLabs supports browser conversations and server-initiated outbound
  calls with the exact brief version injected as runtime context.
- **Comparable offers:** transcripts are converted into a strict itemized quote schema, then all
  offers are normalized with deterministic TypeScript.
- **Evidence-gated leverage:** a competitor claim is available only when the alternative is
  eligible, cheaper, tied to the same brief hash, and backed by transcript evidence.
- **Human authority:** Lilly cannot book, make a binding commitment, or silently change scope.

## Workflow

`Confirm brief -> Research market -> Contact vendors -> Compare -> Negotiate -> Recommend`

Ranking is deliberately explainable. An offer must have a finalized itemized outcome, complete line
items, at least 85% completeness, at least 75% evidence confidence, transcript evidence, the same
confirmed brief hash, and a completed market reference. Eligible offers receive a visible score from
price, evidence, completeness, and cancellation flexibility.

## Run locally

```bash
npm install
copy .env.example .env.local
npm run dev
```

On macOS or Linux, replace the `copy` command with `cp`.

After changing Lilly's prompt or tool schema, update the configured ElevenLabs agent with:

```bash
npm run elevenlabs:update-agent
```

## Verification

```bash
npm run test
npm run build
npm run lint
```

Packaging verification on 19 July 2026: **16/16 tests passed**, the production client/SSR/Nitro
build completed, and lint completed with zero errors (six non-blocking Fast Refresh warnings in
shared UI component modules).

## Documentation

- [Hackathon judge guide](docs/JUDGE_GUIDE.md)
- [Architecture, setup, APIs, and current implementation status](docs/ARCHITECTURE.md)
- [MVP implementation plan](docs/implementation-plan.md)
- [ElevenLabs agent design](docs/elevenlabs-agent-design.md)
- [ElevenLabs tool contracts](elevenlabs/tool-contracts.md)
- [Demo vendor personas](elevenlabs/demo-personas.md)
- [Required inputs and decisions](docs/inputs-needed.md)

## Safety defaults

- The agent identifies itself as AI when asked and never fabricates bids or authority.
- No competing quote is used as leverage without an evidence reference.
- Unknown required scope blocks ranking instead of being treated as free.
- No vendor is booked and no binding commitment is accepted.
- API keys remain server-side; `.env.local` is not committed.
- Demo calls use consenting role-players.
