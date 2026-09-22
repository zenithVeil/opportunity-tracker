import { describe, it } from 'node:test';
import assert from 'node:assert';
import { classifySourceType } from '../server/researchPipeline.js';

describe('Evidence-Based Source Classification', () => {
  it('correctly identifies dedicated official event website', () => {
    const res = classifySourceType('https://hackmit.org', 'HackMIT');
    assert.strictEqual(res.sourceType, 'official_event_website');
    assert.strictEqual(res.isOfficial, true);
  });

  it('correctly identifies official subdomain of legitimate organization', () => {
    const res = classifySourceType('https://capturetheflag.withgoogle.com', 'Google CTF');
    assert.strictEqual(res.sourceType, 'official_event_website');
    assert.strictEqual(res.isOfficial, true);
  });

  it('classifies aggregators and secondary platforms as trusted secondary sources', () => {
    const devpost = classifySourceType('https://devpost.com/hackathons/hackmit-2026', 'HackMIT');
    assert.strictEqual(devpost.sourceType, 'trusted_secondary_source');
    assert.strictEqual(devpost.isOfficial, false);

    const mlh = classifySourceType('https://mlh.io/seasons/2026/events', 'HackMIT');
    assert.strictEqual(mlh.sourceType, 'trusted_secondary_source');
    assert.strictEqual(mlh.isOfficial, false);

    const ctfTime = classifySourceType('https://ctftime.org/event/1234', 'Google CTF');
    assert.strictEqual(ctfTime.sourceType, 'trusted_secondary_source');
    assert.strictEqual(ctfTime.isOfficial, false);

    const wiki = classifySourceType('https://en.wikipedia.org/wiki/Def_Con', 'DEF CON');
    assert.strictEqual(wiki.sourceType, 'trusted_secondary_source');
    assert.strictEqual(wiki.isOfficial, false);
  });

  it('rejects deceptive subdomains and attacker lookalikes from being marked official', () => {
    // An attacker domain that embeds the query in its subdomain
    const deceptive = classifySourceType('https://hackmit.org.attacker.com/fake', 'HackMIT');
    assert.notStrictEqual(deceptive.sourceType, 'official_event_website');
    assert.strictEqual(deceptive.isOfficial, false);
  });

  it('does NOT default random third-party blogs or discussion forums to official event website', () => {
    const blog = classifySourceType('https://randomdeveloperblog.com/how-i-won-hackmit', 'HackMIT');
    assert.notStrictEqual(blog.sourceType, 'official_event_website');
    assert.strictEqual(blog.isOfficial, false);

    const reddit = classifySourceType('https://reddit.com/r/hackathons/comments/123', 'HackMIT');
    assert.strictEqual(reddit.isOfficial, false);
  });
});
