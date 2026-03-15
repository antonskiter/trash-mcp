import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  initAllowedDirectories,
  validatePath,
  isPathWithinAllowedDirectories,
} from "../index.js";

let testDir: string;
let subDir: string;

beforeAll(async () => {
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), "trash-mcp-test-"));
  subDir = path.join(testDir, "subdir");
  await fs.mkdir(subDir, { recursive: true });
  await fs.writeFile(path.join(subDir, "file.txt"), "test");
});

afterAll(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

describe("isPathWithinAllowedDirectories", () => {
  it("allows exact directory match", () => {
    expect(isPathWithinAllowedDirectories("/allowed", ["/allowed"])).toBe(true);
  });

  it("allows subdirectory", () => {
    expect(
      isPathWithinAllowedDirectories("/allowed/sub/file.txt", ["/allowed"])
    ).toBe(true);
  });

  it("rejects path outside allowed directories", () => {
    expect(
      isPathWithinAllowedDirectories("/other/file.txt", ["/allowed"])
    ).toBe(false);
  });

  it("prevents prefix attacks (/allowed vs /allowedOther)", () => {
    expect(
      isPathWithinAllowedDirectories("/allowedOther/file.txt", ["/allowed"])
    ).toBe(false);
  });

  it("rejects empty allowed directories", () => {
    expect(isPathWithinAllowedDirectories("/any/path", [])).toBe(false);
  });
});

describe("initAllowedDirectories", () => {
  it("resolves real paths", async () => {
    const dirs = await initAllowedDirectories([testDir]);
    expect(dirs.length).toBeGreaterThan(0);
    // Each entry should be a real absolute path
    for (const dir of dirs) {
      expect(path.isAbsolute(dir)).toBe(true);
    }
  });

  it("expands ~ to homedir", async () => {
    const dirs = await initAllowedDirectories(["~"]);
    expect(dirs).toContain(os.homedir());
  });

  it("skips non-existent directories with warning", async () => {
    const dirs = await initAllowedDirectories(["/nonexistent-dir-xyz"]);
    expect(dirs).toEqual([]);
  });
});

describe("validatePath", () => {
  it("accepts valid absolute path within allowed dirs", async () => {
    const allowed = await initAllowedDirectories([testDir]);
    const filePath = path.join(subDir, "file.txt");
    const result = await validatePath(filePath, allowed);
    expect(result.valid).toBe(true);
  });

  it("rejects relative paths", async () => {
    const allowed = await initAllowedDirectories([testDir]);
    const result = await validatePath("relative/path.txt", allowed);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("absolute");
  });

  it("rejects paths outside allowed directories", async () => {
    const allowed = await initAllowedDirectories([testDir]);
    const result = await validatePath("/etc/passwd", allowed);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("outside allowed");
  });

  it("rejects non-existent files", async () => {
    const allowed = await initAllowedDirectories([testDir]);
    const result = await validatePath(
      path.join(testDir, "nonexistent.txt"),
      allowed
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("does not exist");
  });

  it("rejects symlinks pointing outside allowed dirs", async () => {
    const linkPath = path.join(testDir, "evil-link");
    await fs.symlink("/etc/hosts", linkPath);
    const allowed = await initAllowedDirectories([testDir]);
    const result = await validatePath(linkPath, allowed);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("outside allowed");
    await fs.unlink(linkPath);
  });
});

describe("auto-cwd in initAllowedDirectories", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cwd is subdirectory of allowed dir", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(subDir);
    const dirs = await initAllowedDirectories([testDir]);
    expect(dirs.some((d) => d === subDir || d.startsWith(subDir))).toBe(true);
  });

  it("cwd equals an allowed dir — no duplicate", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(testDir);
    const dirs = await initAllowedDirectories([testDir]);
    const count = dirs.filter((d) => d === testDir).length;
    expect(count).toBe(1);
  });

  it("cwd is outside all allowed dirs — not added", async () => {
    vi.spyOn(process, "cwd").mockReturnValue("/usr/local/somewhere");
    const dirs = await initAllowedDirectories([testDir]);
    expect(dirs.some((d) => d.startsWith("/usr/local/somewhere"))).toBe(false);
  });

  it("cwd is broader than allowed dirs — not added (no permission escalation)", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(testDir);
    const dirs = await initAllowedDirectories([subDir]);
    expect(dirs.some((d) => d === testDir)).toBe(false);
  });

  it("cwd is inaccessible / throws — no throw, returns only CLI arg dirs", async () => {
    vi.spyOn(process, "cwd").mockImplementation(() => {
      throw Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" });
    });
    const dirs = await initAllowedDirectories([testDir]);
    expect(dirs.length).toBeGreaterThan(0);
    expect(dirs.some((d) => d === testDir || d.includes("trash-mcp-test"))).toBe(true);
  });
});
