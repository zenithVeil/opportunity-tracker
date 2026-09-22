import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  parseDate,
  getDaysRemaining,
  getUrgencyLevel,
  formatCountdown,
  formatDate,
} from '../src/utils/dateUtils.js';

describe('Verified Fixed Date Utilities', () => {
  const refDate = new Date(2026, 8, 12); // Sep 12, 2026

  it('correctly handles missing, empty, or whitespace deadlines', () => {
    assert.strictEqual(getDaysRemaining(''), null);
    assert.strictEqual(getDaysRemaining('   '), null);
    assert.strictEqual(getDaysRemaining(null), null);
    assert.strictEqual(getDaysRemaining(undefined), null);

    assert.strictEqual(formatCountdown(''), 'No deadline set');
    assert.strictEqual(formatCountdown(null), 'No deadline set');

    assert.strictEqual(getUrgencyLevel(''), 'none');
    assert.strictEqual(getUrgencyLevel(null), 'none');

    assert.strictEqual(formatDate(''), 'No date set');
    assert.strictEqual(formatDate(null), 'No date set');
  });

  it('correctly calculates countdown for actual deadlines relative to reference date', () => {
    // Exactly today
    assert.strictEqual(getDaysRemaining('2026-09-12', refDate), 0);
    assert.strictEqual(formatCountdown('2026-09-12', refDate), 'Deadline is TODAY!');
    assert.strictEqual(getUrgencyLevel('2026-09-12', refDate), 'urgent');

    // Tomorrow
    assert.strictEqual(getDaysRemaining('2026-09-13', refDate), 1);
    assert.strictEqual(formatCountdown('2026-09-13', refDate), 'Tomorrow (1 day left)');
    assert.strictEqual(getUrgencyLevel('2026-09-13', refDate), 'urgent');

    // In 5 days
    assert.strictEqual(getDaysRemaining('2026-09-17', refDate), 5);
    assert.strictEqual(formatCountdown('2026-09-17', refDate), '5 days left');
    assert.strictEqual(getUrgencyLevel('2026-09-17', refDate), 'approaching');

    // In 20 days
    assert.strictEqual(getDaysRemaining('2026-10-02', refDate), 20);
    assert.strictEqual(formatCountdown('2026-10-02', refDate), '20 days left');
    assert.strictEqual(getUrgencyLevel('2026-10-02', refDate), 'comfortable');

    // Yesterday
    assert.strictEqual(getDaysRemaining('2026-09-11', refDate), -1);
    assert.strictEqual(formatCountdown('2026-09-11', refDate), 'Passed yesterday');
    assert.strictEqual(getUrgencyLevel('2026-09-11', refDate), 'passed');
  });

  it('parses YYYY-MM-DD date-only strings without timezone day-shifting', () => {
    const parsed = parseDate('2026-09-14');
    assert.ok(parsed);
    assert.strictEqual(parsed.getFullYear(), 2026);
    assert.strictEqual(parsed.getMonth(), 8); // 0-indexed September
    assert.strictEqual(parsed.getDate(), 14);
  });
});
