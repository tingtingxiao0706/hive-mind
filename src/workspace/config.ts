import type { WorkspaceConfig, SkillSource, ModelConfig, ScriptConfig } from '../types.js';

export interface ResolvedWorkspaceConfig {
  name: string;
  skills: SkillSource[];
  models?: ModelConfig;
  scripts?: ScriptConfig;
}

export function resolveWorkspaceConfig(
  config: WorkspaceConfig,
): ResolvedWorkspaceConfig {
  return {
    name: config.name,
    skills: config.skills,
    models: config.models,
    scripts: config.scripts,
  };
}
