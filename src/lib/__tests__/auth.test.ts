import { test, expect, vi, beforeEach } from "vitest";

const {
  mockCookieGet,
  mockCookieSet,
  mockJwtVerify,
  mockSign,
  mockSetProtectedHeader,
  mockSetExpirationTime,
  mockSetIssuedAt,
  MockSignJWT,
} = vi.hoisted(() => {
  const mockSign = vi.fn().mockResolvedValue("signed.jwt.token");
  const mockSetProtectedHeader = vi.fn();
  const mockSetExpirationTime = vi.fn();
  const mockSetIssuedAt = vi.fn();

  const jwtBuilder = {
    setProtectedHeader: mockSetProtectedHeader,
    setExpirationTime: mockSetExpirationTime,
    setIssuedAt: mockSetIssuedAt,
    sign: mockSign,
  };
  mockSetProtectedHeader.mockReturnValue(jwtBuilder);
  mockSetExpirationTime.mockReturnValue(jwtBuilder);
  mockSetIssuedAt.mockReturnValue(jwtBuilder);

  return {
    mockCookieGet: vi.fn(),
    mockCookieSet: vi.fn(),
    mockJwtVerify: vi.fn(),
    mockSign,
    mockSetProtectedHeader,
    mockSetExpirationTime,
    mockSetIssuedAt,
    MockSignJWT: vi.fn().mockImplementation(() => jwtBuilder),
  };
});

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(() =>
    Promise.resolve({ get: mockCookieGet, set: mockCookieSet, delete: vi.fn() })
  ),
}));

vi.mock("jose", async (importOriginal) => ({
  ...(await importOriginal<typeof import("jose")>()),
  jwtVerify: mockJwtVerify,
  SignJWT: MockSignJWT,
}));

import { createSession, getSession } from "@/lib/auth";

beforeEach(() => {
  vi.clearAllMocks();
  mockSign.mockResolvedValue("signed.jwt.token");
  mockSetProtectedHeader.mockReturnValue({
    setExpirationTime: mockSetExpirationTime,
    setIssuedAt: mockSetIssuedAt,
    sign: mockSign,
  });
  mockSetExpirationTime.mockReturnValue({
    setIssuedAt: mockSetIssuedAt,
    sign: mockSign,
  });
  mockSetIssuedAt.mockReturnValue({ sign: mockSign });
  MockSignJWT.mockImplementation(() => ({
    setProtectedHeader: mockSetProtectedHeader,
    setExpirationTime: mockSetExpirationTime,
    setIssuedAt: mockSetIssuedAt,
    sign: mockSign,
  }));
});

// --- getSession ---

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

// --- createSession ---

test("createSession sets an auth-token cookie with the signed JWT", async () => {
  await createSession("user-1", "user@example.com");

  expect(mockCookieSet).toHaveBeenCalledOnce();
  const [name, value] = mockCookieSet.mock.calls[0];
  expect(name).toBe("auth-token");
  expect(value).toBe("signed.jwt.token");
});

test("createSession passes userId and email to SignJWT constructor", async () => {
  await createSession("user-42", "hello@example.com");

  expect(MockSignJWT).toHaveBeenCalledOnce();
  const payload = MockSignJWT.mock.calls[0][0];
  expect(payload.userId).toBe("user-42");
  expect(payload.email).toBe("hello@example.com");
});

test("createSession signs with HS256 algorithm", async () => {
  await createSession("user-1", "user@example.com");

  expect(mockSetProtectedHeader).toHaveBeenCalledWith({ alg: "HS256" });
});

test("createSession signs with 7d expiration", async () => {
  await createSession("user-1", "user@example.com");

  expect(mockSetExpirationTime).toHaveBeenCalledWith("7d");
});

test("createSession calls setIssuedAt", async () => {
  await createSession("user-1", "user@example.com");

  expect(mockSetIssuedAt).toHaveBeenCalledOnce();
});

test("createSession passes a Uint8Array key to sign", async () => {
  await createSession("user-1", "user@example.com");

  expect(mockSign).toHaveBeenCalledOnce();
  const [key] = mockSign.mock.calls[0];
  expect(key.constructor.name).toBe("Uint8Array");
});

test("createSession cookie has httpOnly and correct sameSite/path", async () => {
  await createSession("user-1", "user@example.com");

  const [, , options] = mockCookieSet.mock.calls[0];
  expect(options.httpOnly).toBe(true);
  expect(options.sameSite).toBe("lax");
  expect(options.path).toBe("/");
});

test("createSession cookie is not secure outside production", async () => {
  const original = process.env.NODE_ENV;
  // NODE_ENV is 'test' by default in Vitest
  await createSession("user-1", "user@example.com");

  const [, , options] = mockCookieSet.mock.calls[0];
  expect(options.secure).toBe(false);
  process.env.NODE_ENV = original;
});

test("createSession cookie expires approximately 7 days from now", async () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  vi.setSystemTime(now);

  await createSession("user-1", "user@example.com");

  const [, , options] = mockCookieSet.mock.calls[0];
  const expectedExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  expect(options.expires).toEqual(expectedExpiry);

  vi.useRealTimers();
});

test("createSession payload includes the expiresAt date", async () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  vi.setSystemTime(now);

  await createSession("user-1", "user@example.com");

  const payload = MockSignJWT.mock.calls[0][0];
  const expectedExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  expect(payload.expiresAt).toEqual(expectedExpiry);

  vi.useRealTimers();
});
