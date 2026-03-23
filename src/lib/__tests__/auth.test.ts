import { test, expect, vi, beforeEach } from "vitest";

const { mockCookieGet, mockJwtVerify } = vi.hoisted(() => ({
  mockCookieGet: vi.fn(),
  mockJwtVerify: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve({ get: mockCookieGet })),
}));

vi.mock("jose", async (importOriginal) => ({
  ...(await importOriginal<typeof import("jose")>()),
  jwtVerify: mockJwtVerify,
}));

import { getSession } from "@/lib/auth";

beforeEach(() => {
  vi.clearAllMocks();
});

test("returns null when auth-token cookie is absent", async () => {
  mockCookieGet.mockReturnValue(undefined);

  const session = await getSession();

  expect(session).toBeNull();
});

test("reads the auth-token cookie by name", async () => {
  mockCookieGet.mockReturnValue(undefined);

  await getSession();

  expect(mockCookieGet).toHaveBeenCalledWith("auth-token");
});

test("returns session payload when token is valid", async () => {
  const payload = {
    userId: "user-123",
    email: "test@example.com",
    expiresAt: new Date("2027-01-01"),
  };

  mockCookieGet.mockReturnValue({ value: "valid.jwt.token" });
  mockJwtVerify.mockResolvedValue({ payload });

  const session = await getSession();

  expect(session).toEqual(payload);
});

test("passes the cookie value and a Uint8Array key to jwtVerify", async () => {
  mockCookieGet.mockReturnValue({ value: "some.jwt.token" });
  mockJwtVerify.mockResolvedValue({ payload: {} });

  await getSession();

  expect(mockJwtVerify).toHaveBeenCalledOnce();
  const [token, key] = mockJwtVerify.mock.calls[0];
  expect(token).toBe("some.jwt.token");
  expect(key.constructor.name).toBe("Uint8Array");
});

test("returns null when jwtVerify throws", async () => {
  mockCookieGet.mockReturnValue({ value: "tampered.token" });
  mockJwtVerify.mockRejectedValue(new Error("signature verification failed"));

  const session = await getSession();

  expect(session).toBeNull();
});

test("does not call jwtVerify when cookie is absent", async () => {
  mockCookieGet.mockReturnValue(undefined);

  await getSession();

  expect(mockJwtVerify).not.toHaveBeenCalled();
});
