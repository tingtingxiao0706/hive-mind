import { describe, it, expect } from 'vitest';
import { parseXHive } from '../src/loader/extensions.js';

describe('parseXHive', () => {
  it('should parse complete x-hive config', () => {
    const result = parseXHive({
      agent: true,
      maxSteps: 15,
      workspace: 'backend',
      scripts: {
        approval: true,
        timeout: 120000,
        runtimes: ['bash', 'python'],
      },
      models: {
        preferred: 'reasoning',
        fallback: 'default',
      },
    });

    expect(result).toEqual({
      agent: true,
      maxSteps: 15,
      workspace: 'backend',
      scripts: {
        approval: true,
        timeout: 120000,
        runtimes: ['bash', 'python'],
      },
      models: {
        preferred: 'reasoning',
        fallback: 'default',
      },
    });
  });

  it('should parse partial config', () => {
    const result = parseXHive({ agent: true });
    expect(result).toEqual({ agent: true });
  });

  it('should return undefined for falsy input', () => {
    expect(parseXHive(null)).toBeUndefined();
    expect(parseXHive(undefined)).toBeUndefined();
    expect(parseXHive('')).toBeUndefined();
    expect(parseXHive(0)).toBeUndefined();
  });

  it('should return undefined for empty object', () => {
    expect(parseXHive({})).toBeUndefined();
  });

  it('should filter non-string runtimes', () => {
    const result = parseXHive({
      scripts: {
        runtimes: ['bash', 123, null, 'python'],
      },
    });
    expect(result?.scripts?.runtimes).toEqual(['bash', 'python']);
  });

  it('should ignore unknown fields', () => {
    const result = parseXHive({
      agent: true,
      unknownField: 'ignored',
    });
    expect(result).toEqual({ agent: true });
  });
});
