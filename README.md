# trash-mcp

MCP server for safe file deletion via system trash. Moves files to macOS Trash, Linux freedesktop trash, or Windows Recycle Bin. Never permanently deletes files.

## Installation

```bash
npm install -g trash-mcp
```

## Usage

```bash
trash-mcp /allowed/dir1 /allowed/dir2
```

All arguments are directories that the server is allowed to trash files from. Paths outside these directories will be rejected.

## Claude Code Configuration

Add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "trash": {
      "command": "npx",
      "args": ["trash-mcp", "/Users/you/projects", "/Users/you/Downloads"]
    }
  }
}
```

## Tool: trash

Moves files or directories to system trash.

**Input:**
- `paths` (string[]) — array of absolute paths to move to trash

**Example response:**

```json
{
  "results": [
    { "path": "/Users/you/projects/old-file.txt", "status": "trashed" },
    { "path": "/etc/passwd", "status": "error", "error": "Access denied - path outside allowed directories" }
  ]
}
```

## Security

- Only files within explicitly allowed directories can be trashed
- Symlink targets are resolved and validated (prevents symlink attacks)
- Server refuses to start without allowed directories
- Files are moved to trash, never permanently deleted

---
