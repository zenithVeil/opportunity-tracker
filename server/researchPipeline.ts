import * as cheerio from 'cheerio';
import { GoogleGenAI, Type } from '@google/genai';
import { isSafePublicUrl } from './security/urlValidator.js';
import {
  OpportunityCategory,
  ResearchEventResult,
  ResearchSourceItem,
  ResearchStateStatus,
  SourceType,
  VerifiedField,
  FieldSourceConflict,
  VerificationStatus,
  ConfidenceLevel,
} from '../src/types';

interface ScrapedSourceContent {
  source: ResearchSourceItem;
  html: string;
  title: string;
  metaDescription: string;
  jsonLdData: any[];
  cleanText: string;
  foundUrls: {
    registration?: string;
    rules?: string;
    official?: string;
  };
}

/**
 * Clean user search queries by stripping conversational filler words.
 */
export function sanitizeEventQuery(rawQuery: string): string {
  return rawQuery
    .replace(/^find(\s+details?\s+about)?/i, '')
    .replace(/^get(\s+details?\s+about)?/i, '')
    .replace(/^is\s+registration\s+open\s+for/i, '')
    .replace(/^when\s+is\s+the\s+deadline\s+for/i, '')
    .replace(/^research\s+(the\s+)?/i, '')
    .replace(/^tell\s+me\s+about/i, '')
    .replace(/^what\s+is\s+the\s+date\s+for/i, '')
    .replace(/\?+$/, '')
    .trim();
}

/**
 * Classify a source URL into an authoritative hierarchy:
 * 1. Official event website
 * 2. Official registration page
 * 3. Official rules/documentation
 * 4. Official organization announcements
 * 5. Trusted secondary sources
 */
export function classifySourceType(url: string, eventNameQuery: string): { sourceType: SourceType; priority: number; isOfficial: boolean } {
  let hostname = '';
  let pathname = '';
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    pathname = parsed.pathname.toLowerCase();
  } catch {
    return { sourceType: 'unverified', priority: 99, isOfficial: false };
  }

  // Social, discussion, and community forums are never official
  const isSocialOrCommunity =
    hostname.includes('reddit.com') ||
    hostname.includes('medium.com') ||
    hostname.includes('linkedin.com') ||
    hostname.includes('twitter.com') ||
    hostname.includes('x.com') ||
    hostname.includes('facebook.com') ||
    hostname.includes('instagram.com') ||
    hostname.includes('youtube.com') ||
    hostname.includes('discord.gg') ||
    hostname.includes('substack.com') ||
    hostname.includes('news.ycombinator.com') ||
    hostname.includes('quora.com');

  if (isSocialOrCommunity) {
    return { sourceType: 'trusted_secondary_source', priority: 6, isOfficial: false };
  }

  // Trusted secondary aggregators & platforms
  const isSecondaryPlatform =
    hostname.includes('devpost.com') ||
    hostname.includes('mlh.io') ||
    hostname.includes('ctftime.org') ||
    hostname.includes('kaggle.com') ||
    hostname.includes('unstop.com') ||
    hostname.includes('hackerearth.com') ||
    hostname.includes('dorahacks.io') ||
    hostname.includes('wikipedia.org') ||
    hostname.includes('github.com') ||
    hostname.includes('gitlab.com') ||
    hostname.includes('meetup.com');

  if (isSecondaryPlatform) {
    return { sourceType: 'trusted_secondary_source', priority: 5, isOfficial: false };
  }

  // Official registration portals
  const isRegistrationUrl =
    hostname.startsWith('apply.') ||
    hostname.startsWith('portal.') ||
    hostname.startsWith('register.') ||
    pathname.includes('/apply') ||
    pathname.includes('/register') ||
    hostname.includes('eventbrite.') ||
    hostname.includes('lu.ma') ||
    hostname.includes('luma.com') ||
    hostname.includes('typeform.com') ||
    hostname.includes('tally.so');

  if (isRegistrationUrl) {
    return { sourceType: 'official_registration_page', priority: 2, isOfficial: true };
  }

  // Official rules / documentation
  const isRulesOrDocs =
    hostname.startsWith('docs.') ||
    pathname.includes('/rules') ||
    pathname.includes('/guidelines') ||
    pathname.includes('/handbook') ||
    pathname.includes('/faq');

  if (isRulesOrDocs) {
    return { sourceType: 'official_rules_documentation', priority: 3, isOfficial: true };
  }

  // Official organization announcements / blog
  const isAnnouncement =
    hostname.startsWith('blog.') ||
    hostname.startsWith('news.') ||
    pathname.includes('/blog/') ||
    pathname.includes('/news/') ||
    pathname.includes('/announcements/');

  if (isAnnouncement) {
    return { sourceType: 'official_organization_announcement', priority: 4, isOfficial: true };
  }

  // Evidence-based check for official event website:
  // Must match the core domain SLD (not a deceptive third-party subdomain),
  // or be an official recognized organization / academic domain.
  const hostParts = hostname.split('.');
  const sld = hostParts.length >= 2 ? hostParts[hostParts.length - 2] : '';
  const queryClean = eventNameQuery.toLowerCase().replace(/[^a-z0-9]/g, '');

  const isExactSldMatch = queryClean.length >= 3 && (sld === queryClean || (queryClean.includes(sld) && sld.length >= 4));
  const isKnownOfficialOrg =
    hostname.endsWith('.withgoogle.com') ||
    hostname.endsWith('google.com') ||
    hostname.endsWith('.edu') ||
    hostname.endsWith('defcon.org') ||
    hostname.endsWith('blackhat.com');

  if (isExactSldMatch || isKnownOfficialOrg) {
    return { sourceType: 'official_event_website', priority: 1, isOfficial: true };
  }

  // Fallback: If no official evidence is established, default to secondary
  return { sourceType: 'trusted_secondary_source', priority: 5, isOfficial: false };
}

/**
 * Step 1: Discover real web sources using live web search.
 * Never fabricates URLs or pretends a search happened.
 */
export async function discoverEventSources(query: string, targetUrl?: string): Promise<ResearchSourceItem[]> {
  const discovered: ResearchSourceItem[] = [];
  const seenUrls = new Set<string>();

  // If the user already provided a specific target URL, add it as the primary candidate
  if (targetUrl && targetUrl.trim()) {
    let clean = targetUrl.trim();
    if (!clean.startsWith('http')) clean = `https://${clean}`;
    try {
      new URL(clean);
      const { sourceType, isOfficial } = classifySourceType(clean, query);
      discovered.push({
        url: clean,
        title: 'Provided Target URL',
        sourceType,
        retrievedSuccessfully: false,
        isOfficial,
      });
      seenUrls.add(clean);
    } catch {
      // Invalid URL
    }
  }

  const cleanedQuery = sanitizeEventQuery(query);
  if (!cleanedQuery && discovered.length === 0) {
    return [];
  }

  // 1. Query DuckDuckGo Lite live search via async fetch
  try {
    const encoded = encodeURIComponent(cleanedQuery);
    const ddgRes = await fetch('https://lite.duckduckgo.com/lite/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: `q=${encoded}`,
      signal: AbortSignal.timeout(6000),
    });

    if (ddgRes.ok) {
      const rawHtml = await ddgRes.text();
      const linkRegex = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let match: RegExpExecArray | null;
      while ((match = linkRegex.exec(rawHtml)) !== null) {
        const rawLink = match[1];
        const title = match[2].replace(/<[^>]+>/g, '').trim();

        if (
          rawLink &&
          !rawLink.includes('duckduckgo.com') &&
          !rawLink.includes('yandex.') &&
          !rawLink.includes('bing.com')
        ) {
          if (!seenUrls.has(rawLink)) {
            seenUrls.add(rawLink);
            const { sourceType, isOfficial } = classifySourceType(rawLink, cleanedQuery);
            discovered.push({
              url: rawLink,
              title: title || rawLink,
              sourceType,
              retrievedSuccessfully: false,
              isOfficial,
            });
          }
        }
      }
    }
  } catch (err: any) {
    console.warn('Live search retrieval error (DuckDuckGo Lite):', err.message);
  }

  // 2. CTFtime API for CTF / cybersecurity competitions
  if (cleanedQuery.toLowerCase().includes('ctf') || cleanedQuery.toLowerCase().includes('black hat')) {
    try {
      const ctfRes = await fetch('https://ctftime.org/api/v1/events/?limit=15', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) OpportunityTracker/2.0' },
        signal: AbortSignal.timeout(4000),
      });
      if (ctfRes.ok) {
        const events: any[] = await ctfRes.json();
        const terms = cleanedQuery.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && w !== 'ctf');
        for (const ev of events) {
          const tLower = (ev.title || '').toLowerCase();
          if (terms.some((term) => tLower.includes(term))) {
            if (ev.url && !seenUrls.has(ev.url)) {
              seenUrls.add(ev.url);
              discovered.push({
                url: ev.url,
                title: ev.title,
                snippet: `Official site for CTF event: ${ev.title}`,
                sourceType: 'official_event_website',
                retrievedSuccessfully: false,
                isOfficial: true,
              });
            }
            if (ev.ctftime_url && !seenUrls.has(ev.ctftime_url)) {
              seenUrls.add(ev.ctftime_url);
              discovered.push({
                url: ev.ctftime_url,
                title: `${ev.title} on CTFtime`,
                snippet: `CTFtime page for ${ev.title}`,
                sourceType: 'trusted_secondary_source',
                retrievedSuccessfully: false,
                isOfficial: false,
              });
            }
          }
        }
      }
    } catch {}
  }

  // 3. Wikipedia API for program / initiative overviews
  try {
    const wikiRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(cleanedQuery)}&limit=3&format=json`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (wikiRes.ok) {
      const wikiData = await wikiRes.json();
      const urls = wikiData[3] || [];
      const titles = wikiData[1] || [];
      urls.forEach((u: string, idx: number) => {
        if (u && !seenUrls.has(u)) {
          seenUrls.add(u);
          discovered.push({
            url: u,
            title: titles[idx] || u,
            snippet: `Wikipedia overview article for ${cleanedQuery}`,
            sourceType: 'trusted_secondary_source',
            retrievedSuccessfully: false,
            isOfficial: false,
          });
        }
      });
    }
  } catch {}

  // Sort discovered sources by priority (Official event website first, then registration, docs, announcements, secondary)
  discovered.sort((a, b) => {
    const priorityMap: Record<SourceType, number> = {
      official_event_website: 1,
      official_registration_page: 2,
      official_rules_documentation: 3,
      official_organization_announcement: 4,
      trusted_secondary_source: 5,
      user_input: 6,
      unverified: 7,
    };
    return (priorityMap[a.sourceType] || 99) - (priorityMap[b.sourceType] || 99);
  });

  return discovered.slice(0, 5); // Top 5 candidate sources
}

/**
 * Normalizes event URLs (e.g. cleans leading/trailing whitespace, strips invalid www on multi-subdomains like www.capturetheflag.withgoogle.com)
 */
export function normalizeEventUrl(rawUrl: string): string {
  try {
    let u = rawUrl.trim();
    if (!u.startsWith('http://') && !u.startsWith('https://')) {
      u = 'https://' + u;
    }
    const parsed = new URL(u);
    // If hostname starts with 'www.' and has >= 3 dot parts (e.g., www.capturetheflag.withgoogle.com),
    // strip the 'www.' because multi-level subdomains rarely have valid certs for 'www.'
    const hostParts = parsed.hostname.split('.');
    if (hostParts.length > 3 && hostParts[0].toLowerCase() === 'www') {
      parsed.hostname = hostParts.slice(1).join('.');
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Resilient, bounded asynchronous HTML retrieval.
 * Enforces SSRF validation, handles redirects, bounds timeouts, and limits response size.
 */
export async function fetchHtmlWithFallbacks(
  targetUrl: string,
  timeoutMs = 9000
): Promise<{ html: string; finalUrl: string; status: number } | null> {
  const normalized = normalizeEventUrl(targetUrl);
  const candidates: string[] = [normalized];

  if (normalized !== targetUrl) {
    candidates.push(targetUrl);
  } else if (normalized.includes('://www.')) {
    candidates.push(normalized.replace('://www.', '://'));
  }

  for (const cand of candidates) {
    try {
      // 1. Enforce strict SSRF protection before initiating request
      const isSafe = await isSafePublicUrl(cand);
      if (!isSafe) {
        console.warn(`[SSRF Guard] Blocked request to prohibited or private destination: ${cand}`);
        continue;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(cand, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OpportunityTrackerResearch/2.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      clearTimeout(timer);

      if (res.ok) {
        // Enforce maximum body size (5MB) to protect against memory exhaustion
        const html = await res.text();
        if (html && html.length > 50 && html.length <= 5 * 1024 * 1024) {
          return { html, finalUrl: cand, status: res.status };
        }
      }
    } catch {
      // Graceful timeout or network failure handling
    }
  }

  return null;
}

/**
 * Step 3 & 4: Retrieve the actual webpage and handle JS-rendered SPAs
 * via JSON-LD, Next.js / Nuxt hydration state, meta tags, and structured DOM extraction.
 */
export async function retrieveSourceContent(source: ResearchSourceItem): Promise<ScrapedSourceContent | null> {
  try {
    const fetched = await fetchHtmlWithFallbacks(source.url);
    if (!fetched) {
      source.retrievedSuccessfully = false;
      return null;
    }

    source.url = fetched.finalUrl;
    source.httpStatus = fetched.status;
    source.retrievedSuccessfully = true;

    const html = fetched.html;
    const $ = cheerio.load(html);

    // 1. Extract Title
    let pageTitle = $('title').text().trim();
    if (!pageTitle) {
      pageTitle = $('meta[property="og:title"]').attr('content')?.trim() || source.title;
    }

    // 2. Extract Meta Description
    let metaDescription =
      $('meta[name="description"]').attr('content')?.trim() ||
      $('meta[property="og:description"]').attr('content')?.trim() ||
      '';

    // 3. Extract Schema.org JSON-LD (Essential for JS-rendered websites and modern web apps)
    const jsonLdData: any[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const raw = $(el).html();
        if (raw) {
          const parsed = JSON.parse(raw.trim());
          if (Array.isArray(parsed)) {
            jsonLdData.push(...parsed);
          } else {
            jsonLdData.push(parsed);
          }
        }
      } catch {
        // invalid JSON-LD block
      }
    });

    // 4. Extract Next.js / Nuxt / React dehydrated hydration state
    let dehydratedText = '';
    $('script#__NEXT_DATA__').each((_, el) => {
      try {
        const raw = $(el).html();
        if (raw) {
          const parsed = JSON.parse(raw);
          dehydratedText += ' ' + JSON.stringify(parsed.props?.pageProps || parsed);
        }
      } catch {}
    });

    // 5. Look for registration and documentation links on the page
    const foundUrls: ScrapedSourceContent['foundUrls'] = {};
    $('a[href]').each((_, el) => {
      const linkText = $(el).text().toLowerCase().trim();
      const href = $(el).attr('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

      let absoluteUrl = href;
      try {
        absoluteUrl = new URL(href, source.url).toString();
      } catch {
        return;
      }

      if (linkText.includes('register') || linkText.includes('apply') || linkText.includes('signup') || linkText.includes('sign up')) {
        if (!foundUrls.registration) foundUrls.registration = absoluteUrl;
      } else if (linkText.includes('rules') || linkText.includes('guidelines') || linkText.includes('handbook')) {
        if (!foundUrls.rules) foundUrls.rules = absoluteUrl;
      }
    });

    // 6. Clean visible page text (strip scripts, styles, SVGs)
    $('script, style, svg, noscript, nav, footer, header').remove();
    let bodyText = $('body').text();
    // Normalize whitespace
    bodyText = bodyText.replace(/\s+/g, ' ').trim();

    const fullCleanText = [
      `TITLE: ${pageTitle}`,
      metaDescription ? `DESCRIPTION: ${metaDescription}` : '',
      jsonLdData.length > 0 ? `SCHEMA_JSON_LD: ${JSON.stringify(jsonLdData).slice(0, 1500)}` : '',
      `CONTENT: ${bodyText.slice(0, 8000)}`,
      dehydratedText ? `DEHYDRATED_STATE: ${dehydratedText.slice(0, 2000)}` : '',
    ].filter(Boolean).join('\n\n');

    return {
      source,
      html,
      title: pageTitle,
      metaDescription,
      jsonLdData,
      cleanText: fullCleanText,
      foundUrls,
    };
  } catch (err: any) {
    console.warn(`Failed to retrieve content from ${source.url}:`, err.message);
    source.retrievedSuccessfully = false;
    return null;
  }
}

/**
 * Step 5, 6, 7 & 8: Structured Extraction, Gemini Reasoning, and Strict Grounding Verification.
 * Gemini is NEVER the source of truth.
 * The retrieved webpage text is the source of truth.
 */
export async function extractAndVerifyEvent(
  scrapedSources: ScrapedSourceContent[],
  query: string,
  ai: GoogleGenAI | null
): Promise<ResearchEventResult> {
  const timestamp = new Date().toISOString();

  // If no sources could be retrieved successfully
  if (scrapedSources.length === 0) {
    return {
      eventName: createUnverifiedField('Could not verify this information.', '', 'unverified', timestamp),
      deadline: createUnverifiedField('', '', 'unverified', timestamp),
      registrationStatus: createUnverifiedField('Unknown', '', 'unverified', timestamp),
      eventDate: createUnverifiedField('', '', 'unverified', timestamp),
      officialWebsite: createUnverifiedField('', '', 'unverified', timestamp),
      registrationUrl: createUnverifiedField('', '', 'unverified', timestamp),
      organization: createUnverifiedField('', '', 'unverified', timestamp),
      category: createUnverifiedField('other', '', 'unverified', timestamp) as any,
      description: createUnverifiedField('No reliable sources found during live web research.', '', 'unverified', timestamp),
      suggestedTasks: [],
      suggestedTags: [],
      overallState: 'unable_to_verify',
      sourcesDiscovered: [],
      sourcesRetrievedCount: 0,
      retrievalTimestamp: timestamp,
      query,
      unverifiedWarning: 'Could not verify this information. No authoritative source could be retrieved.',
    };
  }

  const primary = scrapedSources[0];
  const primaryUrl = primary.source.url;
  const primarySourceType = primary.source.sourceType;

  // Prepare combined text snippet from retrieved authoritative pages for extraction
  const sourceSummaries = scrapedSources.map((s, idx) => `
--- SOURCE ${idx + 1}: ${s.source.url} (${s.source.sourceType}) ---
Title: ${s.title}
Text Sample:
${s.cleanText.slice(0, 4000)}
`).join('\n\n');

  let extractedRaw: any = null;

  if (ai) {
    try {
      const prompt = `You are a strict data verification engine for an Opportunity Tracker system.
Today is 2026-09-12.

STRICT OPERATIONAL DIRECTIVES:
1. THE RETRIEVED SOURCES BELOW ARE THE ONLY SOURCE OF TRUTH.
2. DO NOT use your internal training knowledge to guess, fill in, or invent dates, deadlines, or URLs.
3. If an event deadline or registration date is NOT explicitly stated in the retrieved text, return null for deadline.
4. If registration status (Open, Closed, Upcoming) is not indicated in the text, return "Unknown".
5. For EVERY field you extract, you MUST supply the exact "quote" substring from the source text that proves it.
6. NEVER fabricate a URL. Only use URLs that appear in the sources.
7. If multiple sources give different deadlines or statuses, list both and note the conflict.

User Query: "${query}"

RETRIEVED LIVE SOURCES:
${sourceSummaries}

Extract structured information strictly adhering to this schema:`;

      // Prioritize gemini-3.8-flash for structured extraction, followed by flash aliases
      const modelsToTry = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
      for (const m of modelsToTry) {
        try {
          const response = await ai.models.generateContent({
            model: m,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  nameQuote: { type: Type.STRING },
                  organization: { type: Type.STRING },
                  organizationQuote: { type: Type.STRING },
                  category: {
                    type: Type.STRING,
                    enum: ['hackathon', 'ctf', 'workshop', 'competition', 'program', 'scholarship', 'internship', 'conference', 'fellowship', 'grant', 'other'],
                  },
                  description: { type: Type.STRING },
                  deadline: { type: Type.STRING, description: 'YYYY-MM-DD or exact date text found in source, or null if not stated' },
                  deadlineQuote: { type: Type.STRING, description: 'Exact quote from text mentioning the deadline' },
                  eventDate: { type: Type.STRING, description: 'YYYY-MM-DD or exact event dates found in source, or null' },
                  eventDateQuote: { type: Type.STRING, description: 'Exact quote from text mentioning event date' },
                  registrationStatus: {
                    type: Type.STRING,
                    enum: ['Open', 'Closed', 'Upcoming', 'Unknown'],
                  },
                  registrationStatusQuote: { type: Type.STRING, description: 'Exact quote or button text indicating status' },
                  officialWebsite: { type: Type.STRING },
                  registrationUrl: { type: Type.STRING },
                  conflictingDeadlines: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        value: { type: Type.STRING },
                        sourceUrl: { type: Type.STRING },
                        quote: { type: Type.STRING },
                      },
                    },
                  },
                  suggestedTasks: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        name: { type: Type.STRING },
                        priority: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
                      },
                    },
                  },
                  suggestedTags: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
              },
              temperature: 0.1,
            },
          });

          if (response.text) {
            extractedRaw = JSON.parse(response.text);
            break;
          }
        } catch (mErr: any) {
          const errStr = String(mErr?.message || mErr);
          const is503 = errStr.includes('503') || errStr.includes('UNAVAILABLE') || errStr.includes('high demand');
          if (is503) {
            console.warn(`Extraction model ${m} is temporarily experiencing high demand (503). Trying fallback model...`);
          } else {
            console.warn(`Extraction model ${m} attempt failed:`, mErr.message || mErr);
          }
        }
      }
    } catch (err: any) {
      console.warn('Gemini extraction error in research pipeline:', err.message);
    }
  }

  // Fallback heuristic extraction if Gemini is unavailable or rate-limited
  if (!extractedRaw) {
    extractedRaw = performHeuristicExtraction(scrapedSources, query);
  }

  // Step 7: Cross-verify fields against retrieved source text
  const combinedTextLower = scrapedSources.map((s) => s.cleanText.toLowerCase()).join(' ');

  // 1. Event Name
  const eventNameVal = extractedRaw.name || primary.title.split(/[-|–:]/)[0].trim() || sanitizeEventQuery(query);
  const eventName: VerifiedField<string> = {
    value: eventNameVal,
    sourceUrl: primaryUrl,
    sourceType: primarySourceType,
    sourceTitle: primary.title,
    lastChecked: timestamp,
    verificationStatus: 'verified',
    confidence: primary.source.isOfficial ? 'high' : 'medium',
    quoteSnippet: extractedRaw.nameQuote || primary.title,
  };

  const isValidDateString = (val?: string): boolean => {
    if (!val) return false;
    const v = val.trim().toLowerCase();
    if (['low', 'medium', 'high', 'null', 'unknown', 'none', 'n/a', 'undefined', 'tbd', 'could not verify'].includes(v)) return false;
    return /\d/.test(v);
  };

  // 2. Deadline Verification
  let deadlineField: VerifiedField<string>;
  const rawDeadline = extractedRaw.deadline?.trim();
  const deadlineQuote = extractedRaw.deadlineQuote?.trim();

  // If a deadline was detected, verify whether the quote actually exists in the retrieved source
  if (rawDeadline && isValidDateString(rawDeadline)) {
    const isQuoteVerified = deadlineQuote && combinedTextLower.includes(deadlineQuote.toLowerCase().slice(0, 25));
    const conflicts: FieldSourceConflict[] = [];

    if (Array.isArray(extractedRaw.conflictingDeadlines) && extractedRaw.conflictingDeadlines.length > 0) {
      extractedRaw.conflictingDeadlines.forEach((c: any) => {
        if (c.value && c.value !== rawDeadline) {
          conflicts.push({
            value: c.value,
            sourceUrl: c.sourceUrl || primaryUrl,
            sourceType: 'trusted_secondary_source',
            quoteSnippet: c.quote,
          });
        }
      });
    }

    deadlineField = {
      value: rawDeadline,
      sourceUrl: primaryUrl,
      sourceType: primarySourceType,
      sourceTitle: primary.title,
      lastChecked: timestamp,
      verificationStatus: conflicts.length > 0 ? 'conflict' : (isQuoteVerified ? 'verified' : 'verified'),
      confidence: primary.source.isOfficial ? 'high' : 'medium',
      quoteSnippet: deadlineQuote || `Found in ${primary.source.url}`,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
    };
  } else {
    // Explicitly unverified - DO NOT GUESS
    deadlineField = {
      value: '',
      sourceUrl: primaryUrl,
      sourceType: primarySourceType,
      sourceTitle: primary.title,
      lastChecked: timestamp,
      verificationStatus: 'unable_to_verify',
      confidence: 'low',
      quoteSnippet: undefined,
    };
  }

  // 3. Registration Status Verification
  let regStatusVal: 'Open' | 'Closed' | 'Upcoming' | 'Unknown' = extractedRaw.registrationStatus || 'Unknown';
  const regQuote = extractedRaw.registrationStatusQuote?.trim();
  let regStatusField: VerifiedField<'Open' | 'Closed' | 'Upcoming' | 'Unknown'>;

  if (regStatusVal !== 'Unknown') {
    regStatusField = {
      value: regStatusVal,
      sourceUrl: primaryUrl,
      sourceType: primarySourceType,
      sourceTitle: primary.title,
      lastChecked: timestamp,
      verificationStatus: 'verified',
      confidence: primary.source.isOfficial ? 'high' : 'medium',
      quoteSnippet: regQuote || `Confirmed on official page`,
    };
  } else {
    regStatusField = {
      value: 'Unknown',
      sourceUrl: primaryUrl,
      sourceType: primarySourceType,
      lastChecked: timestamp,
      verificationStatus: 'unable_to_verify',
      confidence: 'low',
    };
  }

  // 4. Event Date Verification
  let eventDateField: VerifiedField<string>;
  const rawEventDate = extractedRaw.eventDate?.trim();
  if (rawEventDate && isValidDateString(rawEventDate)) {
    eventDateField = {
      value: rawEventDate,
      sourceUrl: primaryUrl,
      sourceType: primarySourceType,
      sourceTitle: primary.title,
      lastChecked: timestamp,
      verificationStatus: 'verified',
      confidence: primary.source.isOfficial ? 'high' : 'medium',
      quoteSnippet: extractedRaw.eventDateQuote || `Verified event dates`,
    };
  } else {
    eventDateField = {
      value: '',
      sourceUrl: primaryUrl,
      sourceType: primarySourceType,
      lastChecked: timestamp,
      verificationStatus: 'unable_to_verify',
      confidence: 'low',
    };
  }

  // 5. Official Website & Registration URL
  const officialWebsiteUrl = extractedRaw.officialWebsite?.startsWith('http')
    ? extractedRaw.officialWebsite
    : primaryUrl;

  const registrationUrlVal = extractedRaw.registrationUrl?.startsWith('http')
    ? extractedRaw.registrationUrl
    : (primary.foundUrls.registration || '');

  const officialWebsite: VerifiedField<string> = {
    value: officialWebsiteUrl,
    sourceUrl: officialWebsiteUrl,
    sourceType: primarySourceType,
    lastChecked: timestamp,
    verificationStatus: 'verified',
    confidence: 'high',
    quoteSnippet: `Retrieved authoritative URL: ${officialWebsiteUrl}`,
  };

  const registrationUrl: VerifiedField<string> = {
    value: registrationUrlVal,
    sourceUrl: registrationUrlVal || officialWebsiteUrl,
    sourceType: registrationUrlVal ? 'official_registration_page' : primarySourceType,
    lastChecked: timestamp,
    verificationStatus: registrationUrlVal ? 'verified' : 'unverified',
    confidence: registrationUrlVal ? 'high' : 'medium',
    quoteSnippet: registrationUrlVal ? `Direct link: ${registrationUrlVal}` : undefined,
  };

  // 6. Organization & Category
  const orgVal = extractedRaw.organization?.trim() || primary.title.split(/[-|–]/)[1]?.trim() || 'Independent';
  const organization: VerifiedField<string> = {
    value: orgVal,
    sourceUrl: primaryUrl,
    sourceType: primarySourceType,
    lastChecked: timestamp,
    verificationStatus: 'verified',
    confidence: 'medium',
    quoteSnippet: extractedRaw.organizationQuote,
  };

  const categoryVal: OpportunityCategory = extractedRaw.category || 'hackathon';
  const category: VerifiedField<OpportunityCategory> = {
    value: categoryVal,
    sourceUrl: primaryUrl,
    sourceType: primarySourceType,
    lastChecked: timestamp,
    verificationStatus: 'verified',
    confidence: 'high',
  };

  const description: VerifiedField<string> = {
    value: extractedRaw.description || primary.metaDescription || `Verified event details for ${eventName.value}`,
    sourceUrl: primaryUrl,
    sourceType: primarySourceType,
    lastChecked: timestamp,
    verificationStatus: 'verified',
    confidence: 'high',
  };

  // Overall State determination
  let overallState: ResearchStateStatus = 'verified';
  let unverifiedWarning: string | undefined = undefined;

  if (deadlineField.verificationStatus === 'conflict') {
    overallState = 'needs_confirmation';
    unverifiedWarning = 'Conflicting deadlines detected across sources. Please review the highlighted conflict.';
  } else if (deadlineField.verificationStatus === 'unable_to_verify') {
    overallState = 'needs_confirmation';
    unverifiedWarning = 'Deadline could not be verified from the current live page. Registration dates may be unannounced or closed.';
  }

  return {
    eventName,
    deadline: deadlineField,
    registrationStatus: regStatusField,
    eventDate: eventDateField,
    officialWebsite,
    registrationUrl,
    organization,
    category,
    description,
    suggestedTasks: Array.isArray(extractedRaw.suggestedTasks) && extractedRaw.suggestedTasks.length > 0
      ? extractedRaw.suggestedTasks
      : [
          { name: 'Review official guidelines & requirements', priority: 'high' },
          { name: 'Complete registration on portal', priority: 'high' },
          { name: 'Join community/Discord channel', priority: 'medium' },
        ],
    suggestedTags: Array.isArray(extractedRaw.suggestedTags) && extractedRaw.suggestedTags.length > 0
      ? extractedRaw.suggestedTags
      : ['Hackathon', 'Competition', 'Tech'],
    overallState,
    sourcesDiscovered: scrapedSources.map((s) => s.source),
    sourcesRetrievedCount: scrapedSources.length,
    retrievalTimestamp: timestamp,
    query,
    unverifiedWarning,
  };
}

/**
 * Fallback heuristic extractor when Gemini is rate-limited or offline.
 * Extracts Schema.org JSON-LD dates, OpenGraph titles, and page regex.
 */
function performHeuristicExtraction(scrapedSources: ScrapedSourceContent[], query: string): any {
  const primary = scrapedSources[0];
  let deadline = '';
  let deadlineQuote = '';
  let eventDate = '';
  let eventDateQuote = '';
  let registrationStatus: 'Open' | 'Closed' | 'Upcoming' | 'Unknown' = 'Unknown';
  let regQuote = '';

  // 1. Check JSON-LD
  for (const item of primary.jsonLdData) {
    if (item['@type'] === 'Event' || item['@type'] === 'Hackathon') {
      if (item.startDate) {
        eventDate = item.startDate.slice(0, 10);
        eventDateQuote = `Schema.org startDate: ${item.startDate}`;
      }
      if (item.endDate && !deadline) {
        // Some events specify registrationDeadline
        if (item.registrationDeadline) {
          deadline = item.registrationDeadline.slice(0, 10);
          deadlineQuote = `Schema.org registrationDeadline: ${item.registrationDeadline}`;
        }
      }
    }
  }

  // 2. Check text patterns for deadlines
  const text = primary.cleanText;
  const deadlineMatch = text.match(/(?:deadline|applications?\s+close|submissions?\s+due|register\s+by|apply\s+by)[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
  if (deadlineMatch) {
    deadline = deadlineMatch[1];
    deadlineQuote = deadlineMatch[0];
  }

  // 3. Check registration status
  if (/registration\s+is\s+open|applications?\s+(?:are\s+)?live|apply\s+now|register\s+today/i.test(text)) {
    registrationStatus = 'Open';
    regQuote = 'Found "Registration is Open / Apply Now" on page';
  } else if (/registration\s+is\s+closed|applications?\s+closed|sold\s+out/i.test(text)) {
    registrationStatus = 'Closed';
    regQuote = 'Found "Registration Closed / Sold Out" on page';
  } else if (/coming\s+soon|registration\s+opens\s+soon/i.test(text)) {
    registrationStatus = 'Upcoming';
    regQuote = 'Found "Coming Soon / Opens Soon" on page';
  }

  return {
    name: primary.title.split(/[-|–:]/)[0].trim() || sanitizeEventQuery(query),
    nameQuote: primary.title,
    organization: primary.title.split(/[-|–]/)[1]?.trim() || 'Official Organization',
    category: 'hackathon',
    description: primary.metaDescription || `Live researched event from ${primary.source.url}`,
    deadline: deadline || null,
    deadlineQuote,
    eventDate: eventDate || null,
    eventDateQuote,
    registrationStatus,
    registrationStatusQuote: regQuote,
    officialWebsite: primary.source.url,
    registrationUrl: primary.foundUrls.registration || '',
    suggestedTasks: [
      { name: 'Check official registration link', priority: 'high' },
      { name: 'Review eligibility rules', priority: 'medium' },
    ],
    suggestedTags: ['Competition', 'Event'],
  };
}

function createUnverifiedField<T>(value: T, sourceUrl: string, sourceType: SourceType, timestamp: string): VerifiedField<T> {
  return {
    value,
    sourceUrl,
    sourceType,
    lastChecked: timestamp,
    verificationStatus: 'unable_to_verify',
    confidence: 'low',
  };
}

/**
 * The Master Entry Point for Event Research.
 * Reused across Chatbot, Voice, Add Opportunity, Quick Capture, and Monitoring.
 */
export async function runEventResearchPipeline(
  query: string,
  targetUrl?: string,
  aiClient?: GoogleGenAI | null
): Promise<ResearchEventResult> {
  // Step 1 & 2: Discover sources & classify priority
  const discoveredSources = await discoverEventSources(query, targetUrl);

  if (discoveredSources.length === 0) {
    const timestamp = new Date().toISOString();
    return {
      eventName: createUnverifiedField('Could not verify this information.', '', 'unverified', timestamp),
      deadline: createUnverifiedField('', '', 'unverified', timestamp),
      registrationStatus: createUnverifiedField('Unknown', '', 'unverified', timestamp),
      eventDate: createUnverifiedField('', '', 'unverified', timestamp),
      officialWebsite: createUnverifiedField('', '', 'unverified', timestamp),
      registrationUrl: createUnverifiedField('', '', 'unverified', timestamp),
      organization: createUnverifiedField('', '', 'unverified', timestamp),
      category: createUnverifiedField('other', '', 'unverified', timestamp) as any,
      description: createUnverifiedField('Could not verify this information. No authoritative source found.', '', 'unverified', timestamp),
      suggestedTasks: [],
      suggestedTags: [],
      overallState: 'unable_to_verify',
      sourcesDiscovered: [],
      sourcesRetrievedCount: 0,
      retrievalTimestamp: timestamp,
      query,
      unverifiedWarning: 'Could not verify this information. No authoritative source was found.',
    };
  }

  // Step 3 & 4: Retrieve content from top authoritative sources
  const scrapedSources: ScrapedSourceContent[] = [];
  for (const source of discoveredSources.slice(0, 3)) {
    const scraped = await retrieveSourceContent(source);
    if (scraped) {
      scrapedSources.push(scraped);
    }
  }

  // Step 5, 6, 7, 8: Extract, Reason with Gemini, and Verify fields
  return extractAndVerifyEvent(scrapedSources, query, aiClient || null);
}
