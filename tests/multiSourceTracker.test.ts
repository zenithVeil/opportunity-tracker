import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  checkOpportunityMultiSource,
  extractTextFromHtml,
  computeHash,
  detectSourceDisagreements,
} from '../server/multiSourceTracker.js';
import { Opportunity, AppNotification } from '../src/types.js';

function createMockOpportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 'test-opp-1',
    name: 'Global AI Hackathon',
    organization: 'Open Tech Foundation',
    category: 'hackathon',
    deadline: '2026-11-15',
    eventDate: '2026-11-20',
    status: 'Interested',
    notes: 'Premier AI hackathon event',
    tasks: [],
    tags: ['ai'],
    websiteUrl: 'https://official.example.org/hackathon',
    additionalSources: [
      'https://devpost.example.com/ai-hackathon',
      'https://events.example.com/reg-portal',
    ],
    tracking: {
      lastChecked: null,
      status: 'active',
      failedAttemptsCount: 0,
      sources: {},
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('Multi-Source Tracking & Intelligence Tests', () => {
  describe('HTML text extraction and deterministic hashing', () => {
    it('extracts title, metaDescription, and clean text from raw HTML', () => {
      const sampleHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Test Hackathon 2026</title>
            <meta name="description" content="Registration deadline is November 15, 2026." />
            <style>body { color: red; }</style>
            <script>console.log("ignore me");</script>
          </head>
          <body>
            <h1>Welcome to the Hackathon</h1>
            <p>Submissions close at midnight UTC.</p>
          </body>
        </html>
      `;

      const result = extractTextFromHtml(sampleHtml);
      assert.strictEqual(result.title, 'Test Hackathon 2026');
      assert.strictEqual(result.metaDescription, 'Registration deadline is November 15, 2026.');
      assert.ok(result.text.includes('Welcome to the Hackathon'));
      assert.ok(result.text.includes('Submissions close at midnight UTC.'));
      assert.ok(!result.text.includes('console.log'));
      assert.ok(!result.text.includes('color: red'));
    });

    it('computes deterministic hashes for string content', () => {
      const hash1 = computeHash('Hackathon Content Version 1');
      const hash2 = computeHash('Hackathon Content Version 1');
      const hash3 = computeHash('Hackathon Content Version 2');

      assert.strictEqual(hash1, hash2);
      assert.notStrictEqual(hash1, hash3);
      assert.ok(hash1.startsWith('h_'));
    });
  });

  describe('Parallel fetching of multiple sources', () => {
    it('fetches all configured sources (websiteUrl + additionalSources) in parallel', async () => {
      const opp = createMockOpportunity({
        websiteUrl: 'https://official.example.org/event',
        additionalSources: [
          'https://devpost.example.com/event',
          'https://luma.example.com/event',
        ],
      });

      const fetchedUrls: string[] = [];
      const mockFetch = async (url: string) => {
        fetchedUrls.push(url);
        return {
          html: `<html><head><title>${url}</title></head><body>Source for ${url}</body></html>`,
          status: 200,
        };
      };

      const result = await checkOpportunityMultiSource(opp, null, {
        fetchFn: mockFetch,
        urlValidatorFn: async () => true,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(fetchedUrls.length, 3);
      assert.ok(fetchedUrls.includes('https://official.example.org/event'));
      assert.ok(fetchedUrls.includes('https://devpost.example.com/event'));
      assert.ok(fetchedUrls.includes('https://luma.example.com/event'));

      // All 3 sources should be tracked in opp.tracking.sources
      assert.ok(opp.tracking.sources['https://official.example.org/event']);
      assert.ok(opp.tracking.sources['https://devpost.example.com/event']);
      assert.ok(opp.tracking.sources['https://luma.example.com/event']);
      assert.strictEqual(opp.tracking.sources['https://official.example.org/event'].status, 'active');
    });
  });

  describe('Per-source hash comparison and change tracking', () => {
    it('detects change when a specific secondary source updates its content', async () => {
      const opp = createMockOpportunity({
        websiteUrl: 'https://official.example.org/event',
        additionalSources: ['https://devpost.example.com/event'],
      });

      // Initial check to baseline hashes
      await checkOpportunityMultiSource(opp, null, {
        fetchFn: async (url) => ({
          html: `<html><head><title>Initial</title></head><body>Original text for ${url}</body></html>`,
          status: 200,
        }),
        urlValidatorFn: async () => true,
      });

      const devpostHashBefore = opp.tracking.sources['https://devpost.example.com/event'].contentHash;
      assert.ok(devpostHashBefore);

      // Now simulate official site unchanged, but Devpost changes
      const checkResult = await checkOpportunityMultiSource(opp, null, {
        fetchFn: async (url) => {
          if (url.includes('devpost')) {
            return {
              html: '<html><head><title>Devpost Updated</title></head><body>NEW DEADLINE EXTENDED TO OCT 30</body></html>',
              status: 200,
            };
          }
          return {
            html: `<html><head><title>Initial</title></head><body>Original text for ${url}</body></html>`,
            status: 200,
          };
        },
        urlValidatorFn: async () => true,
      });

      assert.strictEqual(checkResult.isChanged, true);
      assert.strictEqual(opp.tracking.sources['https://devpost.example.com/event'].status, 'changed');
      assert.strictEqual(opp.tracking.sources['https://official.example.org/event'].status, 'active');

      // Verify changeLog attributed to Devpost
      const latestChange = opp.tracking.changeLog?.[0];
      assert.ok(latestChange);
      assert.strictEqual(latestChange.sourceUrl, 'https://devpost.example.com/event');
      assert.ok(latestChange.description.includes('changed'));
    });
  });

  describe('Cross-source conflict detection', () => {
    it('flags conflict when sources disagree on deadlines', () => {
      const disagreement = detectSourceDisagreements([
        {
          sourceUrl: 'https://official.example.org',
          sourceLabel: 'Official Website',
          deadline: '2026-10-25',
        },
        {
          sourceUrl: 'https://devpost.example.com',
          sourceLabel: 'Devpost',
          deadline: '2026-10-20',
        },
      ]);

      assert.ok(disagreement !== null);
      assert.ok(disagreement.includes('Conflicting deadlines detected across sources'));
      assert.ok(disagreement.includes('2026-10-25'));
      assert.ok(disagreement.includes('2026-10-20'));
    });

    it('returns null when sources agree on deadlines', () => {
      const disagreement = detectSourceDisagreements([
        {
          sourceUrl: 'https://official.example.org',
          sourceLabel: 'Official Website',
          deadline: '2026-10-25',
        },
        {
          sourceUrl: 'https://devpost.example.com',
          sourceLabel: 'Devpost',
          deadline: '2026-10-25',
        },
      ]);

      assert.strictEqual(disagreement, null);
    });

    it('records conflict warning and sends high-urgency notification when Gemini flags conflict', async () => {
      const opp = createMockOpportunity({
        websiteUrl: 'https://official.example.org',
        additionalSources: ['https://devpost.example.com'],
      });

      const notifications: AppNotification[] = [];
      const mockAi: any = {
        models: {
          generateContent: async () => ({
            text: JSON.stringify({
              detectedDeadline: '2026-10-25',
              detectedEventDate: '2026-11-01',
              detectedStatus: 'Active',
              announcements: ['Deadline extended on official portal'],
              summary: 'Sources report conflicting dates',
              conflictWarning: 'Devpost lists deadline as Oct 20, whereas Official Site lists Oct 25.',
              keyFactsSources: {
                deadline: 'https://official.example.org',
              },
            }),
          }),
        },
      };

      const res = await checkOpportunityMultiSource(opp, mockAi, {
        fetchFn: async (url) => ({
          html: `<html><head><title>Test</title></head><body>Content for ${url}</body></html>`,
          status: 200,
        }),
        urlValidatorFn: async () => true,
        onNotification: (n) => notifications.push(n),
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(
        opp.tracking.conflictWarning,
        'Devpost lists deadline as Oct 20, whereas Official Site lists Oct 25.'
      );

      // Confirmed notification fired
      const conflictNotif = notifications.find((n) => n.title.includes('Source Discrepancy Flagged'));
      assert.ok(conflictNotif);
      assert.strictEqual(conflictNotif.urgency, 'high');
      assert.ok(conflictNotif.message.includes('Devpost lists deadline as Oct 20'));
    });
  });

  describe('Graceful handling when partial sources fail', () => {
    it('continues successfully when secondary source fails with 502/timeout', async () => {
      const opp = createMockOpportunity({
        websiteUrl: 'https://official.example.org/event',
        additionalSources: ['https://broken-dead-link.com/event'],
      });

      const result = await checkOpportunityMultiSource(opp, null, {
        fetchFn: async (url) => {
          if (url.includes('broken-dead-link')) {
            return null; // network failure
          }
          return {
            html: '<html><head><title>Official Active</title></head><body>Event details live</body></html>',
            status: 200,
          };
        },
        urlValidatorFn: async () => true,
      });

      // Overall operation succeeds because official source was fetched
      assert.strictEqual(result.success, true);
      assert.strictEqual(opp.tracking.sources['https://official.example.org/event'].status, 'active');
      assert.strictEqual(opp.tracking.sources['https://broken-dead-link.com/event'].status, 'error');
      assert.ok(opp.tracking.errorMessage?.includes('unreachable'));
    });

    it('marks opportunity status as error only when ALL sources fail', async () => {
      const opp = createMockOpportunity({
        websiteUrl: 'https://broken-1.com',
        additionalSources: ['https://broken-2.com'],
      });

      const result = await checkOpportunityMultiSource(opp, null, {
        fetchFn: async () => null, // all fail
        urlValidatorFn: async () => true,
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(opp.tracking.status, 'error');
      assert.strictEqual(opp.tracking.sources['https://broken-1.com'].status, 'error');
      assert.strictEqual(opp.tracking.sources['https://broken-2.com'].status, 'error');
    });
  });

  describe('SSRF Protection across all sources', () => {
    it('validates every single source URL against SSRF policy and blocks private addresses', async () => {
      const opp = createMockOpportunity({
        websiteUrl: 'https://legitimate-public-site.com/hackathon',
        additionalSources: [
          'http://169.254.169.254/latest/meta-data', // AWS/GCP metadata
          'http://localhost:8080/internal-admin',      // Loopback
          'http://10.0.0.1/private-network',          // RFC 1918 private
        ],
      });

      const attemptedFetches: string[] = [];
      const result = await checkOpportunityMultiSource(opp, null, {
        fetchFn: async (url) => {
          attemptedFetches.push(url);
          return {
            html: '<html><head><title>Legitimate</title></head><body>Safe text</body></html>',
            status: 200,
          };
        },
        urlValidatorFn: async (url) => {
          // Real SSRF rules: allow legitimate-public-site, block private/cloud IPs
          if (url.includes('169.254') || url.includes('localhost') || url.includes('10.0.0.1')) {
            return false;
          }
          return true;
        },
      });

      // Public site succeeded
      assert.strictEqual(result.success, true);
      assert.strictEqual(attemptedFetches.length, 1);
      assert.strictEqual(attemptedFetches[0], 'https://legitimate-public-site.com/hackathon');

      // SSRF blocked sources are marked as blocked without network fetch
      const metadataTracking = opp.tracking.sources['http://169.254.169.254/latest/meta-data'];
      assert.ok(metadataTracking);
      assert.strictEqual(metadataTracking.status, 'error');
      assert.strictEqual(metadataTracking.statusCode, 403);
      assert.ok(metadataTracking.errorMessage?.includes('Blocked by SSRF'));

      const localhostTracking = opp.tracking.sources['http://localhost:8080/internal-admin'];
      assert.ok(localhostTracking);
      assert.strictEqual(localhostTracking.status, 'error');
      assert.strictEqual(localhostTracking.statusCode, 403);
      assert.ok(localhostTracking.errorMessage?.includes('Blocked by SSRF'));

      const privateTracking = opp.tracking.sources['http://10.0.0.1/private-network'];
      assert.ok(privateTracking);
      assert.strictEqual(privateTracking.status, 'error');
      assert.strictEqual(privateTracking.statusCode, 403);
      assert.ok(privateTracking.errorMessage?.includes('Blocked by SSRF'));
    });
  });
});
