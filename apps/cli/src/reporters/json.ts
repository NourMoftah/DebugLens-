import type { CliAnalysisResult } from '../types.js';

/** Serializes the existing core analysis models without terminal decoration. */
export function formatJsonReport(result: CliAnalysisResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}
