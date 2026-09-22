import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isSafePublicUrl } from '../server/security/urlValidator.js';

describe('SSRF Protection - isSafePublicUrl', () => {
  it('allows valid public HTTPS URLs', async () => {
    assert.strictEqual(await isSafePublicUrl('https://google.com'), true);
    assert.strictEqual(await isSafePublicUrl('https://github.com/zenithVeil'), true);
    assert.strictEqual(await isSafePublicUrl('http://example.com/test'), true);
  });

  it('blocks localhost and loopback addresses', async () => {
    assert.strictEqual(await isSafePublicUrl('http://localhost:3000'), false);
    assert.strictEqual(await isSafePublicUrl('http://127.0.0.1:3000'), false);
    assert.strictEqual(await isSafePublicUrl('http://127.0.0.2'), false);
    assert.strictEqual(await isSafePublicUrl('http://[::1]'), false);
  });

  it('blocks private IPv4 ranges (RFC 1918)', async () => {
    assert.strictEqual(await isSafePublicUrl('http://10.0.0.1/admin'), false);
    assert.strictEqual(await isSafePublicUrl('http://172.16.0.5/status'), false);
    assert.strictEqual(await isSafePublicUrl('http://192.168.1.1/router'), false);
  });

  it('blocks cloud metadata IP (169.254.169.254)', async () => {
    assert.strictEqual(await isSafePublicUrl('http://169.254.169.254/latest/meta-data'), false);
    assert.strictEqual(await isSafePublicUrl('http://169.254.1.1'), false);
  });

  it('blocks unsupported or dangerous schemes (file, gopher, ftp)', async () => {
    assert.strictEqual(await isSafePublicUrl('file:///etc/passwd'), false);
    assert.strictEqual(await isSafePublicUrl('gopher://localhost'), false);
    assert.strictEqual(await isSafePublicUrl('javascript:alert(1)'), false);
  });

  it('blocks invalid or malformed URLs', async () => {
    assert.strictEqual(await isSafePublicUrl('not a url'), false);
    assert.strictEqual(await isSafePublicUrl(''), false);
    assert.strictEqual(await isSafePublicUrl('http://'), false);
  });
});
