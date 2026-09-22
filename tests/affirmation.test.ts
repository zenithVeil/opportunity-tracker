import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isAffirmation, isRejection } from '../server/assistantEngine.js';

describe('Unambiguous Natural Affirmation Verification', () => {
  it('accepts clear, unambiguous positive affirmations', () => {
    assert.strictEqual(isAffirmation('yes'), true);
    assert.strictEqual(isAffirmation('ok'), true);
    assert.strictEqual(isAffirmation('sure'), true);
    assert.strictEqual(isAffirmation('confirm'), true);
    assert.strictEqual(isAffirmation('add it'), true);
    assert.strictEqual(isAffirmation('save it'), true);
    assert.strictEqual(isAffirmation('please do'), true);
    assert.strictEqual(isAffirmation('yes please'), true);
  });

  it('rejects ambiguous or hesitant inputs containing contrastive conjunctions or conditions', () => {
    assert.strictEqual(isAffirmation('yes, but wait'), false);
    assert.strictEqual(isAffirmation('sure, but don\'t save yet'), false);
    assert.strictEqual(isAffirmation('ok, cancel that'), false);
    assert.strictEqual(isAffirmation('yes, but what was the deadline?'), false);
    assert.strictEqual(isAffirmation('ok, tell me more first'), false);
    assert.strictEqual(isAffirmation('sure?'), false);
    assert.strictEqual(isAffirmation('yes?'), false);
  });

  it('correctly identifies explicit rejections', () => {
    assert.strictEqual(isRejection('no'), true);
    assert.strictEqual(isRejection('cancel'), true);
    assert.strictEqual(isRejection('nevermind'), true);
    assert.strictEqual(isRejection('don\'t save'), true);
    assert.strictEqual(isRejection('discard'), true);
  });
});
