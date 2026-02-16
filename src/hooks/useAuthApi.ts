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

export type SignupVerificationResponse = {
  verificationRequired: true;
  email: string;
  expiresAt?: string;
  debugCode?: string;
};

export type SignupResponse = AuthResponse | SignupVerificationResponse;

const postJson = async <TPayload, TResult>(path: string, payload: TPayload): Promise<TResult> => {
  const response = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Authentication request failed.");
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
