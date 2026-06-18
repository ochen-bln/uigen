import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("server-only");

vi.mock("jose", () => {
  const mockSignJWTInstance = {
    setProtectedHeader: vi.fn().mockReturnThis(),
    setExpirationTime: vi.fn().mockReturnThis(),
    setIssuedAt: vi.fn().mockReturnThis(),
    sign: vi.fn().mockResolvedValue("test-token"),
  };

  return {
    SignJWT: vi.fn(() => mockSignJWTInstance),
    jwtVerify: vi.fn(),
    __mockSignJWT: mockSignJWTInstance,
  };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  }),
  __mockCookies: vi.fn(),
}));

import { createSession } from "@/lib/auth";

describe("createSession", () => {
  let mockCookieStore: any;
  let mockSignJWT: any;
  let SignJWTConstructor: any;

  beforeEach(async () => {
    const joseModule = await import("jose");
    const headersModule = await import("next/headers");

    SignJWTConstructor = joseModule.SignJWT;
    mockSignJWT = joseModule.__mockSignJWT;
    mockCookieStore = (await headersModule.cookies()).mockResolvedValue
      ? (await headersModule.cookies())
      : { set: vi.fn(), get: vi.fn(), delete: vi.fn() };

    mockSignJWT.setProtectedHeader.mockClear();
    mockSignJWT.setExpirationTime.mockClear();
    mockSignJWT.setIssuedAt.mockClear();
    mockSignJWT.sign.mockClear();
    SignJWTConstructor.mockClear();
  });

  it("creates a JWT token with user info", async () => {
    await createSession("user-123", "test@example.com");

    expect(SignJWTConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        email: "test@example.com",
      })
    );
  });

  it("sets correct JWT header and expiration", async () => {
    await createSession("user-123", "test@example.com");

    expect(mockSignJWT.setProtectedHeader).toHaveBeenCalledWith({ alg: "HS256" });
    expect(mockSignJWT.setExpirationTime).toHaveBeenCalledWith("7d");
    expect(mockSignJWT.setIssuedAt).toHaveBeenCalled();
    expect(mockSignJWT.sign).toHaveBeenCalled();
  });

  it("sets httpOnly secure cookie", async () => {
    const headersModule = await import("next/headers");
    const cookieStore = await headersModule.cookies();

    await createSession("user-123", "test@example.com");

    expect(cookieStore.set).toHaveBeenCalledWith(
      "auth-token",
      "test-token",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      })
    );
  });

  it("sets secure flag only in production", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const headersModule = await import("next/headers");

    process.env.NODE_ENV = "development";
    await createSession("user-123", "test@example.com");
    const cookieStore1 = await headersModule.cookies();
    let callArgs = cookieStore1.set.mock.calls[0][2];
    expect(callArgs.secure).toBe(false);

    cookieStore1.set.mockClear();
    process.env.NODE_ENV = "production";
    await createSession("user-123", "test@example.com");
    const cookieStore2 = await headersModule.cookies();
    callArgs = cookieStore2.set.mock.calls[0][2];
    expect(callArgs.secure).toBe(true);

    process.env.NODE_ENV = originalNodeEnv;
  });

  it("sets cookie expiration to 7 days from now", async () => {
    const headersModule = await import("next/headers");

    const before = new Date();
    await createSession("user-123", "test@example.com");
    const after = new Date();

    const cookieStore = await headersModule.cookies();
    const callArgs = cookieStore.set.mock.calls[0][2];
    const expiresAt = callArgs.expires;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    expect(expiresAt.getTime() - before.getTime()).toBeGreaterThanOrEqual(sevenDaysMs - 1000);
    expect(expiresAt.getTime() - after.getTime()).toBeLessThanOrEqual(sevenDaysMs + 1000);
  });
});
