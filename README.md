<<<<<<< HEAD
# Kapture Finance — Collections Voicebot ("Maya")

AI Delivery take-home assignment submission.

## What's in this repo

```
kapture-collections-voicebot/
├── README.md
├── docs/
│   ├── HLD_Document.docx / .pdf   # Full design doc (Task 1)
│   ├── System_Architecture.png    # Pipeline diagram
│   ├── State_Machine.png          # Conversation state machine diagram
│   └── architecture.dot, state_machine.dot, build_hld.js  # diagram/doc sources
├── vapi/
│   ├── system_prompt.txt          # Production system prompt
│   └── tool_definitions.json      # 6 tool/function schemas
├── mock-server/
│   ├── server.js                  # Express webhook handling all tool calls
│   ├── package.json
│   └── .env.example
└── tests/
    └── test_cases.json            # 12-case eval matrix, incl. auth & compliance guardrails
```

## Setup (Task 2 — Vapi build)

1. **Mock server**
   ```bash
   cd mock-server
   npm install
   node server.js          # listens on :3000
   ```
   Expose it publicly: `ngrok http 3000` and copy the HTTPS URL.

2. **Vapi assistant**
   - Create a new assistant on [vapi.ai](https://vapi.ai).
   - Transcriber: **Deepgram Nova-2**, language `en` (switch to `multi`/`hi` if testing the
     bilingual bonus) — chosen for low-latency streaming transcription tuned for telephony audio.
   - Model: **GPT-4o**, temperature **0.2** — low temperature keeps the compliance-critical
     auth gate and disclosure wording consistent call to call, instead of drifting.
   - Voice: **ElevenLabs** (or Cartesia) — a calm, professional female voice; both support
     low-latency streaming synthesis, which matters more here than raw expressiveness.
   - Paste `vapi/system_prompt.txt` as the system prompt.
   - Add the six tools from `vapi/tool_definitions.json`, replacing
     `<your-ngrok-or-render-url>` with your real webhook URL in each `server.url`.
   - Set the first message to the STATE 0 greeting line (or let the prompt drive it).

3. **Test call** — use Vapi's web call or a phone number, and run through the scenarios in
   `tests/test_cases.json`.

## Design choices

- **Deepgram Nova-2 + GPT-4o (temp 0.2) + ElevenLabs**: prioritizes low latency (streaming at
  every hop) and consistency over creativity — appropriate for a regulated collections call
  where the auth gate and disclosures need to be near-verbatim every time.
- **State machine enforced through the prompt's explicit STATE 0–4 structure**, with the "one
  rule that cannot be broken" (no debt disclosure pre-verification) stated before the states so
  the model treats it as a hard constraint, not a soft preference. In a production build this
  should also be enforced server-side (reject/redact any assistant turn containing debt terms
  if `verified` isn't true yet for that call) — noted as a next step below.
- **Six tools, not five**: added `get_account_details` alongside the five in the brief so the
  flow generalizes past one hardcoded account — `verify_customer` only confirms identity, a
  separate call fetches the live balance.
- **Escalation reasons are an enum**, not free text, so downstream dashboards can slice
  containment/escalation without NLP on notes fields.

## What broke / how I debugged it

- **Mermaid CLI (`mmdc`) couldn't render** — no headless Chrome available in this environment.
  Switched to **Graphviz (`dot`)**, which was already installed, and rebuilt both diagrams as
  `.dot` sources — same information, no browser dependency. Kept the `.dot` sources in `docs/`
  so they're easy to re-render or tweak.
- **First HLD docx render had the architecture image spilling across a blank page** — the
  `ImageRun` transformation width/height in docx-js are pixels, and I'd passed values sized for
  DXA (twips) by mistake. Rendered the docx to PDF/JPG with `soffice` + `pdftoppm` and visually
  caught it, then recalculated sizes from the actual PNG pixel dimensions and re-rendered to
  confirm the fix.
- **Auth-bypass risk**: initial prompt draft only said "verify before disclosing," which is
  exactly the kind of instruction a model can be talked past under pressure. Rewrote it as an
  explicit, front-loaded rule ("do not say these words until X") and added TC-002 and TC-012 to
  the test matrix specifically to probe retry-past-failure and instruction-override attempts.

## What I'd improve with more time

- **Server-side enforcement of the auth gate** (not just prompt instruction) — e.g. a thin
  middleware between Vapi and the LLM that strips/blocks debt terms in any assistant turn before
  `verified: true` has been recorded for that call, so a jailbreak attempt fails by construction.
- **Real payment-link dispatch** via Twilio/Gupshup instead of the mocked `send_payment_link`
  response (bonus item — the webhook already isolates this in one function, so swapping it in
  is a contained change).
- **Bilingual QA pass**: I designed for mid-call EN/HI switching in the prompt, but haven't
  stress-tested it against a real Hindi/Hinglish call — that's the highest-risk unverified piece
  of this submission.
- **Scale testing**: run the 12 cases in `tests/test_cases.json` as automated Vapi test suite
  calls (Vapi supports scripted test personas) rather than manual calls, and add a QA sampling
  step — pull ~5% of real call transcripts weekly, score against the same matrix, and feed new
  failure patterns back into the prompt.
- **Latency instrumentation**: log per-hop timings (STT/LLM/tool/TTS) from Vapi's call events
  into the metrics store described in HLD §10, rather than relying on the budget table as a
  design-time estimate only.

## Demo

*(Link to the call recording / Loom walkthrough goes here — record after wiring the assistant to
a live ngrok URL, since the tool calls need a reachable webhook to demonstrate the PTP and
already-paid paths end to end.)*
=======
# kapture-collections-voicebot
>>>>>>> a2f2168260cc70dff20302a34435b1f0109b0344
