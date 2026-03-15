# trash-mcp

MCP server for safe file deletion via system trash. TypeScript, Node.js, ES modules.

## Commands

- Build: `npm run build`
- Test: `npm test` (vitest, single run)
- Dev: `npm start` (tsx)

## Conventions

- 2-space indent, semicolons, camelCase functions, PascalCase types
- `node:` prefix for built-in imports
- Strict TypeScript, async/await, early returns for validation
- Tests in `src/__tests__/`, run via vitest MCP (not Bash)
- No eslint/prettier config — rely on TypeScript strict mode
