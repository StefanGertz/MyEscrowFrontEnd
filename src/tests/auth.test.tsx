"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  useForgotPasswordMutation,
  useLoginMutation,
  useResetPasswordMutation,
  useSignupMutation,
  useVerifyEmailMutation,
} from "@/hooks/useAuthApi";
import { server } from "./server";

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  Wrapper.displayName = "QueryClientAuthTestProvider";

  return Wrapper;
};

beforeAll(() => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://staging-api.myescrow.example/v1";
  process.env.NEXT_PUBLIC_USE_MOCKS = "false";
  server.listen();
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

describe("auth flows", () => {
  it("logs in via staging API", async () => {
    const wrapper = createWrapper();
    const loginHook = renderHook(() => useLoginMutation(), { wrapper });

    await act(async () => {
      const response = await loginHook.result.current.mutateAsync({
        email: "ops@example.com",
        password: "password123",
      });
      expect(response.token).toBe("test-token");
      expect(response.user.email).toBe("ops@example.com");
    });
  });

  it("requires email verification on signup", async () => {
    const wrapper = createWrapper();
    const signupHook = renderHook(() => useSignupMutation(), { wrapper });

    await act(async () => {
      const response = await signupHook.result.current.mutateAsync({
        name: "Demo Ops",
        email: "demo@example.com",
        password: "password123",
      });
      expect("verificationRequired" in response && response.verificationRequired).toBe(true);
      if ("verificationRequired" in response) {
        expect(response.email).toBe("demo@example.com");
        expect(response.debugCode).toBe("123456");
      }
    });
  });

  it("verifies email with the provided code", async () => {
    const wrapper = createWrapper();
    const verifyHook = renderHook(() => useVerifyEmailMutation(), { wrapper });

    await act(async () => {
      const response = await verifyHook.result.current.mutateAsync({
        email: "demo@example.com",
        code: "123456",
      });
      expect(response.user.email).toBe("demo@example.com");
      expect(response.token).toBe("test-token");
    });
  });

  it("issues a password reset challenge", async () => {
    const wrapper = createWrapper();
    const forgotHook = renderHook(() => useForgotPasswordMutation(), { wrapper });

    await act(async () => {
      const response = await forgotHook.result.current.mutateAsync({
        email: "demo@example.com",
      });
      expect(response.accepted).toBe(true);
      expect(response.debugCode).toBe("654321");
    });
  });

  it("resets the password with a valid code", async () => {
    const wrapper = createWrapper();
    const resetHook = renderHook(() => useResetPasswordMutation(), { wrapper });

    await act(async () => {
      const response = await resetHook.result.current.mutateAsync({
        email: "demo@example.com",
        code: "654321",
        password: "NewPassword123!",
      });
      expect(response.success).toBe(true);
    });
  });
});
