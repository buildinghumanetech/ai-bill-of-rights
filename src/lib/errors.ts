/**
 * Reading a message off a caught value.
 *
 * `catch (err)` gives you `unknown`, which is correct — a `throw` can carry
 * anything. Several call sites typed it `err: any` instead, purely so they could
 * write `err.message`, and in doing so lost the check on everything else they
 * did with it.
 *
 * WHY IT LOOKS AT `cause`. The drivers wrap failures: a Postgres
 * unique-violation arrives from neon-http as an Error whose own `.message` is
 * generic and whose real text sits on `.cause`. Code that only read `.message`
 * therefore missed the constraint name it was trying to match on, which is
 * exactly the shape of the intermittently-flaky duplicate-report catch noted in
 * the sign-up-PII work. Checking both is the behaviour those call sites already
 * wanted, written once.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const cause = err.cause;
    const causeText =
      cause instanceof Error
        ? cause.message
        : typeof cause === "string"
          ? cause
          : "";
    return err.message || causeText;
  }
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const rec = err as { message?: unknown; cause?: { message?: unknown } };
    if (typeof rec.message === "string") return rec.message;
    if (typeof rec.cause?.message === "string") return rec.cause.message;
  }
  return "";
}

/**
 * The full text worth pattern-matching against: the error's own message AND its
 * cause's, joined. Use this when you are sniffing for a substring (a constraint
 * name, "relation … does not exist") and it could sit on either.
 */
export function errorText(err: unknown): string {
  if (!(err instanceof Error)) return errorMessage(err);
  const cause = err.cause;
  const causeText =
    cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
  return [err.message, causeText].filter(Boolean).join(" | ");
}

/** The driver's SQLSTATE, when the thrown value carries one. */
export function errorCode(err: unknown): string {
  for (const candidate of [err, (err as { cause?: unknown } | null)?.cause]) {
    if (candidate && typeof candidate === "object") {
      const code = (candidate as { code?: unknown }).code;
      if (typeof code === "string") return code;
    }
  }
  return "";
}
