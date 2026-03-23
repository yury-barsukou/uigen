import { test, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ToolCallBadge, getToolLabel } from "../ToolCallBadge";

afterEach(() => cleanup());

// --- Pure label logic ---

test("getToolLabel: str_replace_editor create with path", () => {
  expect(getToolLabel("str_replace_editor", { command: "create", path: "/App.jsx" })).toBe("Creating App.jsx");
});

test("getToolLabel: str_replace_editor str_replace with path", () => {
  expect(getToolLabel("str_replace_editor", { command: "str_replace", path: "/components/Counter.jsx" })).toBe("Editing Counter.jsx");
});

test("getToolLabel: str_replace_editor insert with path", () => {
  expect(getToolLabel("str_replace_editor", { command: "insert", path: "/components/Counter.jsx" })).toBe("Editing Counter.jsx");
});

test("getToolLabel: str_replace_editor view with path", () => {
  expect(getToolLabel("str_replace_editor", { command: "view", path: "/App.jsx" })).toBe("Reading App.jsx");
});

test("getToolLabel: str_replace_editor undo_edit with path", () => {
  expect(getToolLabel("str_replace_editor", { command: "undo_edit", path: "/App.jsx" })).toBe("Undoing edit in App.jsx");
});

test("getToolLabel: file_manager rename with both paths", () => {
  expect(getToolLabel("file_manager", { command: "rename", path: "/App.jsx", new_path: "/NewApp.jsx" })).toBe("Renaming App.jsx to NewApp.jsx");
});

test("getToolLabel: file_manager delete with path", () => {
  expect(getToolLabel("file_manager", { command: "delete", path: "/App.jsx" })).toBe("Deleting App.jsx");
});

test("getToolLabel: unknown tool falls back to toolName", () => {
  expect(getToolLabel("str_replace_editor", {})).toBe("str_replace_editor");
});

test("getToolLabel: str_replace_editor create without path falls back gracefully", () => {
  expect(getToolLabel("str_replace_editor", { command: "create" })).toBe("Creating file");
});

// --- Rendered visual states ---

test("renders animate-spin when state is 'call'", () => {
  const { container } = render(
    <ToolCallBadge
      tool={{ toolCallId: "1", toolName: "str_replace_editor", args: { command: "create", path: "/App.jsx" }, state: "call" }}
    />
  );
  expect(container.querySelector(".animate-spin")).toBeDefined();
  expect(screen.getByText("Creating App.jsx")).toBeDefined();
});

test("renders green dot and no spinner when state is 'result'", () => {
  const { container } = render(
    <ToolCallBadge
      tool={{ toolCallId: "1", toolName: "str_replace_editor", args: { command: "create", path: "/App.jsx" }, state: "result", result: "ok" }}
    />
  );
  expect(container.querySelector(".bg-emerald-500")).toBeDefined();
  expect(container.querySelector(".animate-spin")).toBeNull();
});

test("renders animate-spin when state is 'partial-call'", () => {
  const { container } = render(
    <ToolCallBadge
      tool={{ toolCallId: "1", toolName: "str_replace_editor", args: {}, state: "partial-call" }}
    />
  );
  expect(container.querySelector(".animate-spin")).toBeDefined();
});
