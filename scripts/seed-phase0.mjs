import { createHash, randomBytes } from "node:crypto";

const JOB_ID = "11111111-1111-4111-8111-111111111111";

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const supabaseUrl = required("SUPABASE_URL").replace(/\/$/, "");
const secretKey = required("SUPABASE_SECRET_KEY");
const appOrigin = new URL(required("APP_ORIGIN")).origin;

const secret = randomBytes(32).toString("base64url");
const secretHash = createHash("sha256").update(secret).digest("hex");
const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

const response = await fetch(
  `${supabaseUrl}/rest/v1/rpc/phase0_rotate_work_job`,
  {
    method: "POST",
    headers: {
      apikey: secretKey,
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify({
      p_job_id: JOB_ID,
      p_secret_hash: secretHash,
      p_expires_at: expiresAt
    })
  }
);

if (!response.ok) {
  throw new Error(
    `Unable to rotate Phase 0 job: HTTP ${response.status} ${await response.text()}`
  );
}

const attempt = await response.json();
if (!Number.isInteger(attempt) || attempt < 1) {
  throw new Error(`Unexpected Phase 0 attempt: ${String(attempt)}`);
}

const jobUrl = `${appOrigin}/work/${JOB_ID}#${secret}`;

console.log(`JOB_ID=${JOB_ID}`);
console.log(`ATTEMPT=${attempt}`);
console.log(`EXPIRES_AT=${expiresAt}`);
console.log(`JOB_URL=${jobUrl}`);
console.log("");
console.log("Gmail trigger envelope:");
console.log("SCHEMA=1");
console.log(`JOB_ID=${JOB_ID}`);
console.log(`ATTEMPT=${attempt}`);
console.log(`JOB_URL=${jobUrl}`);
