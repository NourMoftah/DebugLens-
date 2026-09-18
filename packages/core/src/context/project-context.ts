import { getDependencyContext } from './dependencies.js';
import { getSourceContext } from './source.js';
import { getTypeScriptContext } from './typescript.js';
import type { ProjectContext, ProjectContextOptions } from './types.js';

/** Collects deterministic local source, TypeScript, and dependency context. */
export async function getProjectContext(options: ProjectContextOptions): Promise<ProjectContext> {
  const [source, typescript, dependencies] = await Promise.all([
    getSourceContext(options),
    getTypeScriptContext(options.projectRoot),
    getDependencyContext(options.projectRoot),
  ]);

  return { dependencies, source, typescript };
}
