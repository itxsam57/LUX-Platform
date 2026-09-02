import type { VerificationAdapter } from "./adapter";
import type {
  VerificationNormalizedResult,
  VerificationSessionDescriptor,
  VerificationSessionRequest,
  VerificationTargetLevel,
} from "./types";

const SYNTHETIC_PROVIDER_KEY = "synthetic";
const SYNTHETIC_PROVIDER_LABEL = "Synthetic development verification";

function parseSyntheticReference(reference: string): {
  subjectId: string;
  targetLevel: VerificationTargetLevel;
} {
  const [prefix, targetLevel, ...subjectParts] = reference.split(":");
  const subjectId = subjectParts.join(":");

  if (
    prefix !== SYNTHETIC_PROVIDER_KEY
    || (targetLevel !== "v2" && targetLevel !== "v3")
    || !subjectId
  ) {
    throw new Error("Invalid synthetic verification reference.");
  }

  return { subjectId, targetLevel };
}

export function createSyntheticVerificationAdapter(
  now: () => Date = () => new Date(),
): VerificationAdapter {
  return {
    providerKey: SYNTHETIC_PROVIDER_KEY,
    providerLabel: SYNTHETIC_PROVIDER_LABEL,
    synthetic: true,

    async createSession(request: VerificationSessionRequest): Promise<VerificationSessionDescriptor> {
      if (!request.subjectId.trim()) {
        throw new Error("Verification subject is required.");
      }

      const expiresAt = new Date(now().getTime() + 15 * 60 * 1000).toISOString();
      return {
        providerKey: SYNTHETIC_PROVIDER_KEY,
        providerLabel: SYNTHETIC_PROVIDER_LABEL,
        sessionReference: `${SYNTHETIC_PROVIDER_KEY}:${request.targetLevel}:${request.subjectId}`,
        launchUrl: null,
        expiresAt,
        synthetic: true,
      };
    },

    async getResult(sessionReference: string): Promise<VerificationNormalizedResult> {
      const parsed = parseSyntheticReference(sessionReference);
      return {
        providerKey: SYNTHETIC_PROVIDER_KEY,
        providerReference: sessionReference,
        targetLevel: parsed.targetLevel,
        status: "verified",
        livenessPassed: true,
        riskScreenPassed: true,
        expiresAt: new Date(now().getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        synthetic: true,
      };
    },

    async verifyCallback(): Promise<boolean> {
      return false;
    },

    async health() {
      return {
        providerKey: SYNTHETIC_PROVIDER_KEY,
        providerLabel: SYNTHETIC_PROVIDER_LABEL,
        configured: true,
        healthy: true,
        synthetic: true,
      };
    },
  };
}
