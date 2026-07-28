"use client";

import { useLiveSigners } from "./LiveSignersProvider";
import {
  SignatureHeadline,
  SignatureMomentumChip,
  SignatureMomentumPanel,
  type MomentumSigner,
} from "@/components/SignatureMomentum";

/**
 * The bare live count. Still used where a raw number is genuinely wanted; the
 * homepage surfaces below wrap it in threshold-aware framing instead — see
 * `@/components/SignatureMomentum` for why.
 */
export default function SignatureCount() {
  const { count } = useLiveSigners();
  return <>{count.toLocaleString()}</>;
}

/** Hero sub-headline, driven by the live count. */
export function LiveSignatureHeadline() {
  const { count } = useLiveSigners();
  return <SignatureHeadline count={count} />;
}

/** Mid-page momentum block, driven by the live count. */
export function LiveSignatureMomentumPanel({
  sample,
}: {
  sample?: MomentumSigner[];
}) {
  const { count } = useLiveSigners();
  return <SignatureMomentumPanel count={count} sample={sample} />;
}

/** Caption under the floating sign button, driven by the live count. */
export function LiveSignatureMomentumChip() {
  const { count } = useLiveSigners();
  return <SignatureMomentumChip count={count} />;
}
