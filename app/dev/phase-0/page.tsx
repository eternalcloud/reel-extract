import Link from "next/link";
import { notFound } from "next/navigation";
import { PHASE0_JOB_ID, PHASE0_SECRET } from "../../../lib/work/phase0-fixture";

export default function Phase0DevPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <main className="shell">
      <p className="eyebrow">DEVELOPMENT ONLY</p>
      <h1>Phase 0 Work loop</h1>
      <p>
        This uses process-local memory and cannot satisfy the deployed Phase 0
        acceptance gate.
      </p>
      <Link href={`/work/${PHASE0_JOB_ID}#${PHASE0_SECRET}`}>
        Open synthetic Work job
      </Link>
    </main>
  );
}
