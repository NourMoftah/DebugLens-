import type { ContextError } from '../context/types.js';

/** A commit that affected the requested path. */
export interface GitCommit {
  author: string;
  changedFiles: string[];
  date: string;
  hash: string;
  message: string;
}

/** Safely collected local Git repository metadata. */
export interface GitContext {
  branch?: string;
  commits: GitCommit[];
  error?: ContextError;
  repositoryRoot?: string;
  status: 'available' | 'unavailable';
}

/** Options for collecting Git metadata without executing a shell. */
export interface GitContextOptions {
  filePath?: string;
  maxCommits?: number;
  projectRoot: string;
}
