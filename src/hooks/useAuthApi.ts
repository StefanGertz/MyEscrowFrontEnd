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

const fetchAuth = async <TPayload extends LoginPayload | SignupPayload>(
  path: string,
  payload: TPayload,
): Promise<AuthResponse> => {
  const response = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Authentication request failed.");
  }
  return (await response.json()) as AuthResponse;
};

export function useLoginMutation() {
  return useMutation({
    mutationFn: (payload: LoginPayload) => fetchAuth("/api/auth/login", payload),
  });
}

export function useSignupMutation() {
  return useMutation({
    mutationFn: (payload: SignupPayload) => fetchAuth("/api/auth/signup", payload),
  });
}
