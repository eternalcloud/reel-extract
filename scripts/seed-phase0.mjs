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
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const appOrigin = new URL(required("APP_ORIGIN")).origin;

const headers = {
  apikey: serviceRoleKey,
  authorization: `Bearer ${serviceRoleKey}`,
  "content-type": "application/json",
  accept: "application/json"
};

const currentUrl = new URL(`${supabaseUrl}/rest/v1/phase0_work_jobs`);
currentUrl.searchParams.set("id", `eq.${JOB_ID}`);
currentUrl.searchParams.set("select", "attempt");
currentUrl.searchParams.set("limit", "1");

const currentResponse = await fetch(currentUrl, { headers });
if (!currentResponse.ok) {
  throw new Error(
    `Unable to read Phase 0 job: HTTP ${currentResponse.status} ${await currentResponse.text()}`
  );
}

const current = await currentResponse.json();
const attempt = (current[0]?.attempt ?? 0) + 1;
const secret = randomBytes(32).toString("base64url");
const secretHash = createHash("sha256").update(secret).digest("hex");
const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

const upsertUrl = new URL(`${supabaseUrl}/rest/v1/phase0_work_jobs`);
upsertUrl.searchParams.set("on_conflict", "id");

const response = await fetch(upsertUrl, {
  method: "POST",
  headers: {
    ...headers,
    prefer: "resolution=merge-duplicates,return=minimal"
  },
  body: JSON.stringify({
    id: JOB_ID,
    attempt,
    secret_hash: secretHash,
    secret_expires_at: expiresAt,
    status: "AI_TRIGGER_SENT",
    result_sha256: null,
    opened_at: null,
    updated_at: new Date().toISOString()
  })
});

if (!response.ok) {
  throw new Error(
    `Unable to seed Phase 0 job: HTTP ${response.status} ${await response.text()}`
  );
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
