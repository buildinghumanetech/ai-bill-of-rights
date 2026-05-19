import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error("Usage: pnpm tsx scripts/test-resend.ts <recipient@example.com>");
    process.exit(1);
  }
  const { sendEmail } = await import("@/lib/email/send");
  console.log(`Sending test email to ${to}...`);
  try {
    await sendEmail({
      to,
      subject: "Resend test from AI Bill of Rights",
      text: "If you got this, the Resend integration works.\n\n— ai-bill-of-rights",
    });
    console.log("sendEmail() returned without throwing.");
  } catch (err) {
    console.error("sendEmail() threw:", err);
    process.exit(2);
  }
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
