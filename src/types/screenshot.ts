export type Provider = "screenshotapi" | "microlink";

export type SaStatus = {
  valid: boolean | null;
  creditsRemaining?: number;
  reason?: string;
  loading?: boolean;
};

export type MlStatus = {
  valid: boolean | null;
  remaining?: number;
  limit?: number;
  resetAt?: number;
  reason?: string;
  tier?: string;
  usesSharedKey?: boolean;
  loading?: boolean;
};
