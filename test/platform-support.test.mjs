import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isLinuxArm64Musl,
  isUsableRipgrepCommand,
  getRipgrepVersion,
  resolveWindowsSystemExecutable,
} from '../scripts/platform-support.mjs';

test('Windows System32 tools follow SystemRoot instead of assuming drive C', () => {
  const expected = 'D:\\Windows\\System32\\tar.exe';
  const result = resolveWindowsSystemExecutable('tar.exe', {
    env: { SystemRoot: 'D:\\Windows' },
    fileExists: path => path === expected,
  });
  assert.equal(result, expected);
});

test('Windows System32 resolution fails closed for missing or unsafe roots', () => {
  assert.equal(
    resolveWindowsSystemExecutable('tar.exe', {
      env: { SystemRoot: 'relative\\Windows', WINDIR: 'E:\\Windows\nother' },
      fileExists: () => true,
    }),
    null,
  );
  assert.equal(
    resolveWindowsSystemExecutable('..\\taskkill.exe', {
      env: { SystemRoot: 'D:\\Windows' },
      fileExists: () => true,
    }),
    null,
  );
});

test('Linux ARM64 musl detection is narrow and treats unknown reports safely', () => {
  assert.equal(
    isLinuxArm64Musl({
      platform: 'linux',
      arch: 'arm64',
      getReport: () => ({ header: {} }),
    }),
    true,
  );
  assert.equal(
    isLinuxArm64Musl({
      platform: 'linux',
      arch: 'arm64',
      getReport: () => ({ header: { glibcVersionRuntime: '2.39' } }),
    }),
    false,
  );
  assert.equal(
    isLinuxArm64Musl({
      platform: 'linux',
      arch: 'x64',
      getReport: () => ({ header: {} }),
    }),
    false,
  );
  assert.equal(
    isLinuxArm64Musl({
      platform: 'linux',
      arch: 'arm64',
      getReport: () => {
        throw new Error('report unavailable');
      },
    }),
    false,
  );
});

test('ripgrep probes require a real ripgrep version response', () => {
  const calls = [];
  assert.equal(
    isUsableRipgrepCommand('rg', {
      spawnSyncImpl: (command, args, options) => {
        calls.push({ command, args, options });
        return { status: 0, stdout: 'ripgrep 15.1.0\n' };
      },
    }),
    true,
  );
  assert.equal(calls[0].command, 'rg');
  assert.deepEqual(calls[0].args, ['--version']);
  assert.equal(calls[0].options.timeout, 5000);

  assert.equal(
    isUsableRipgrepCommand('rg', {
      spawnSyncImpl: () => ({ status: 0, stdout: 'not-ripgrep\n' }),
    }),
    false,
  );
  assert.equal(
    isUsableRipgrepCommand('/missing/rg', {
      requireFile: true,
      fileExists: () => false,
      spawnSyncImpl: () => {
        throw new Error('must not spawn');
      },
    }),
    false,
  );
});

test('ripgrep version probes distinguish old, prerelease and unusable executables', () => {
  for (const [stdout, expected] of [
    ['ripgrep 14.1.1\n', '14.1.1'],
    ['ripgrep 15.2.0 (rev abc123)\nfeatures:+pcre2\n', '15.2.0'],
    ['ripgrep 15.3.0-rc.1\n', '15.3.0-rc.1'],
    ['ripgrep nonsense\n', null],
    ['ripgrep 15.2.0malformed\n', null],
  ]) {
    assert.equal(getRipgrepVersion('rg', {
      spawnSyncImpl: () => ({ status: 0, stdout }),
    }), expected);
  }
  assert.equal(getRipgrepVersion('rg', {
    spawnSyncImpl: () => ({ status: 1, stdout: 'ripgrep 15.2.0\n' }),
  }), null);
});
