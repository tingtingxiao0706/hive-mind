import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { parsePEP723Deps } from '../src/executor/runtime.js';
import {
  validatePath,
  validateAllowedTools,
  validateRuntime,
  truncateOutput,
  buildStrictEnv,
  PathTraversalError,
  ScriptNotAllowedError,
  RuntimeNotAllowedError,
} from '../src/executor/security.js';
import { createSkillTools } from '../src/executor/tools.js';
import type { SkillContent } from '../src/types.js';
import type { ScriptExecutor } from '../src/executor/index.js';

describe('parsePEP723Deps', () => {
  it('should parse PEP 723 inline dependencies', () => {
    const content = `#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "requests>=2.31.0",
#     "rich>=13.0.0",
# ]
# ///

import requests
print("hello")`;

    const deps = parsePEP723Deps(content);
    expect(deps).toEqual(['requests>=2.31.0', 'rich>=13.0.0']);
  });

  it('should return empty for scripts without PEP 723', () => {
    const content = `#!/usr/bin/env python3
import sys
print(sys.argv)`;

    const deps = parsePEP723Deps(content);
    expect(deps).toEqual([]);
  });

  it('should return empty for empty content', () => {
    expect(parsePEP723Deps('')).toEqual([]);
  });
});

describe('validatePath', () => {
  it('should allow valid relative paths', () => {
    const result = validatePath('scripts/format.sh', '/skill-dir');
    expect(result).toContain('scripts');
    expect(result).toContain('format.sh');
  });

  it('should reject path traversal with ../', () => {
    expect(() => validatePath('../../../etc/passwd', '/skill-dir'))
      .toThrow(PathTraversalError);
  });

  it('should reject absolute paths', () => {
    expect(() => validatePath('/etc/passwd', '/skill-dir'))
      .toThrow(PathTraversalError);
  });

  it('should reject disguised traversal', () => {
    expect(() => validatePath('scripts/../../secret', '/skill-dir'))
      .toThrow(PathTraversalError);
  });
});

describe('validateAllowedTools', () => {
  it('should pass when script is in allowed-tools', () => {
    expect(() =>
      validateAllowedTools(
        'scripts/format.sh',
        'Bash(scripts/format.sh) Bash(scripts/lint.py)',
      ),
    ).not.toThrow();
  });

  it('should throw when script is not in allowed-tools', () => {
    expect(() =>
      validateAllowedTools(
        'scripts/evil.sh',
        'Bash(scripts/format.sh)',
      ),
    ).toThrow(ScriptNotAllowedError);
  });

  it('should pass when allowed-tools is undefined', () => {
    expect(() => validateAllowedTools('scripts/anything.sh')).not.toThrow();
  });
});

describe('validateRuntime', () => {
  it('should pass for allowed runtimes', () => {
    expect(() => validateRuntime('bash', ['bash', 'python', 'node'])).not.toThrow();
  });

  it('should throw for disallowed runtimes', () => {
    expect(() => validateRuntime('ruby', ['bash', 'python', 'node']))
      .toThrow(RuntimeNotAllowedError);
  });

  it('should pass when allowed list is empty (no restrictions)', () => {
    expect(() => validateRuntime('anything', [])).not.toThrow();
  });
});

describe('truncateOutput', () => {
  it('should not truncate short output', () => {
    const output = 'Hello, world!';
    expect(truncateOutput(output, 1000)).toBe(output);
  });

  it('should truncate long output', () => {
    const output = 'x'.repeat(100);
    const result = truncateOutput(output, 50);
    expect(result.length).toBeLessThan(100 + 100);
    expect(result).toContain('truncated');
    expect(result).toContain('50 chars omitted');
  });
});

describe('buildStrictEnv', () => {
  it('should include PATH and HOME', () => {
    const env = buildStrictEnv();
    expect('PATH' in env).toBe(true);
    expect('HOME' in env).toBe(true);
  });

  it('should merge user env vars', () => {
    const env = buildStrictEnv({ CUSTOM_VAR: 'value' });
    expect(env['CUSTOM_VAR']).toBe('value');
  });

  it('should not leak process env in strict mode', () => {
    const env = buildStrictEnv();
    const envKeys = Object.keys(env);
    expect(envKeys.length).toBeLessThan(Object.keys(process.env).length);
  });
});

describe('read_resource with linkedFiles', () => {
  const FIXTURES_DIR = path.resolve(__dirname, '__fixtures_read_resource__');
  const skillDir = path.join(FIXTURES_DIR, 'my-skill');
  const externalDir = path.join(FIXTURES_DIR, 'external-docs');
  const skillPath = path.join(skillDir, 'SKILL.md');

  const linkedFilePath = path.join(externalDir, 'guide.md');
  const unlinkedFilePath = path.join(externalDir, 'secret.md');

  beforeAll(async () => {
    await fs.mkdir(skillDir, { recursive: true });
    await fs.mkdir(externalDir, { recursive: true });
    await fs.writeFile(skillPath, '---\nname: test\ndescription: test\n---\n# Test');
    await fs.writeFile(linkedFilePath, '# Linked Guide Content');
    await fs.writeFile(unlinkedFilePath, '# Secret Content');
  });

  afterAll(async () => {
    await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
  });

  function makeSkill(linkedFiles: string[]): SkillContent {
    return {
      name: 'test-skill',
      description: 'test',
      path: skillPath,
      body: '',
      frontmatter: { name: 'test-skill', description: 'test' },
      scripts: [],
      references: [],
      assets: [],
      linkedFiles,
    };
  }

  it('should allow reading a file in linkedFiles whitelist', async () => {
    const skill = makeSkill([linkedFilePath]);
    const dummyExecutor = {} as ScriptExecutor;
    const tools = createSkillTools(dummyExecutor, skill);
    expect(tools['read_resource']).toBeDefined();

    const result = await tools['read_resource'].execute(
      { path: path.relative(skillDir, linkedFilePath) },
      { toolCallId: 'test', messages: [] },
    );
    expect(result.content).toBe('# Linked Guide Content');
  });

  it('should reject reading a file not in linkedFiles and outside skill dir', async () => {
    const skill = makeSkill([linkedFilePath]);
    const dummyExecutor = {} as ScriptExecutor;
    const tools = createSkillTools(dummyExecutor, skill);

    const result = await tools['read_resource'].execute(
      { path: path.relative(skillDir, unlinkedFilePath) },
      { toolCallId: 'test', messages: [] },
    );
    expect(result.error).toBe('Path traversal detected');
  });
});
