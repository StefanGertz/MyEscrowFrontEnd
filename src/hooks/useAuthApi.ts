"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

export type BasicSuccessResponse = {
  success: true;
};

type LoginPayload = {
  email: string;
  password: string;
};

type SignupPayload = {
  name: string;
  email: string;
  password: string;
};

type VerificationPayload = {
  email: string;
  code: string;
};

type ResendPayload = {
  email: string;
};

type ForgotPasswordPayload = {
  email: string;
};

type ResetPasswordPayload = {
  email: string;
  code: string;
  password: string;
};

export type SignupVerificationResponse = {
  verificationRequired: true;
  email: string;
  expiresAt?: string;
  debugCode?: string;
};

export type SignupResponse = AuthResponse | SignupVerificationResponse;

export type ForgotPasswordResponse = {
  accepted: true;
  email: string;
  expiresAt?: string;
  debugCode?: string;
};

const parseErrorMessage = async (response: Response) => {
  const raw = await response.text();
  if (!raw) {
    return "Authentication request failed.";
  }
  try {
    const parsed = JSON.parse(raw) as {
      error?: string;
      message?: string;
      issues?: Array<{ message?: string }>;
    };
    if (parsed.error) return parsed.error;
    if (parsed.message) return parsed.message;
    if (parsed.issues?.length) {
      return parsed.issues.map((issue) => issue.message).filter(Boolean).join(" ");
    }
  } catch {
    // Fall back to the raw body if it is not JSON.
  }
  return raw;
};

const postJson = async <TPayload, TResult>(path: string, payload: TPayload): Promise<TResult> => {
  const response = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(message);
  }
  return (await response.json()) as TResult;
};

export function useLoginMutation() {
  return useMutation({
    mutationFn: (payload: LoginPayload) => postJson<LoginPayload, AuthResponse>("/api/auth/login", payload),
  });
}

export function useSignupMutation() {
  return useMutation({
    mutationFn: (payload: SignupPayload) =>
      postJson<SignupPayload, SignupResponse>("/api/auth/signup", payload),
  });
}

export function useVerifyEmailMutation() {
  return useMutation({
    mutationFn: (payload: VerificationPayload) =>
      postJson<VerificationPayload, AuthResponse>("/api/auth/verify-email", payload),
  });
}

export function useResendVerificationMutation() {
  return useMutation({
    mutationFn: (payload: ResendPayload) =>
      postJson<ResendPayload, SignupVerificationResponse>("/api/auth/resend-verification", payload),
  });
}

export function useForgotPasswordMutation() {
  return useMutation({
    mutationFn: (payload: ForgotPasswordPayload) =>
      postJson<ForgotPasswordPayload, ForgotPasswordResponse>("/api/auth/forgot-password", payload),
  });
}

export function useResetPasswordMutation() {
  return useMutation({
    mutationFn: (payload: ResetPasswordPayload) =>
      postJson<ResetPasswordPayload, BasicSuccessResponse>("/api/auth/reset-password", payload),
  });
}
