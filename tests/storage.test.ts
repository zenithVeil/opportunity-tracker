import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { JsonFileStorage } from '../server/storage.js';

describe('Storage Layer Safety and Non-Destructive Persistence', () => {
  const testDir = path.join(process.cwd(), 'data', 'test_tmp_' + Date.now());
  const testFile = path.join(testDir, 'test_opps.json');

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  it('saves and loads data atomically', () => {
    const storage = new JsonFileStorage<any[]>(testFile, []);
    const data = [{ id: '1', name: 'Opportunity One' }];
    storage.save(data);

    const loaded = storage.load();
    assert.deepStrictEqual(loaded, data);
  });

  it('preserves corrupt file instead of silently overwriting with sample data', () => {
    // Write invalid JSON to file to simulate corruption / crash mid-write
    fs.writeFileSync(testFile, '{"incomplete_json": [1, 2, ', 'utf-8');

    const storage = new JsonFileStorage<any[]>(testFile, [{ id: 'sample-1' }]);
    
    // When loading corrupt data:
    // It must NOT overwrite testFile with [{ id: 'sample-1' }]!
    // It should backup the corrupt file and return safe fallback or throw.
    const loaded = storage.load();

    // Verify a .corrupt backup was created so user data is never destroyed
    const files = fs.readdirSync(testDir);
    const hasCorruptBackup = files.some(f => f.includes('.corrupt'));
    assert.ok(hasCorruptBackup, 'A .corrupt backup file must be created to preserve data');
  });
});
