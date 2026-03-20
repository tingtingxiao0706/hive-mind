import type { XHiveConfig } from '../types.js';

/**
 * Parse x-hive extension block from SKILL.md frontmatter.
 * Returns undefined if the input is falsy or not an object.
 */
export function parseXHive(raw: unknown): XHiveConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const obj = raw as Record<string, unknown>;
  const config: XHiveConfig = {};

  if (typeof obj['agent'] === 'boolean') config.agent = obj['agent'];
  if (typeof obj['maxSteps'] === 'number') config.maxSteps = obj['maxSteps'];
  if (typeof obj['workspace'] === 'string') config.workspace = obj['workspace'];

  if (obj['scripts'] && typeof obj['scripts'] === 'object') {
    const s = obj['scripts'] as Record<string, unknown>;
    config.scripts = {};
    if (typeof s['approval'] === 'boolean') config.scripts.approval = s['approval'];
    if (typeof s['timeout'] === 'number') config.scripts.timeout = s['timeout'];
    if (Array.isArray(s['runtimes'])) {
      config.scripts.runtimes = s['runtimes'].filter(
        (r): r is string => typeof r === 'string',
      );
    }
  }

  if (obj['models'] && typeof obj['models'] === 'object') {
    const m = obj['models'] as Record<string, unknown>;
    config.models = {};
    if (typeof m['preferred'] === 'string') config.models.preferred = m['preferred'];
    if (typeof m['fallback'] === 'string') config.models.fallback = m['fallback'];
  }

  return Object.keys(config).length > 0 ? config : undefined;
}
