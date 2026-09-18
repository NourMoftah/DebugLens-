#!/usr/bin/env node

/* global process */

import { run } from '../dist/index.js';

const exitCode = run(process.argv.slice(2));
if (exitCode !== 0) {
  process.exitCode = exitCode;
}
