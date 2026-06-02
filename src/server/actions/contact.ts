"use server";

import { sendEmail } from "@/lib/email/send";
import { EMAIL_RE } from "@/lib/validation/input";

const CONTACT_TO = "hello@ai-for-people.org";

export interface ContactResult {
  success: boolean;
  error?: string;
}

export async function sendContactMessageAction(input: {
  name: string;
  email: string;
  phone: string;
  message: string;
}): Promise<ContactResult> {
  const name = input.name.trim();
  const email = input.email.trim();
  const phone = input.phone.trim();
  const message = input.message.trim();

  if (!name) return { success: false, error: "Name is required." };
  if (!email || !EMAIL_RE.test(email))
    return { success: false, error: "A valid email is required." };
  if (!message)
    return { success: false, error: "Please include a message." };

  if (name.length > 200 || email.length > 200 || phone.length > 50)
    return { success: false, error: "One or more fields is too long." };
  if (message.length > 5000)
    return { success: false, error: "Message is too long (max 5000 chars)." };

  if (!process.env.RESEND_API_KEY) {
    console.error("[contact] RESEND_API_KEY missing — message not sent");
    return {
      success: false,
      error:
        "Mail isn't configured on this environment. Please email hello@ai-for-people.org directly.",
    };
  }

  const subject = `[ai-for-people.org] Contact form: ${name}`;
  const text = [
    `Name:    ${name}`,
    `Email:   ${email}`,
    `Phone:   ${phone || "(not provided)"}`,
    "",
    "Message:",
    message,
  ].join("\n");

  try {
    await sendEmail({ to: CONTACT_TO, subject, text });
  } catch (err) {
    console.error("[contact] sendEmail failed", err);
    return {
      success: false,
      error: "Couldn't send right now. Please try again or email hello@ai-for-people.org directly.",
    };
  }

  return { success: true };
}
