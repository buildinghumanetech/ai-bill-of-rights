"use client";

import { useLiveSigners } from "./LiveSignersProvider";

export default function SignatureCount() {
  const { count } = useLiveSigners();
  return <>{count.toLocaleString()}</>;
}
