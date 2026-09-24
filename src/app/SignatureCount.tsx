"use client";

import { useLiveSigners } from "./LiveSignersProvider";
import {
  SignatureHeadline,
  SignatureMomentumChip,
  SignatureMomentumPanel,
  SignerHeadline,
  SignerMomentumChip,
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

/** Hero sub-headline: the viewer's own number once they've signed, else the live count. */
export function LiveSignatureHeadline() {
  const { count, viewer } = useLiveSigners();
  if (viewer) return <SignerHeadline {...viewer} count={count} />;
  return <SignatureHeadline count={count} />;
}

/** Mid-page momentum block, driven by the live count. */
export function LiveSignatureMomentumPanel({
  sample,
}: {
  sample?: MomentumSigner[];
}) {
  const { count, viewer } = useLiveSigners();
  return (
    <SignatureMomentumPanel
      count={count}
      sample={sample}
      viewerSignerId={viewer?.signerId ?? null}
      viewerSignerNumber={viewer?.signerNumber ?? null}
    />
  );
}

/** Caption under the floating button: the viewer's number once they've signed, else the live count. */
export function LiveSignatureMomentumChip() {
  const { count, viewer } = useLiveSigners();
  if (viewer) return <SignerMomentumChip {...viewer} />;
  return <SignatureMomentumChip count={count} />;
}
