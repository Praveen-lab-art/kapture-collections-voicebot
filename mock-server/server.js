// Kapture Finance — mock webhook server for Vapi tool calls.
// Run: npm install && node server.js   (then expose with: ngrok http 3000)

const express = require('express');
const app = express();
app.use(express.json());

// --- in-memory "datastore" (mock only) ---
const ACCOUNTS = {
  'ACC-88392': {
    customer_name: 'Rahul Sharma',
    loan_type: 'Personal Loan',
    overdue_amount: 8499,
    days_past_due: 12,
    valid_codes: ['1234', '1995'], // last-4 PAN or birth year, mock values
  },
};

const CALL_LOG = []; // every disposition gets appended here for the metrics README section

function maskAccountId(id) {
  // simple PII-safe log helper — never log raw verification codes
  return id;
}

app.post('/webhook', (req, res) => {
  const { message } = req.body || {};

  if (!message || message.type !== 'tool-calls') {
    return res.status(200).json({ status: 'acknowledged' });
  }

  const toolCall = message.toolCalls[0];
  const { name, arguments: args } = toolCall.function;
  const callId = toolCall.id;

  console.log(`[tool-call] ${name}`, { ...args, verification_code: args.verification_code ? '***' : undefined });

  let result;

  switch (name) {
    case 'verify_customer': {
      const acct = ACCOUNTS[args.account_id];
      const ok = acct && acct.valid_codes.includes(String(args.verification_code));
      result = ok
        ? { verified: true, customer_name: acct.customer_name }
        : { verified: false, message: 'Verification failed. Code did not match our records.' };
      break;
    }

    case 'get_account_details': {
      const acct = ACCOUNTS[args.account_id];
      result = acct
        ? {
            loan_type: acct.loan_type,
            overdue_amount: acct.overdue_amount,
            days_past_due: acct.days_past_due,
          }
        : { error: 'Account not found' };
      break;
    }

    case 'log_promise_to_pay': {
      const ptp_id = `PTP-${Math.floor(1000 + Math.random() * 9000)}`;
      result = { success: true, ptp_id, confirmed_date: args.ptp_date, amount: args.amount };
      break;
    }

    case 'send_payment_link': {
      // mock trigger — swap this block for a real SMS/WhatsApp API (e.g. Twilio, Gupshup) later
      result = {
        success: true,
        message: `Payment link sent via ${args.channel} to the registered mobile number.`,
      };
      break;
    }

    case 'escalate_to_agent': {
      result = {
        success: true,
        queued: true,
        reason: args.reason,
        message: 'Call queued for a human collections agent.',
      };
      break;
    }

    case 'mark_disposition': {
      const entry = {
        account_id: maskAccountId(args.account_id),
        status: args.status,
        notes: args.notes || '',
        timestamp: new Date().toISOString(),
      };
      CALL_LOG.push(entry);
      result = { success: true, disposition_logged: args.status, timestamp: entry.timestamp };
      break;
    }

    default:
      result = { success: false, message: `Unknown function: ${name}` };
  }

  return res.status(200).json({
    results: [{ toolCallId: callId, result: JSON.stringify(result) }],
  });
});

// simple endpoint to eyeball logged dispositions during testing
app.get('/dispositions', (_req, res) => res.json(CALL_LOG));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kapture mock webhook server listening on :${PORT}`));
