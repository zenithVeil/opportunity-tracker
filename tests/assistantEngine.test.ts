import { describe, it } from 'node:test';
import assert from 'node:assert';
import { computeDailyPriorities, isAffirmation } from '../server/assistantEngine.js';
import { Opportunity } from '../src/types.js';

describe('assistantEngine characterization', () => {
  const dummyOpps: Opportunity[] = [
    {
      id: 'opp-1',
      name: 'Hackathon Alpha',
      websiteUrl: 'https://alpha.hack',
      category: 'hackathon',
      organization: 'Alpha Org',
      deadline: '2026-09-13', // 1 day after hardcoded 2026-09-12
      status: 'Interested',
      notes: '',
      tasks: [{ id: 't1', name: 'Form team', completed: false, priority: 'high' }],
      tags: [],
      tracking: { lastChecked: null, status: 'not_checked', failedAttemptsCount: 0 },
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    },
    {
      id: 'opp-2',
      name: 'Conference Beta',
      websiteUrl: 'https://beta.conf',
      category: 'conference',
      organization: 'Beta Org',
      deadline: '2026-09-25', // 13 days after 2026-09-12
      status: 'Registered',
      notes: '',
      tasks: [{ id: 't2', name: 'Book flight', completed: false, priority: 'medium' }],
      tags: [],
      tracking: { lastChecked: null, status: 'not_checked', failedAttemptsCount: 0 },
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    },
  ];

  it('computes daily priorities using explicit or current reference date and safely handles missing deadlines', () => {
    const oppWithNoDeadline: Opportunity = {
      id: 'opp-3',
      name: 'No Deadline Event',
      websiteUrl: 'https://example.com',
      category: 'hackathon',
      organization: 'Example Org',
      deadline: '',
      status: 'Interested',
      notes: '',
      tasks: [],
      tags: [],
      tracking: { lastChecked: null, status: 'not_checked', failedAttemptsCount: 0 },
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    };

    const refDate = new Date('2026-09-12T00:00:00Z');
    const priorities = computeDailyPriorities([...dummyOpps, oppWithNoDeadline], refDate);
    assert.ok(Array.isArray(priorities));
    assert.strictEqual(priorities.length, 3);

    // opp-1 has deadline 2026-09-13 (1 day after 2026-09-12)
    assert.strictEqual(priorities[0].opportunityId, 'opp-1');
    assert.strictEqual(priorities[0].daysRemaining, 1);

    // opp-3 (no deadline) must NOT be scored as due today (+120)
    const noDeadlineItem = priorities.find(p => p.opportunityId === 'opp-3');
    assert.ok(noDeadlineItem);
    assert.strictEqual(noDeadlineItem.deadlineText, 'No deadline');
    assert.strictEqual(noDeadlineItem.urgencyScore, 10);
    assert.strictEqual(noDeadlineItem.reason, 'No deadline scheduled');
  });

  it('rejects ambiguous or hesitant inputs from being classified as affirmations', () => {
    assert.strictEqual(isAffirmation('yes, but wait'), false);
    assert.strictEqual(isAffirmation('sure, but don\'t save yet'), false);
    assert.strictEqual(isAffirmation('ok, cancel that'), false);
    assert.strictEqual(isAffirmation('yes, but what was the deadline?'), false);
    assert.strictEqual(isAffirmation('ok, tell me more first'), false);
    assert.strictEqual(isAffirmation('sure?'), false);
  });

  it('accepts unambiguous positive affirmations', () => {
    assert.strictEqual(isAffirmation('yes'), true);
    assert.strictEqual(isAffirmation('ok'), true);
    assert.strictEqual(isAffirmation('sure'), true);
    assert.strictEqual(isAffirmation('confirm'), true);
    assert.strictEqual(isAffirmation('yes please'), true);
    assert.strictEqual(isAffirmation('sure go ahead'), true);
  });
});
