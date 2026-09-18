# DebugLens

DebugLens is an open-source, local-first JavaScript and TypeScript diagnostic tool. Paste an error or target a source location and it combines stack parsing, source context, TypeScript diagnostics, dependency declarations, and bounded Git history into a deterministic report. It does not use AI or modify code.

## Requirements

- Node.js 20.10 or newer
- pnpm 10 or newer

## Development setup

```bash
git clone <repository-url>
cd debuglens
pnpm install
```

## Installation and development

Build first, then run the local executable:

```bash
pnpm build
pnpm exec debuglens --version
pnpm exec debuglens --help
```

For development, `pnpm dev` builds and runs the local CLI.

## Usage

Provide pasted error text and the project root to inspect:

```bash
pnpm exec debuglens analyze \
  --project . \
  --error "TypeError: Cannot read properties of undefined (reading 'map')
    at render (/path/to/project/src/app.ts:42:10)"
```

Use `--error-file relative/path/to/error.log` for project-local error text, or `--json` for the same structured analysis as machine-readable JSON.

Exit codes: `0` means analysis completed without a probable cause, `1` means a probable cause was found, `2` is invalid input, and `3` is a tooling failure.

### Focused analysis

DebugLens discovers the nearest project root when started from a nested path. Focus a source location without a pasted stack trace:

```bash
pnpm exec debuglens analyze --file src/app.ts --line 42 --project .
```

### Watch and CI

Use CI-friendly deterministic terminal output with `--ci`; combine it with `--json` for machine processing. Watch an error while editing project files with:

```bash
pnpm exec debuglens watch --error-file error.log --project .
```

### Configuration

Create an optional `debuglens.config.ts` at the project root. It must contain a static default object; DebugLens never executes configuration code:

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

## Architecture and project structure

See [architecture documentation](docs/architecture.md). The repository is organized as:

```text
apps/cli/       developer-facing commands and reporters
packages/core/  parser, context collectors, Git, and root-cause engine
examples/       minimal reproducible error inputs
docs/           architecture notes
```

## Capabilities

- V8/Node error and stack parsing, including common Windows and Unix paths
- Bounded, project-root-safe source context
- Local TypeScript compiler diagnostics and package dependency metadata
- Fixed-argument Git history collection
- Deterministic evidence, confidence, and suggestions
- Human-readable reports, stable JSON, focused analysis, CI mode, and watch mode

## Development and testing

```bash
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Limitations and roadmap

DebugLens supports common Node.js/V8 stacks and conservative deterministic rules. It does not yet provide semantic AST analysis, automatic fixes, IDE integration, cloud services, telemetry, or AI/LLM analysis. Future work can add more runtime formats and framework-specific plugins while preserving the local-first core.

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
