# DebugLens

DebugLens is an open-source, local-first debugging engine and command-line tool. It is currently in **Phase 3: Source Code, TypeScript, and Dependency Analysis**.

This release establishes the TypeScript monorepo, reusable core package, executable CLI shell, quality tooling, deterministic error parsing, and local project-context collection. Root-cause analysis and bug-fixing capabilities are intentionally not implemented yet.

## Requirements

- Node.js 20.10 or newer
- pnpm 10 or newer

## Development setup

```bash
git clone <repository-url>
cd debuglens
pnpm install
```

## CLI

Build first, then run the local executable:

```bash
pnpm build
pnpm exec debuglens --version
pnpm exec debuglens --help
```

For development, `pnpm dev` builds and runs the local CLI (showing its help message).

## Analyze an error

Provide pasted error text and the project root to inspect:

```bash
pnpm exec debuglens analyze \
  --project . \
  --error "TypeError: Cannot read properties of undefined (reading 'map')
    at render (/path/to/project/src/app.ts:42:10)"
```

Use `--error-file relative/path/to/error.log` for project-local error text, or `--json` for the same structured analysis as machine-readable JSON.

Exit codes: `0` means analysis completed without a probable cause, `1` means a probable cause was found, `2` is invalid input, and `3` is a tooling failure.

## Developer workflow

DebugLens discovers the nearest project root when started from a nested path. Focus a source location without a pasted stack trace:

```bash
pnpm exec debuglens analyze --file src/app.ts --line 42 --project .
```

Use CI-friendly deterministic terminal output with `--ci`; combine it with `--json` for machine processing. Watch an error while editing project files with:

```bash
pnpm exec debuglens watch --error-file error.log --project .
```

Create an optional `debuglens.config.ts` at the project root:

```ts
export default {
  maxSourceContext: 3,
  git: true,
  typescript: true,
  dependencies: true,
  ignoredDirectories: ['node_modules', 'dist'],
  reporter: 'terminal',
  watch: { debounceMs: 250 },
};
```

Configuration is validated before analysis. Omitted options use safe defaults.

## Quality checks

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build
```

## Current scope

- CLI installation and help/version behavior
- Public core-package entry point with `parseError(rawError)`
- Common Node.js/V8 error headings and stack-frame parsing
- Safe source windows, local TypeScript compiler diagnostics, and package.json dependency metadata
- Strict TypeScript, Vitest, ESLint, Prettier, and GitHub Actions

Future phases will add root-cause analysis and additional debugging capabilities. DebugLens does not yet rank causes or fix bugs.
