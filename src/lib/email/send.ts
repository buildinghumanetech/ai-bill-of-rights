import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM_EMAIL ?? "noreply@example.com";

let client: Resend | null = null;
function getClient(): Resend | null {
  if (!apiKey) return null;
  if (!client) client = new Resend(apiKey);
  return client;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  const c = getClient();
  if (!c) {
    console.warn("[email] Resend not configured; skipping send.");
    return;
  }
  await c.emails.send({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    ...(opts.html ? { html: opts.html } : {}),
  });
}
