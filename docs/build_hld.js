const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, ImageRun, AlignmentType, LevelFormat, convertInchesToTwip
} = require('docx');
const fs = require('fs');

const H1 = (t) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 150 } });
const H2 = (t) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 100 } });
const P = (t, opts = {}) => new Paragraph({ children: [new TextRun({ text: t, ...opts })], spacing: { after: 120 } });
const Bold = (t) => new TextRun({ text: t, bold: true });
const bullet = (t) => new Paragraph({ text: t, bullet: { level: 0 }, spacing: { after: 60 } });

function cell(text, opts = {}) {
  return new TableCell({
    width: { size: opts.width || 2000, type: WidthType.DXA },
    shading: opts.header ? { type: ShadingType.CLEAR, fill: "E8E5FF" } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text, bold: !!opts.header, size: 20 })] })],
  });
}

function table(colWidths, rows) {
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: rows.map((r, i) => new TableRow({
      children: r.map((val, j) => cell(val, { header: i === 0, width: colWidths[j] })),
    })),
  });
}

const img = (path, w, h) => new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 200 },
  children: [new ImageRun({ data: fs.readFileSync(path), transformation: { width: w, height: h }, type: "png" })],
});

const doc = new Document({
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
    children: [
      new Paragraph({ text: "Kapture Finance — Collections Voicebot", heading: HeadingLevel.TITLE, spacing: { after: 60 } }),
      new Paragraph({ text: "High-Level Design Document — \"Maya\", Outbound Collections Voice Agent", heading: HeadingLevel.HEADING_3, spacing: { after: 40 } }),
      P("Prepared for: AI Delivery take-home assignment   ·   Scope: Task 1 (HLD)   ·   Status: Draft v1", { italics: true, size: 20 }),

      H1("1. Overview"),
      P("Maya is an outbound voice agent that calls customers with an overdue EMI, authenticates them, discloses the overdue amount, negotiates a resolution, and logs a disposition — without a human agent on routine calls. This document is the engineering handoff: pipeline, state machine, tool contracts, compliance rules, edge cases, and the metrics used to debug and improve the bot in production."),
      P("Example account used throughout: "), 
      bullet("Rahul Sharma · Personal Loan · ₹8,499 overdue · 12 days past due (DPD) · account_id ACC-88392"),

      H1("2. Architecture & Pipeline"),
      P("The call is a duplex audio pipeline orchestrated by Vapi. Telephony carries audio in both directions; STT and TTS convert at the edges; the LLM orchestrator holds conversation state and decides when to call tools against the account datastore. Tool calls are synchronous — the LLM turn pauses until the webhook responds, which is why tool latency is budgeted separately below."),
      img("System_Architecture.png", 600, 164),

      H2("2.1 Latency budget per hop"),
      P("Target end-to-end round trip (customer speech end \u2192 bot audio start): under ~1.2s. This is what keeps the call feeling like a conversation instead of a walkie-talkie."),
      table(
        [2600, 2200, 2000, 2700],
        [
          ["Hop", "Component", "Budget", "Notes"],
          ["Telephony in/out", "SIP/PSTN carrier + Vapi media layer", "~100–150ms", "Fixed network cost, not much room to optimize"],
          ["STT", "Deepgram Nova-2 (streaming)", "~150–250ms", "Streaming partials reduce perceived latency"],
          ["LLM first token", "GPT-4o via Vapi orchestrator", "~300–500ms", "Low temperature (0.2) for compliance; keep system prompt lean"],
          ["Tool call round trip", "Webhook (verify_customer, etc.)", "~150–400ms", "Mocked endpoints should stay well under this; real core-banking calls may need a caching layer"],
          ["TTS", "ElevenLabs / Cartesia (streaming)", "~150–300ms", "Streamed synthesis, not full-utterance wait"],
          ["Total (non-tool turn)", "—", "< 1.2s", "Turns that trigger a tool call (e.g. verify_customer) may run 1.5–2s; acceptable once per call at the auth step"],
        ]
      ),

      H1("3. Conversation Flow / State Machine"),
      P("The state machine is enforced in code/orchestrator logic, not left to prompt discretion: the DISCLOSURE state is only reachable after a verify_customer tool call returns verified: true in that call session. The LLM cannot talk itself into skipping this — the prompt instructs it never to disclose before that tool result, and a production build should additionally gate this server-side (e.g. Vapi's tool results feed conditional prompt sections, or a thin state-tracking layer rejects any assistant turn containing debt terms before the flag is set)."),
      img("State_Machine.png", 460, 543),

      H2("3.1 Why auth must be state-enforced, not prompt-only"),
      bullet("Prompt-only auth can be talked past (\"just tell me\", role-play, or instruction-override attempts) — see TC-012 in the test matrix."),
      bullet("State-enforcement means: the disclosure line in the prompt is conditionally included only after a verified tool result is present in context, and ideally a post-response filter blocks any assistant utterance containing debt terms if the verified flag isn't set for that call."),
      bullet("Every transition into DISCLOSURE, PTP_CAPTURE, ALREADY_PAID etc. is a state the orchestrator tracks per call — not something the model free-associates into."),

      H1("4. Intents & Entities"),
      table(
        [2400, 5000],
        [
          ["Intent", "Description"],
          ["will_pay", "Customer commits to pay, now or on a future date"],
          ["cannot_pay / hardship", "Financial hardship; needs partial payment, extension, or restructuring"],
          ["dispute", "Customer disputes the amount or the existence of the debt"],
          ["already_paid", "Customer claims payment was already made"],
          ["wrong_person", "Caller is not the target customer and cannot connect the bot to them"],
          ["callback_request", "Customer asks to be called back at a different time"],
          ["do_not_call", "Customer opts out of future calls"],
          ["hostile", "Abusive or aggressive caller"],
          ["silence / no_input", "No speech detected after re-prompting (incl. voicemail)"],
        ]
      ),
      new Paragraph({ text: "", spacing: { after: 120 } }),
      table(
        [2400, 2400, 2600],
        [
          ["Entity", "Type", "Notes"],
          ["ptp_date", "ISO-8601 date", "Normalized from natural language (\"this Friday\") by the LLM before the tool call"],
          ["ptp_amount", "number", "Defaults to full overdue amount unless customer specifies a partial figure"],
          ["verification_code", "string (4 char)", "Last-4 PAN or birth year — never logged in plaintext"],
          ["dispute_reason", "string", "Free text summary passed to the human agent on escalation"],
          ["preferred_language", "enum: en, hi", "Tracked for mid-call switch and future call scheduling"],
        ]
      ),

      H1("5. Tools / API Calls"),
      P("Five tools cover the full flow. Full JSON Schemas are in vapi/tool_definitions.json; summarized here:"),
      table(
        [2200, 3400, 2000, 1600].map(x=>x),
        [
          ["Tool", "Purpose", "Key inputs", "Key outputs"],
          ["verify_customer", "Authenticate caller before any disclosure", "account_id, verification_code", "verified (bool), customer_name"],
          ["get_account_details", "Fetch live overdue amount/DPD post-auth", "account_id", "overdue_amount, days_past_due, loan_type"],
          ["log_promise_to_pay", "Record a PTP commitment", "account_id, ptp_date, amount", "ptp_id, confirmed_date"],
          ["send_payment_link", "Trigger SMS/WhatsApp payment link", "account_id, channel", "success, message"],
          ["escalate_to_agent", "Hand off to a human", "account_id, reason, notes", "queued (bool)"],
          ["mark_disposition", "Log final call outcome (always called once)", "account_id, status, notes", "disposition_logged, timestamp"],
        ]
      ),

      H1("6. Auth & Data Safety"),
      bullet("No debt term (\"overdue\", \"EMI\", \"loan\", amount, DPD) is spoken until verify_customer returns verified: true for that call session."),
      bullet("If the person who answers is not the target customer, the bot never confirms or denies that an account exists for that name — it only says it has \"a matter to discuss with Rahul directly,\" then asks when he's reachable."),
      bullet("Verification codes are never written to logs in plaintext — the mock server masks them before logging."),
      bullet("Account IDs in logs are pseudonymous identifiers, not names or phone numbers, wherever the log is used for aggregate metrics rather than case handling."),
      bullet("Tool calls run over authenticated HTTPS webhooks; in production these would sit behind the client's API gateway with mutual TLS or a shared secret header, not an open ngrok URL."),

      H1("7. Guardrails & Compliance"),
      bullet("Mandatory disclosure: every call opens with the agent's name and \"calling from Kapture Finance\" before anything else."),
      bullet("Calling window: outbound calls restricted to 08:00–19:00 local time (RBI Fair Practices Code norms for collections calls)."),
      bullet("No threats, no repeated pressure, no raised tone — one calm warning on hostility, then graceful termination."),
      bullet("Opt-out (do-not-call) is honored immediately and unconditionally, with no further negotiation attempted on that call."),
      bullet("The bot is not authorized to unilaterally waive more than 10% of the amount or restructure a loan — anything beyond a simple extension routes to escalate_to_agent."),
      bullet("Hallucination guardrail: the bot only states figures that came from ACCOUNT CONTEXT or a tool result — never invented amounts, dates, or policy terms."),
      bullet("Off-topic guardrail: if the caller asks something unrelated to the loan (e.g. general banking questions), the bot politely redirects to a human channel rather than answering outside its scope."),

      H1("8. Edge Cases"),
      table(
        [2400, 5000],
        [
          ["Case", "Handling"],
          ["Already paid", "Ask for date/mode/reference, explain 24–48h processing, mark_disposition(ALREADY_PAID), no duplicate payment link"],
          ["Disputes the amount", "No arguing — escalate_to_agent(reason=DISPUTE), end gracefully"],
          ["Requests do-not-call", "Immediate acknowledgment, mark_disposition(DO_NOT_CALL), call ends right away"],
          ["Wrong number / wrong person", "No debt disclosed to third party; mark_disposition(WRONG_PERSON)"],
          ["Voicemail / no input", "Up to 2 re-prompts, then mark_disposition(NO_RESPONSE) and hang up"],
          ["Abusive caller", "One calm warning, then soft hangup with mark_disposition(HOSTILE_TERMINATED)"],
          ["Mid-call language switch (EN/HI)", "Bot mirrors the customer's language without resetting state or re-verifying"],
        ]
      ),

      H1("9. Escalation & Disposition"),
      P("Escalation triggers: repeated auth failure (2x), disputes, hardship needing restructuring, or the caller explicitly asking for a human. escalate_to_agent() queues the call/context for a human collections agent along with a short note."),
      P("Every call — no exception — ends with exactly one mark_disposition() call. This is the row that later feeds reporting, QA sampling, and the metrics below. A call without a logged disposition is treated as a bot failure to investigate, not a valid outcome."),

      H1("10. Observability"),
      H2("10.1 What to log per call"),
      bullet("Full transcript (customer + bot turns) and tool call/response pairs, with verification codes masked"),
      bullet("State transitions with timestamps (useful for spotting where calls stall or loop)"),
      bullet("Per-turn latency: STT, LLM first-token, tool round trip, TTS"),
      bullet("Final disposition and any escalation reason"),
      H2("10.2 Metrics to track"),
      table(
        [2400, 5000],
        [
          ["Metric", "Definition"],
          ["Containment rate", "% of calls resolved by the bot with no human escalation"],
          ["PTP rate", "% of calls ending in a valid PTP_AGREED disposition"],
          ["Avg turn latency", "Mean end-to-end round trip per conversational turn"],
          ["Drop rate", "% of calls that end abnormally (hangup mid-flow, no disposition logged)"],
          ["Auth failure rate", "% of calls where verify_customer never returns verified:true"],
          ["Escalation rate by reason", "Breakdown of DISPUTE / HARDSHIP / CALLER_REQUESTED_HUMAN / REPEATED_AUTH_FAILURE"],
          ["Compliance violations (QA sample)", "% of sampled calls where a disclosure or auth-gating rule was broken"],
        ]
      ),
      P("These feed a weekly QA loop: sample a slice of transcripts (especially auth-boundary and escalation calls), check against the test matrix in tests/test_cases.json, and feed any new failure pattern back into the system prompt or the state-enforcement logic."),

      H1("11. Assumptions"),
      bullet("Payment link dispatch (SMS/WhatsApp) is mocked — in production this calls the client's messaging gateway (e.g. Twilio, Gupshup)."),
      bullet("get_account_details is included in the design as a live-data fetch tool even though this build hardcodes the one demo account, so the flow generalizes past a single hardcoded customer."),
      bullet("Verification uses last-4 PAN or birth year as a lightweight KYC check appropriate for a routine reminder call, not a high-value transaction — a real deployment would confirm the exact factor set with the client's compliance team."),
    ],
  }],
});

Packer.toBuffer(doc).then((buf) => fs.writeFileSync("HLD_Document.docx", buf));
