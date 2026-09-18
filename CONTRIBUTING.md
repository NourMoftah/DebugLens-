# Contributing to DebugLens

1. Clone the repository and enter it:

   ```bash
   git clone <repository-url>
   cd debuglens
   ```

2. Install dependencies with `pnpm install`.
3. Create a focused branch: `git switch -c your-change`.
4. Make your change and add or update relevant tests.
5. Run the checks before opening a pull request:

   ```bash
   pnpm test
   pnpm lint
   pnpm typecheck
   pnpm format:check
   pnpm build
   ```

6. Submit a pull request with a clear summary and test results.

Please keep changes focused, maintain strict TypeScript, and avoid adding dependencies unless they are necessary.
