import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM_EMAIL ?? "noreply@example.com";

let client: Resend | null = null;
function getClient(): Resend | null {
  if (!apiKey) return null;
  if (!client) client = new Resend(apiKey);
  return client;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Overrides RESEND_FROM_EMAIL, e.g. a person's name on the same address. */
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

function toResend(opts: EmailMessage) {
  return {
    from: opts.from ?? from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    ...(opts.html ? { html: opts.html } : {}),
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    ...(opts.headers ? { headers: opts.headers } : {}),
  };
}

export async function sendEmail(opts: EmailMessage): Promise<void> {
  const c = getClient();
  if (!c) {
    console.warn("[email] Resend not configured; skipping send.");
    return;
  }
  await c.emails.send(toResend(opts));
}

/**
 * Up to 100 messages in one Resend call. All or nothing: Resend validates the
 * whole batch, so an error means none were sent. Unlike `sendEmail`, this
 * throws when Resend is unconfigured or answers with an error, because its
 * callers record these messages as sent.
 */
export async function sendEmailBatch(messages: EmailMessage[]): Promise<void> {
  if (messages.length === 0) return;
  if (messages.length > 100) {
    throw new Error("A Resend batch holds at most 100 emails.");
  }
  const c = getClient();
  if (!c) throw new Error("Resend is not configured (RESEND_API_KEY is unset).");
  const { error } = await c.batch.send(messages.map(toResend));
  if (error) throw new Error(`Resend batch failed: ${error.message}`);
}
