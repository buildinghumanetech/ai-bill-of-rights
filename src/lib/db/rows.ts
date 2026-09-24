/**
 * Reading rows back out of a raw `db.execute(sql`…`)`.
 *
 * This is the single place the two drivers' disagreement lives. neon-http
 * resolves `execute` to a result OBJECT carrying `.rows`; pglite resolves it to
 * the row ARRAY itself. Every caller used to paper over that with
 * `(result as any[])` or `(result.rows ?? result) as …`, which meant ~25 casts
 * that also discarded any knowledge of the row shape.
 *
 * `rowsOf` narrows the driver difference once and takes the row shape as a type
 * argument, so call sites say what they expect instead of saying nothing:
 *
 *   const rows = rowsOf<{ table_name: string }>(await db.execute(sql`…`));
 *
 * It is a narrowing helper, not a validator: the type argument is a claim about
 * what the SQL returns, exactly as the old cast was, and nothing checks it at
 * runtime. The gain is that the claim is now written down and checked against
 * its uses. Default `Record<string, unknown>` so an un-parameterised call still
 * forces the caller to narrow each field rather than silently accepting `any`.
 */
export function rowsOf<T = Record<string, unknown>>(result: unknown): T[] {
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return result as T[];
}
