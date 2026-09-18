import type {
  PersistWorkResultInput,
  WorkJobRecord,
  WorkStore
} from "./store";
import type { SubmissionDisposition } from "./idempotency";

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

type JobRow = {
  id: string;
  attempt: number;
  secret_hash: string;
  secret_expires_at: string;
  status: string;
  result_sha256: string | null;
  opened_at: string | null;
};

const JOB_SELECT =
  "id,attempt,secret_hash,secret_expires_at,status,result_sha256,opened_at";

export class SupabaseWorkStore implements WorkStore {
  private readonly baseUrl: string;
  private readonly secretKey: string;
  private readonly fetchImpl: FetchLike;

  constructor(config: {
    url: string;
    secretKey: string;
    fetchImpl?: FetchLike;
  }) {
    this.baseUrl = config.url.replace(/\/$/, "");
    this.secretKey = config.secretKey;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      apikey: this.secretKey,
      accept: "application/json",
      ...extra
    };
  }

  private async requireOk(response: Response, operation: string): Promise<void> {
    if (response.ok) return;

    let detail = "";
    try {
      detail = await response.text();
    } catch {
      // Keep the surfaced error bounded and generic.
    }

    throw new Error(
      `Supabase WorkStore ${operation} failed with HTTP ${response.status}${
        detail ? `: ${detail.slice(0, 500)}` : ""
      }`
    );
  }

  async getJob(jobId: string): Promise<WorkJobRecord | null> {
    const url = new URL(`${this.baseUrl}/rest/v1/phase0_work_jobs`);
    url.searchParams.set("id", `eq.${jobId}`);
    url.searchParams.set("select", JOB_SELECT);
    url.searchParams.set("limit", "1");

    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: this.headers()
    });
    await this.requireOk(response, "getJob");

    const rows = (await response.json()) as JobRow[];
    const row = rows[0];
    if (!row) return null;

    const secretExpiresAt = Date.parse(row.secret_expires_at);
    const openedAt = row.opened_at === null ? null : Date.parse(row.opened_at);
    if (
      !Number.isFinite(secretExpiresAt) ||
      (openedAt !== null && !Number.isFinite(openedAt))
    ) {
      throw new Error("Supabase WorkStore returned invalid job timestamps");
    }

    return {
      id: row.id,
      attempt: row.attempt,
      secretHash: row.secret_hash,
      secretExpiresAt,
      status: row.status,
      resultSha256: row.result_sha256,
      openedAt
    };
  }

  async markOpened(
    jobId: string,
    attempt: number,
    openedAt: number
  ): Promise<void> {
    const url = new URL(`${this.baseUrl}/rest/v1/phase0_work_jobs`);
    url.searchParams.set("id", `eq.${jobId}`);
    url.searchParams.set("attempt", `eq.${attempt}`);
    url.searchParams.set(
      "status",
      "in.(AI_TRIGGER_QUEUED,AI_TRIGGER_SENT,AI_OPENED,AI_STALLED)"
    );

    const response = await this.fetchImpl(url, {
      method: "PATCH",
      headers: this.headers({
        "content-type": "application/json",
        prefer: "return=minimal"
      }),
      body: JSON.stringify({
        opened_at: new Date(openedAt).toISOString(),
        status: "AI_OPENED"
      })
    });
    await this.requireOk(response, "markOpened");
  }

  async commitResult(
    input: PersistWorkResultInput
  ): Promise<SubmissionDisposition> {
    const url = `${this.baseUrl}/rest/v1/rpc/phase0_commit_work_result`;

    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({
        p_job_id: input.jobId,
        p_attempt: input.attempt,
        p_sha256: input.sha256,
        p_payload: input.payload
      })
    });
    await this.requireOk(response, "commitResult");

    const disposition = (await response.json()) as unknown;
    if (
      disposition !== "accept" &&
      disposition !== "replay" &&
      disposition !== "conflict"
    ) {
      throw new Error(
        `Supabase WorkStore returned unexpected disposition: ${String(
          disposition
        )}`
      );
    }

    return disposition;
  }
}
