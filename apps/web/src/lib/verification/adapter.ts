import type {
  VerificationCallbackInput,
  VerificationNormalizedResult,
  VerificationProviderHealth,
  VerificationSessionDescriptor,
  VerificationSessionRequest,
} from "./types";

export interface VerificationAdapter {
  readonly providerKey: string;
  readonly providerLabel: string;
  readonly synthetic: boolean;

  createSession(request: VerificationSessionRequest): Promise<VerificationSessionDescriptor>;
  getResult(sessionReference: string): Promise<VerificationNormalizedResult>;
  verifyCallback(input: VerificationCallbackInput): Promise<boolean>;
  health(): Promise<VerificationProviderHealth>;
}
