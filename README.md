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

The server also automatically adds its working directory (`process.cwd()`) as an allowed directory. This means when launched from a project folder, files in that folder can be trashed without explicitly listing it in the arguments.

## Claude Code Configuration

Add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "trash": {
      "command": "npx",
      "args": ["trash-mcp", "/Users/you/Downloads", "/tmp"]
    }
  }
}
```

No need to add your project directory — the server picks it up automatically from the working directory.

## Tool: trash

Moves files or directories to system trash.

**Input:**
- `paths` (string[]) — array of absolute paths to move to trash

**Example response:**

```text
🗑️ /Users/you/projects/old-file.txt
❌ /etc/passwd — Access denied — outside allowed directories
```

## Security

- Only files within explicitly allowed directories or the working directory can be trashed
- Symlink targets are resolved and validated (prevents symlink attacks)
- Server refuses to start without at least one accessible CLI arg directory
- Files are moved to trash, never permanently deleted

---
