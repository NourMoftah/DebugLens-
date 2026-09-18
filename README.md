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
