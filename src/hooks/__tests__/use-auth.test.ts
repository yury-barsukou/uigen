import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "@/hooks/use-auth";
import * as actions from "@/actions";
import * as anonTracker from "@/lib/anon-work-tracker";
import * as getProjectsModule from "@/actions/get-projects";
import * as createProjectModule from "@/actions/create-project";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

const mockProject = { id: "proj-1", name: "Test Project" };

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(anonTracker.getAnonWorkData).mockReturnValue(null);
    vi.mocked(getProjectsModule.getProjects).mockResolvedValue([]);
    vi.mocked(createProjectModule.createProject).mockResolvedValue(mockProject as any);
  });

  // ---------------------------------------------------------------------------
  // Initial state
  // ---------------------------------------------------------------------------

  test("returns isLoading as false initially", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(false);
  });

  test("exposes signIn and signUp functions", () => {
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.signIn).toBe("function");
    expect(typeof result.current.signUp).toBe("function");
  });

  // ---------------------------------------------------------------------------
  // signIn — loading state
  // ---------------------------------------------------------------------------

  test("sets isLoading to true while signing in", async () => {
    let resolveSignIn!: (v: any) => void;
    vi.mocked(actions.signIn).mockReturnValue(
      new Promise((res) => { resolveSignIn = res; })
    );

    const { result } = renderHook(() => useAuth());

    act(() => { result.current.signIn("a@b.com", "password"); });
    expect(result.current.isLoading).toBe(true);

    await act(async () => { resolveSignIn({ success: false }); });
    expect(result.current.isLoading).toBe(false);
  });

  test("resets isLoading to false after signIn resolves", async () => {
    vi.mocked(actions.signIn).mockResolvedValue({ success: false });

    const { result } = renderHook(() => useAuth());
    await act(async () => { await result.current.signIn("a@b.com", "password"); });

    expect(result.current.isLoading).toBe(false);
  });

  test("resets isLoading to false when signIn throws", async () => {
    vi.mocked(actions.signIn).mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("a@b.com", "password").catch(() => {});
    });

    expect(result.current.isLoading).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // signIn — failure
  // ---------------------------------------------------------------------------

  test("returns failure result without redirecting", async () => {
    vi.mocked(actions.signIn).mockResolvedValue({
      success: false,
      error: "Invalid credentials",
    });

    const { result } = renderHook(() => useAuth());
    let returnValue: any;
    await act(async () => {
      returnValue = await result.current.signIn("a@b.com", "wrong");
    });

    expect(returnValue).toEqual({ success: false, error: "Invalid credentials" });
    expect(mockPush).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // signIn — success, post-sign-in routing
  // ---------------------------------------------------------------------------

  test("redirects to existing project when user has projects and no anon work", async () => {
    vi.mocked(actions.signIn).mockResolvedValue({ success: true });
    vi.mocked(getProjectsModule.getProjects).mockResolvedValue([
      { id: "proj-1" } as any,
      { id: "proj-2" } as any,
    ]);

    const { result } = renderHook(() => useAuth());
    await act(async () => { await result.current.signIn("a@b.com", "password"); });

    expect(mockPush).toHaveBeenCalledWith("/proj-1");
    expect(createProjectModule.createProject).not.toHaveBeenCalled();
  });

  test("creates a new blank project and redirects when user has no projects and no anon work", async () => {
    vi.mocked(actions.signIn).mockResolvedValue({ success: true });
    vi.mocked(getProjectsModule.getProjects).mockResolvedValue([]);
    vi.mocked(createProjectModule.createProject).mockResolvedValue({ id: "new-proj" } as any);

    const { result } = renderHook(() => useAuth());
    await act(async () => { await result.current.signIn("a@b.com", "password"); });

    expect(createProjectModule.createProject).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [], data: {} })
    );
    expect(mockPush).toHaveBeenCalledWith("/new-proj");
  });

  test("migrates anon work into a project and redirects", async () => {
    const anonMessages = [{ id: "1", role: "user", content: "hello" }];
    const anonFileSystem = { "/App.jsx": { type: "file", content: "x" } };

    vi.mocked(actions.signIn).mockResolvedValue({ success: true });
    vi.mocked(anonTracker.getAnonWorkData).mockReturnValue({
      messages: anonMessages,
      fileSystemData: anonFileSystem,
    });
    vi.mocked(createProjectModule.createProject).mockResolvedValue({ id: "anon-proj" } as any);

    const { result } = renderHook(() => useAuth());
    await act(async () => { await result.current.signIn("a@b.com", "password"); });

    expect(createProjectModule.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: anonMessages,
        data: anonFileSystem,
      })
    );
    expect(anonTracker.clearAnonWork).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/anon-proj");
  });

  test("does not migrate anon work when messages array is empty", async () => {
    vi.mocked(actions.signIn).mockResolvedValue({ success: true });
    vi.mocked(anonTracker.getAnonWorkData).mockReturnValue({
      messages: [],
      fileSystemData: {},
    });
    vi.mocked(getProjectsModule.getProjects).mockResolvedValue([{ id: "proj-1" } as any]);

    const { result } = renderHook(() => useAuth());
    await act(async () => { await result.current.signIn("a@b.com", "password"); });

    expect(anonTracker.clearAnonWork).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/proj-1");
  });

  test("skips getProjects when anon work is present and redirects to migrated project", async () => {
    vi.mocked(actions.signIn).mockResolvedValue({ success: true });
    vi.mocked(anonTracker.getAnonWorkData).mockReturnValue({
      messages: [{ id: "1", role: "user", content: "hi" }],
      fileSystemData: {},
    });
    vi.mocked(createProjectModule.createProject).mockResolvedValue({ id: "migrated" } as any);

    const { result } = renderHook(() => useAuth());
    await act(async () => { await result.current.signIn("a@b.com", "password"); });

    expect(getProjectsModule.getProjects).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/migrated");
  });

  // ---------------------------------------------------------------------------
  // signUp — loading state
  // ---------------------------------------------------------------------------

  test("sets isLoading to true while signing up", async () => {
    let resolveSignUp!: (v: any) => void;
    vi.mocked(actions.signUp).mockReturnValue(
      new Promise((res) => { resolveSignUp = res; })
    );

    const { result } = renderHook(() => useAuth());

    act(() => { result.current.signUp("a@b.com", "password"); });
    expect(result.current.isLoading).toBe(true);

    await act(async () => { resolveSignUp({ success: false }); });
    expect(result.current.isLoading).toBe(false);
  });

  test("resets isLoading to false when signUp throws", async () => {
    vi.mocked(actions.signUp).mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("a@b.com", "password").catch(() => {});
    });

    expect(result.current.isLoading).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // signUp — failure
  // ---------------------------------------------------------------------------

  test("returns failure result without redirecting on signUp error", async () => {
    vi.mocked(actions.signUp).mockResolvedValue({
      success: false,
      error: "Email already registered",
    });

    const { result } = renderHook(() => useAuth());
    let returnValue: any;
    await act(async () => {
      returnValue = await result.current.signUp("a@b.com", "password");
    });

    expect(returnValue).toEqual({ success: false, error: "Email already registered" });
    expect(mockPush).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // signUp — success, post-sign-in routing
  // ---------------------------------------------------------------------------

  test("redirects to existing project after successful sign-up", async () => {
    vi.mocked(actions.signUp).mockResolvedValue({ success: true });
    vi.mocked(getProjectsModule.getProjects).mockResolvedValue([{ id: "proj-42" } as any]);

    const { result } = renderHook(() => useAuth());
    await act(async () => { await result.current.signUp("new@user.com", "password"); });

    expect(mockPush).toHaveBeenCalledWith("/proj-42");
  });

  test("creates a new blank project after sign-up when no projects exist", async () => {
    vi.mocked(actions.signUp).mockResolvedValue({ success: true });
    vi.mocked(getProjectsModule.getProjects).mockResolvedValue([]);
    vi.mocked(createProjectModule.createProject).mockResolvedValue({ id: "fresh" } as any);

    const { result } = renderHook(() => useAuth());
    await act(async () => { await result.current.signUp("new@user.com", "password"); });

    expect(createProjectModule.createProject).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [], data: {} })
    );
    expect(mockPush).toHaveBeenCalledWith("/fresh");
  });

  test("migrates anon work after sign-up", async () => {
    const anonMessages = [{ id: "1", role: "user", content: "anon msg" }];
    vi.mocked(actions.signUp).mockResolvedValue({ success: true });
    vi.mocked(anonTracker.getAnonWorkData).mockReturnValue({
      messages: anonMessages,
      fileSystemData: {},
    });
    vi.mocked(createProjectModule.createProject).mockResolvedValue({ id: "signup-proj" } as any);

    const { result } = renderHook(() => useAuth());
    await act(async () => { await result.current.signUp("new@user.com", "password"); });

    expect(createProjectModule.createProject).toHaveBeenCalledWith(
      expect.objectContaining({ messages: anonMessages })
    );
    expect(anonTracker.clearAnonWork).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/signup-proj");
  });
});
