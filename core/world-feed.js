// World Feed - Read-only external context for reflection
// Pulls from curated, trusted sources to give reflection a window into the world
// No authentication, no posting - just passive observation
//
// Trusted sources (allowlisted):
//   - Moltbook public API (agent community)
//   - Wikipedia featured/current events (knowledge)
//   - Hacker News top stories (tech community)
//
// Each reflection picks ONE source at random to avoid fixating on any single feed.

const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';
const FETCH_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 30 * 60 * 1000; // Cache for 30 minutes

// Per-source caches
const cache = {
  moltbook: { data: null, at: 0 },
  hackernews: { data: null, at: 0 },
  wikipedia: { data: null, at: 0 },
};

function isCacheFresh(key) {
  return cache[key].data && (Date.now() - cache[key].at) < CACHE_TTL_MS;
}

/**
 * Safe fetch wrapper with timeout and error handling.
 * Only fetches from URLs matching our trusted domains.
 */
const TRUSTED_DOMAINS = [
  'www.moltbook.com',
  'moltbook.com',
  'hacker-news.firebaseio.com',
  'en.wikipedia.org',
];

async function safeFetch(url) {
  // Validate URL against trusted domain allowlist
  const parsed = new URL(url);
  if (!TRUSTED_DOMAINS.includes(parsed.hostname)) {
    console.warn(`[WorldFeed] Blocked fetch to untrusted domain: ${parsed.hostname}`);
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      console.warn(`[WorldFeed] Fetch timed out: ${parsed.hostname}`);
    } else {
      console.warn(`[WorldFeed] Fetch failed (${parsed.hostname}): ${e.message}`);
    }
    return null;
  }
}

// === MOLTBOOK (agent community) ===

export async function fetchMoltbook({ limit = 5, sort = 'top', noCache = false } = {}) {
  if (!noCache && isCacheFresh('moltbook')) return cache.moltbook.data;

  const data = await safeFetch(`${MOLTBOOK_API}/posts?sort=${sort}&limit=${limit}`);
  if (!data?.posts) return cache.moltbook.data || [];

  const posts = data.posts.map(p => ({
    title: p.title?.slice(0, 200) || '',
    content: (p.content || p.body || '').slice(0, 300),
    submolt: p.submolt?.name || p.submolt?.display_name || p.submolt || p.community || 'general',
    upvotes: p.upvotes || 0,
    comments: p.comment_count || p.comments || 0,
    author: p.author?.name || p.author || p.agent_name || 'unknown',
  }));

  cache.moltbook = { data: posts, at: Date.now() };
  console.log(`[WorldFeed] Fetched ${posts.length} Moltbook posts`);
  return posts;
}

function formatMoltbook(posts) {
  if (!posts?.length) return null;
  const lines = posts.slice(0, 3).map(p => {
    const engagement = p.upvotes > 0 ? ` (${p.upvotes} upvotes)` : '';
    return `- [${p.submolt}] "${p.title}"${engagement}`;
  });
  return `What other AI agents are discussing on Moltbook:\n${lines.join('\n')}`;
}

// === HACKER NEWS (tech community) ===

async function fetchHackerNews({ limit = 5, noCache = false } = {}) {
  if (!noCache && isCacheFresh('hackernews')) return cache.hackernews.data;

  const ids = await safeFetch('https://hacker-news.firebaseio.com/v0/topstories.json');
  if (!ids?.length) return cache.hackernews.data || [];

  // Fetch details for top N stories
  const stories = [];
  for (const id of ids.slice(0, limit)) {
    const story = await safeFetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
    if (story?.title) {
      stories.push({
        title: story.title.slice(0, 200),
        score: story.score || 0,
        comments: story.descendants || 0,
        by: story.by || 'unknown',
      });
    }
  }

  cache.hackernews = { data: stories, at: Date.now() };
  console.log(`[WorldFeed] Fetched ${stories.length} Hacker News stories`);
  return stories;
}

function formatHackerNews(stories) {
  if (!stories?.length) return null;
  const lines = stories.slice(0, 3).map(s => {
    return `- "${s.title}" (${s.score} points, ${s.comments} comments)`;
  });
  return `What the tech community is discussing on Hacker News:\n${lines.join('\n')}`;
}

// === WIKIPEDIA (knowledge/current events) ===

async function fetchWikipedia({ noCache = false } = {}) {
  if (!noCache && isCacheFresh('wikipedia')) return cache.wikipedia.data;

  // Wikipedia featured article of the day - always interesting, always safe
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  const data = await safeFetch(
    `https://en.wikipedia.org/api/rest_v1/feed/featured/${year}/${month}/${day}`
  );
  if (!data) return cache.wikipedia.data || null;

  const result = {
    featuredArticle: data.tfa ? {
      title: data.tfa.titles?.normalized || data.tfa.title || '',
      extract: data.tfa.extract?.slice(0, 300) || '',
    } : null,
    onThisDay: (data.onthisday || []).slice(0, 2).map(e => ({
      text: e.text?.slice(0, 200) || '',
      year: e.year,
    })),
    inTheNews: (data.news || []).slice(0, 2).map(n => ({
      text: (n.story || '').replace(/<[^>]+>/g, '').replace(/<!--[^>]+-->/g, '').slice(0, 200),
    })),
  };

  cache.wikipedia = { data: result, at: Date.now() };
  console.log(`[WorldFeed] Fetched Wikipedia featured content`);
  return result;
}

function formatWikipedia(wiki) {
  if (!wiki) return null;
  const parts = [];

  if (wiki.featuredArticle?.title) {
    parts.push(`Today's featured article: "${wiki.featuredArticle.title}" — ${wiki.featuredArticle.extract.slice(0, 150)}...`);
  }

  if (wiki.inTheNews?.length > 0) {
    const newsLines = wiki.inTheNews.map(n => `- ${n.text}`);
    parts.push(`In the news:\n${newsLines.join('\n')}`);
  }

  if (wiki.onThisDay?.length > 0) {
    const event = wiki.onThisDay[0];
    parts.push(`On this day in ${event.year}: ${event.text}`);
  }

  if (parts.length === 0) return null;
  return `From Wikipedia today:\n${parts.join('\n')}`;
}

// === MAIN API ===

// All available sources with their fetch/format functions
const SOURCES = [
  { name: 'moltbook', fetch: fetchMoltbook, format: formatMoltbook, label: 'agent community' },
  { name: 'hackernews', fetch: fetchHackerNews, format: formatHackerNews, label: 'tech community' },
  { name: 'wikipedia', fetch: fetchWikipedia, format: formatWikipedia, label: 'knowledge' },
];

/**
 * Get world context for reflection from a randomly selected source.
 * Each reflection gets ONE source to keep prompts focused and varied.
 * Returns null on failure (non-blocking).
 *
 * @param {object} options
 * @param {string} options.source - Force a specific source ('moltbook', 'hackernews', 'wikipedia')
 * @returns {Promise<string|null>} Formatted context string
 */
export async function getWorldContext(options = {}) {
  try {
    // Pick a source - random unless specified
    let source;
    if (options.source) {
      source = SOURCES.find(s => s.name === options.source);
    }
    if (!source) {
      source = SOURCES[Math.floor(Math.random() * SOURCES.length)];
    }

    console.log(`[WorldFeed] Selected source: ${source.name} (${source.label})`);

    const data = await source.fetch(options);
    return source.format(data);
  } catch (e) {
    console.warn(`[WorldFeed] Failed to get world context: ${e.message}`);
    return null;
  }
}

// Keep these exported for direct use if needed
export { fetchMoltbook as fetchAgentPosts };
export { formatMoltbook as formatWorldDigest };

export default { getWorldContext, fetchMoltbook, fetchHackerNews, fetchWikipedia };
