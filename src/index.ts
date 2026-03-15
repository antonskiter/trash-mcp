import path from "node:path";
import { promises as fs } from "node:fs";
import os from "node:os";

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
      error: `Access denied - path outside allowed directories: ${requestedPath}`,
    };
  }

  // 4. Check existence
  try {
    await fs.lstat(normalized);
  } catch {
    return { valid: false, error: `Path does not exist: ${requestedPath}` };
  }

  // 5. Resolve symlinks and re-check
  try {
    const real = await fs.realpath(normalized);
    if (!isPathWithinAllowedDirectories(real, allowedDirectories)) {
      return {
        valid: false,
        error: `Access denied - symlink target outside allowed directories: ${requestedPath}`,
      };
    }
    return { valid: true, resolvedPath: normalized };
  } catch {
    // realpath failed but lstat succeeded — it's a broken symlink; still allow trashing it
    return { valid: true, resolvedPath: normalized };
  }
}
