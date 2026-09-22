const nodemailer = require("nodemailer");

/**
 * OUTBOUND EMAIL
 * --------------
 * Wraps nodemailer behind a transport that is created once and reused.
 *
 * Email is treated as best-effort throughout this codebase. A schedule change
 * must not be rolled back because an SMTP server was briefly unreachable —
 * the change is already validated and saved, and the in-app Notification
 * record (models/Notification.js) is the durable copy. So every function here
 * reports failure by returning it, never by throwing into the request path.
 *
 * Configuration (server/.env):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 * With Gmail this is smtp.gmail.com:465 and an App Password (not the account
 * password — Google blocks those for SMTP).
 *
 * If SMTP_HOST is not set, the mailer runs in log-only mode: it reports what
 * it would have sent and returns a clear "not configured" reason. That keeps
 * local development and the test suite from needing credentials, and makes
 * a misconfigured deployment obvious in the logs rather than silent.
 */

let cachedTransport = null;

function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransport() {
  if (!isConfigured()) return null;
  if (cachedTransport) return cachedTransport;

  const port = Number(process.env.SMTP_PORT || 587);
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // Port 465 is implicit TLS; 587 upgrades via STARTTLS.
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return cachedTransport;
}

function fromAddress() {
  return process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@fixture-engine.local";
}

/**
 * Sends one email.
 * @returns { sent: boolean, reason?: string } — never throws.
 */
async function sendMail({ to, subject, text }) {
  if (!to) return { sent: false, reason: "no recipient address" };

  const transport = getTransport();
  if (!transport) {
    console.log(`[mailer] not configured; would have emailed ${to}: ${subject}`);
    return { sent: false, reason: "SMTP is not configured" };
  }

  try {
    await transport.sendMail({ from: fromAddress(), to, subject, text });
    return { sent: true };
  } catch (err) {
    // Logged rather than thrown: see the note at the top of this file.
    console.error(`[mailer] failed to email ${to}: ${err.message}`);
    return { sent: false, reason: err.message };
  }
}

/** Sends to many recipients independently, so one bad address cannot block the rest. */
async function sendMailToMany(recipients, { subject, text }) {
  const results = await Promise.all(
    recipients.map(async (to) => ({ to, ...(await sendMail({ to, subject, text })) }))
  );
  return {
    sentCount: results.filter((r) => r.sent).length,
    failedCount: results.filter((r) => !r.sent).length,
    results,
  };
}

module.exports = { isConfigured, sendMail, sendMailToMany, fromAddress };
