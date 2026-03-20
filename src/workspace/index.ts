import type {
  HiveMindConfig,
  WorkspaceConfig,
  SkillSource,
  ModelConfig,
  ScriptConfig,
  Logger,
} from '../types.js';
import { createLogger } from '../utils/logger.js';

/**
 * Manages workspace isolation — each workspace has its own
 * skill sources, model config, and script security settings.
 */
export class WorkspaceManager {
  private workspaces = new Map<string, WorkspaceConfig>();
  private activeWorkspace: string | undefined;
  private logger: Logger;

  constructor(
    config?: HiveMindConfig,
    logger?: Logger,
  ) {
    this.logger = logger ?? createLogger();

    if (config?.workspace) {
      this.activeWorkspace = config.workspace;
    }
  }

  register(config: WorkspaceConfig): void {
    this.workspaces.set(config.name, config);
    this.logger.debug(`Registered workspace "${config.name}"`);
  }

  activate(name: string): void {
    if (!this.workspaces.has(name)) {
      throw new Error(`Workspace "${name}" is not registered`);
    }
    this.activeWorkspace = name;
    this.logger.info(`Activated workspace "${name}"`);
  }

  getActive(): string | undefined {
    return this.activeWorkspace;
  }

  /** Resolve skill sources for the active workspace (or global fallback) */
  resolveSkills(globalSkills: SkillSource[]): SkillSource[] {
    const ws = this.getActiveConfig();
    return ws?.skills ?? globalSkills;
  }

  /** Resolve model config for the active workspace (or global fallback) */
  resolveModels(globalModels: ModelConfig): ModelConfig {
    const ws = this.getActiveConfig();
    if (ws?.models) {
      return { ...globalModels, ...ws.models };
    }
    return globalModels;
  }

  /** Resolve script config for the active workspace (or global fallback) */
  resolveScripts(globalScripts?: ScriptConfig): ScriptConfig | undefined {
    const ws = this.getActiveConfig();
    if (ws?.scripts) {
      return { ...globalScripts, ...ws.scripts };
    }
    return globalScripts;
  }

  private getActiveConfig(): WorkspaceConfig | undefined {
    if (!this.activeWorkspace) return undefined;
    return this.workspaces.get(this.activeWorkspace);
  }
}
