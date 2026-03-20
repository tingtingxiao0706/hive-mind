import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { SandboxExecutor } from '../src/executor/sandbox.js';

let tempDir: string;

beforeAll(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hive-sandbox-'));
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('SandboxExecutor', () => {
  const sandbox = new SandboxExecutor();

  it('should identify sandboxable extensions', () => {
    expect(sandbox.canSandbox('js')).toBe(true);
    expect(sandbox.canSandbox('mjs')).toBe(true);
    expect(sandbox.canSandbox('cjs')).toBe(true);
    expect(sandbox.canSandbox('py')).toBe(false);
    expect(sandbox.canSandbox('sh')).toBe(false);
    expect(sandbox.canSandbox('ts')).toBe(false);
  });

  it('should execute a simple JS script in sandbox', async () => {
    const scriptPath = path.join(tempDir, 'hello.js');
    await fs.writeFile(scriptPath, `console.log("hello sandbox");`);

    const result = await sandbox.execute({
      scriptPath,
      skillDir: tempDir,
      maxOutputSize: 10_000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello sandbox');
  });

  it('should capture process.argv', async () => {
    const scriptPath = path.join(tempDir, 'args.js');
    await fs.writeFile(scriptPath, `console.log(process.argv.join(','));`);

    const result = await sandbox.execute({
      scriptPath,
      args: ['--name', 'test'],
      skillDir: tempDir,
      maxOutputSize: 10_000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--name');
    expect(result.stdout).toContain('test');
  });

  it('should enforce CPU time limit', async () => {
    const scriptPath = path.join(tempDir, 'infinite.js');
    await fs.writeFile(scriptPath, `while(true) {}`);

    const result = await sandbox.execute({
      scriptPath,
      skillDir: tempDir,
      config: { cpuTimeLimitMs: 100 },
      maxOutputSize: 10_000,
    });

    // Exit code 124 for timeout, or 1 if the error format differs
    expect(result.exitCode).not.toBe(0);
    // Should mention either CPU limit or timed out
    expect(
      result.stderr.includes('CPU time limit') ||
      result.stderr.includes('timed out') ||
      result.stderr.includes('Script execution timed out'),
    ).toBe(true);
  });

  it('should not expose require()', async () => {
    const scriptPath = path.join(tempDir, 'no-require.js');
    await fs.writeFile(scriptPath, `
      try {
        require('fs');
        console.log('FAIL: require available');
      } catch (e) {
        console.log('OK: require blocked');
      }
    `);

    const result = await sandbox.execute({
      scriptPath,
      skillDir: tempDir,
      maxOutputSize: 10_000,
    });

    expect(result.stdout).toContain('OK: require blocked');
  });

  it('should not expose setTimeout/setInterval', async () => {
    const scriptPath = path.join(tempDir, 'no-timers.js');
    await fs.writeFile(scriptPath, `
      console.log('setTimeout:', typeof setTimeout);
      console.log('setInterval:', typeof setInterval);
    `);

    const result = await sandbox.execute({
      scriptPath,
      skillDir: tempDir,
      maxOutputSize: 10_000,
    });

    expect(result.stdout).toContain('setTimeout: undefined');
    expect(result.stdout).toContain('setInterval: undefined');
  });

  it('should restrict env vars to declared permissions', async () => {
    const scriptPath = path.join(tempDir, 'env.js');
    await fs.writeFile(scriptPath, `
      console.log('PATH:', typeof process.env.PATH);
      console.log('ALLOWED:', process.env.ALLOWED_VAR);
    `);

    const result = await sandbox.execute({
      scriptPath,
      env: { ALLOWED_VAR: 'yes', SECRET: 'no' },
      skillDir: tempDir,
      config: {
        permissions: {
          env: ['ALLOWED_VAR'],
        },
      },
      maxOutputSize: 10_000,
    });

    expect(result.stdout).toContain('ALLOWED: yes');
    expect(result.stdout).toContain('PATH: undefined');
  });

  it('should capture stderr from console.error', async () => {
    const scriptPath = path.join(tempDir, 'stderr.js');
    await fs.writeFile(scriptPath, `
      console.log("stdout line");
      console.error("stderr line");
    `);

    const result = await sandbox.execute({
      scriptPath,
      skillDir: tempDir,
      maxOutputSize: 10_000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('stdout line');
    expect(result.stderr).toContain('stderr line');
  });

  it('should handle script errors gracefully', async () => {
    const scriptPath = path.join(tempDir, 'error.js');
    await fs.writeFile(scriptPath, `throw new Error("test error");`);

    const result = await sandbox.execute({
      scriptPath,
      skillDir: tempDir,
      maxOutputSize: 10_000,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('test error');
  });

  it('should handle missing script file', async () => {
    const result = await sandbox.execute({
      scriptPath: path.join(tempDir, 'nonexistent.js'),
      skillDir: tempDir,
      maxOutputSize: 10_000,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Failed to read script');
  });

  it('should block fetch when net permission is false', async () => {
    const scriptPath = path.join(tempDir, 'no-net.js');
    await fs.writeFile(scriptPath, `
      console.log('fetch:', typeof fetch);
    `);

    const result = await sandbox.execute({
      scriptPath,
      skillDir: tempDir,
      config: { permissions: { net: false } },
      maxOutputSize: 10_000,
    });

    expect(result.stdout).toContain('fetch: undefined');
  });
});
