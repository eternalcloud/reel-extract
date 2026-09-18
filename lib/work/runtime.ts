import { MemoryWorkStore } from "./memory-store";
import { PHASE0_JOB_ID, PHASE0_SECRET } from "./phase0-fixture";
import { hashWorkSecret } from "./security";
import type { WorkStore } from "./store";

const globalStore = globalThis as typeof globalThis & {
  __reelExtractPhase0Store?: MemoryWorkStore;
};

function createDevStore(): MemoryWorkStore {
  return new MemoryWorkStore([
    {
      id: PHASE0_JOB_ID,
      attempt: 1,
      secretHash: hashWorkSecret(PHASE0_SECRET),
      secretExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
      status: "AI_TRIGGER_SENT",
      resultSha256: null,
      openedAt: null
    }
  ]);
}

export function getWorkStore(): WorkStore {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "No durable WorkStore is configured. Phase 0 memory storage is development-only."
    );
  }

  globalStore.__reelExtractPhase0Store ??= createDevStore();
  return globalStore.__reelExtractPhase0Store;
}

export function getWorkSigningKey(): string {
  const configured = process.env.WORK_SESSION_SIGNING_KEY;
  if (configured) {
    if (configured.length < 32) {
      throw new Error("WORK_SESSION_SIGNING_KEY must be at least 32 characters");
    }
    return configured;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("WORK_SESSION_SIGNING_KEY is required in production");
  }

  return "phase-0-development-signing-key-do-not-use-in-production";
}

export function getExpectedOrigin(requestUrl: string): string {
  if (process.env.APP_ORIGIN) {
    return new URL(process.env.APP_ORIGIN).origin;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_ORIGIN is required in production");
  }

  return new URL(requestUrl).origin;
}
