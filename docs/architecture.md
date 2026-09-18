# Architecture

DebugLens processes local diagnostic text in a deterministic pipeline:

```text
CLI input
  → error/stack parser
  → project discovery and configuration
  → source, TypeScript, dependency, and Git context
  → root-cause rules
  → terminal or JSON reporter
```

`packages/core` owns reusable analysis. `diagnostics` normalizes V8/Node error text; `context` collects project-local source windows, compiler diagnostics, and package declarations; `git` uses fixed argument arrays with no shell; `root-cause` converts observed facts into conservative evidence and suggestions.

`apps/cli` owns command parsing, safe project-local error-file reads, project discovery, static configuration loading, reporting, CI behavior, and watch lifecycle. It composes core APIs rather than duplicating their analysis logic.

All filesystem collection is constrained to the requested project root. Symlinks are resolved before file reads, source files have a size limit, Git history is bounded, and configuration accepts static object literals only.
