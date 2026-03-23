"use client";

import { ToolInvocation } from "ai";
import { Loader2 } from "lucide-react";

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

export function getToolLabel(
  toolName: string,
  args: Record<string, unknown>
): string {
  const command = typeof args.command === "string" ? args.command : undefined;
  const path = typeof args.path === "string" ? args.path : undefined;
  const newPath = typeof args.new_path === "string" ? args.new_path : undefined;

  const filename = path ? basename(path) : "";
  const newFilename = newPath ? basename(newPath) : "";

  if (toolName === "str_replace_editor") {
    switch (command) {
      case "create":
        return filename ? `Creating ${filename}` : "Creating file";
      case "str_replace":
      case "insert":
        return filename ? `Editing ${filename}` : "Editing file";
      case "view":
        return filename ? `Reading ${filename}` : "Reading file";
      case "undo_edit":
        return filename ? `Undoing edit in ${filename}` : "Undoing edit";
    }
  }

  if (toolName === "file_manager") {
    switch (command) {
      case "rename":
        return filename && newFilename
          ? `Renaming ${filename} to ${newFilename}`
          : "Renaming file";
      case "delete":
        return filename ? `Deleting ${filename}` : "Deleting file";
    }
  }

  return toolName;
}

interface ToolCallBadgeProps {
  tool: ToolInvocation;
}

export function ToolCallBadge({ tool }: ToolCallBadgeProps) {
  const label = getToolLabel(tool.toolName, tool.args as Record<string, unknown>);
  const isLoading = tool.state !== "result";

  return (
    <div className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 bg-neutral-50 rounded-lg text-xs font-mono border border-neutral-200">
      {isLoading ? (
        <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
      ) : (
        <div className="w-2 h-2 rounded-full bg-emerald-500" />
      )}
      <span className="text-neutral-700">{label}</span>
    </div>
  );
}
