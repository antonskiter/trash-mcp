#!/usr/bin/env node
import path from "node:path";
import { promises as fs } from "node:fs";
import os from "node:os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import trash from "trash";

// --- Path validation ---

export function isPathWithinAllowedDirectories(
  filePath: string,
  allowedDirectories: string[]
): boolean {
  const normalized = path.normalize(path.resolve(filePath));
  return allowedDirectories.some(
    (dir) => normalized === dir || normalized.startsWith(dir + path.sep)
  );
}

function expandHome(filePath: string): string {
  if (filePath === "~" || filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

export async function initAllowedDirectories(
  args: string[]
): Promise<string[]> {
  const directories: string[] = [];

  for (const arg of args) {
    const expanded = expandHome(arg);
    const resolved = path.resolve(expanded);

    try {
      const stat = await fs.stat(resolved);
      if (!stat.isDirectory()) {
        console.error(`Warning: ${arg} is not a directory, skipping`);
        continue;
      }
    } catch {
      console.error(`Warning: ${arg} does not exist or is not accessible, skipping`);
      continue;
    }

    try {
      const real = await fs.realpath(resolved);
      // Store both original and realpath-resolved to handle symlinked dirs (e.g. /tmp -> /private/tmp)
      if (!directories.includes(resolved)) directories.push(resolved);
      if (!directories.includes(real)) directories.push(real);
    } catch {
      if (!directories.includes(resolved)) directories.push(resolved);
    }
  }

  // Auto-cwd: always add process.cwd() as an allowed directory if accessible
  try {
    const cwdResolved = path.resolve(process.cwd());
    const cwdStat = await fs.stat(cwdResolved);
    if (cwdStat.isDirectory()) {
      const cwdReal = await fs.realpath(cwdResolved);
      if (!directories.includes(cwdResolved)) directories.push(cwdResolved);
      if (!directories.includes(cwdReal)) directories.push(cwdReal);
    }
  } catch {
    // cwd is inaccessible or throws — silently skip
  }

  return directories;
}

export type ValidationResult =
  | { valid: true; resolvedPath: string }
  | { valid: false; error: string };

export async function validatePath(
  requestedPath: string,
  allowedDirectories: string[]
): Promise<ValidationResult> {
  // 1. Must be absolute
  if (!path.isAbsolute(requestedPath)) {
    return { valid: false, error: "Path must be absolute" };
  }

  // 2. Normalize
  const normalized = path.normalize(path.resolve(requestedPath));

  // 3. Check normalized path against allowed dirs
  if (!isPathWithinAllowedDirectories(normalized, allowedDirectories)) {
    return {
      valid: false,
      error: "Access denied — outside allowed directories",
    };
  }

  // 4. Check existence
  try {
    await fs.lstat(normalized);
  } catch {
    return { valid: false, error: "Path does not exist" };
  }

  // 5. Resolve symlinks and re-check
  try {
    const real = await fs.realpath(normalized);
    if (!isPathWithinAllowedDirectories(real, allowedDirectories)) {
      return {
        valid: false,
        error: "Access denied — symlink target outside allowed directories",
      };
    }
    return { valid: true, resolvedPath: normalized };
  } catch {
    // realpath failed but lstat succeeded — it's a broken symlink; still allow trashing it
    return { valid: true, resolvedPath: normalized };
  }
}

// --- MCP Server ---

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error(
      "Error: No allowed directories specified.\n" +
        "Usage: trash-mcp <allowed-dir> [allowed-dir ...]\n" +
        "Example: trash-mcp /Users/me/projects /Users/me/Downloads"
    );
    process.exit(1);
  }

  const allowedDirectories = await initAllowedDirectories(args);

  if (allowedDirectories.length === 0) {
    console.error("Error: None of the specified directories are accessible.");
    process.exit(1);
  }

  console.error(
    `trash-mcp: allowed directories: ${allowedDirectories.join(", ")}`
  );

  const server = new McpServer({
    name: "trash-mcp",
    version: "1.0.0",
  });

  server.tool(
    "trash",
    "Move files or directories to system trash (recycle bin). Never permanently deletes. Set verbose=true to see per-file results.",
    {
      paths: z
        .array(z.string())
        .min(1)
        .describe("Array of absolute file/directory paths to move to trash"),
      verbose: z
        .boolean()
        .default(false)
        .describe("Show per-file results instead of summary (default: false)"),
    },
    async ({ paths, verbose }) => {
      const results: Array<{
        path: string;
        status: "trashed" | "error";
        error?: string;
      }> = [];

      for (const filePath of paths) {
        const validation = await validatePath(filePath, allowedDirectories);

        if (!validation.valid) {
          results.push({
            path: filePath,
            status: "error",
            error: validation.error,
          });
          continue;
        }

        try {
          await trash(validation.resolvedPath);
          results.push({ path: filePath, status: "trashed" });
        } catch (err) {
          results.push({
            path: filePath,
            status: "error",
            error: `Failed to trash: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }

      const hasErrors = results.some((r) => r.status === "error");
      const errorLines = results
        .filter((r) => r.status === "error")
        .map((r) => `❌ ${r.path} — ${r.error}`);

      let lines: string[];
      if (verbose) {
        lines = results.map((r) =>
          r.status === "trashed"
            ? `🗑️ ${r.path}`
            : `❌ ${r.path} — ${r.error}`
        );
      } else {
        const trashedCount = results.filter((r) => r.status === "trashed").length;
        lines = [`${trashedCount} files trashed`, ...errorLines];
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        isError: hasErrors,
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only run when executed directly, not when imported by tests
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
