#!/usr/bin/env node

/* global process */

import { run } from '../dist/index.js';

const exitCode = await run(process.argv.slice(2));
process.exitCode = exitCode;
