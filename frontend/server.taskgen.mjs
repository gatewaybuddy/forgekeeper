import { tailEvents } from './server.contextlog.mjs';

function parseIsoMs(s) {
  try { return Date.parse(String(s)); } catch { return NaN; }
}

export function getWindowEvents(windowMin = 60) {
  const now = Date.now();
  const lookbackMs = Math.max(1, Number(windowMin || 60)) * 60_000;
  // Read a generous tail and filter by time
  const rows = tailEvents(1000, null) || [];
  return rows.filter((e) => {
    const t = parseIsoMs(e?.ts);
    return Number.isFinite(t) && (now - t) <= lookbackMs;
  });
}

export function getWindowStats(windowMin = 60) {
  const ev = getWindowEvents(windowMin);
  let assistantMsgs = 0;
  const cont = { total: 0, fence: 0, punct: 0, short: 0 };
  for (const e of ev) {
    if (e?.act === 'message' && e?.actor === 'assistant') assistantMsgs += 1;
    if (e?.act === 'auto_continue') {
      cont.total += 1;
      const r = String(e?.reason || '').toLowerCase();
      if (cont[r] != null) cont[r] += 1;
    }
  }
  const ratio = assistantMsgs > 0 ? cont.total / assistantMsgs : 0;
  return { windowMin, assistantMsgs, cont, ratio };
}

export function suggestTasksFromStats(stats, opts = {}) {
  const items = [];
  const ratioThresh = Number(process.env.TASKGEN_CONT_RATIO_THRESHOLD || opts.ratioThreshold || 0.15);
  const minCount = Number(process.env.TASKGEN_CONT_MIN || opts.minCount || 5);
  const { assistantMsgs, cont, ratio, windowMin } = stats || {};
  if ((cont?.total || 0) >= minCount && ratio >= ratioThresh) {
    const fenceShare = cont.fence / Math.max(1, cont.total);
    const punctShare = cont.punct / Math.max(1, cont.total);
    const shortShare = cont.short / Math.max(1, cont.total);
    const sev = ratio >= 0.25 ? 'high' : 'medium';
    const reasons = Object.entries(cont).filter(([k]) => k !== 'total').sort((a,b)=> b[1]-a[1]).map(([k,v])=> `${k}:${v}`).join(', ');
    items.push({
      id: 'TGT-CONT-1',
      title: 'Reduce cutoffs: Finishers & Continuations tuning',
      severity: sev,
      evidence: { windowMin, assistantMsgs, cont, ratio },
      suggested: [
        'Verify FRONTEND_CONT_ATTEMPTS default (2–3) and cont_tokens sizing.',
        'Refine incomplete detection for dominant reasons (' + reasons + ').',
        'Enable Metrics‑Informed Prompting hints to close code fences and finish sentences.',
      ],
      acceptance: [
        'Continuation ratio over last hour below threshold',
        'Fence/punct continuations reduced by 30% week‑over‑week',
      ],
    });
    if (fenceShare >= 0.3) {
      items.push({
        id: 'TGT-FENCE-1',
        title: 'Improve code fence closure reliability',
        severity: 'medium',
        evidence: { fence: cont.fence, total: cont.total },
        suggested: [
          'Strengthen fence heuristic and add test cases for dangling ```.',
          'Enable prompting hint: "Close any open code fence (```) before returning."',
        ],
        acceptance: ['Fence‑reason continuations reduced by 30%']
      });
    }
    if (punctShare >= 0.3) {
      items.push({
        id: 'TGT-PUNCT-1',
        title: 'Ensure terminal punctuation (periods) for final sentences',
        severity: 'low',
        evidence: { punct: cont.punct, total: cont.total },
        suggested: ['Add brief hint to finish sentences with terminal punctuation.'],
        acceptance: ['Punct‑reason continuations reduced by 30%'],
      });
    }
  }
  return items;
}

export function buildPromptHints(stats, opts = {}) {
  if (String(process.env.PROMPTING_HINTS_ENABLED || '0') !== '1') return null;
  const minutes = Number(process.env.PROMPTING_HINTS_MINUTES || opts.minutes || 10);
  const threshold = Number(process.env.PROMPTING_HINTS_THRESHOLD || opts.threshold || 0.15);
  const s = stats || getWindowStats(minutes);
  if (!s || (s.cont?.total || 0) < 3) return null;
  if (s.ratio < threshold) return null;
  // Build a concise developer note based on dominant reasons
  const parts = [];
  const dominant = Object.entries(s.cont).filter(([k])=> k !== 'total').sort((a,b)=> b[1]-a[1])[0]?.[0];
  if (dominant === 'fence') parts.push('If a code block is open, close it with ``` before finishing.');
  if (dominant === 'punct') parts.push('Finish the last sentence with terminal punctuation.');
  if (dominant === 'short') parts.push('Ensure the final includes a complete ending sentence.');
  if (parts.length === 0) parts.push('Ensure the final ends cleanly with proper punctuation and closed code blocks.');
  return 'Quality hint (based on recent telemetry): ' + parts.join(' ');
}

export function suggestTasks(windowMin = 60) {
  const stats = getWindowStats(windowMin);
  const items = suggestTasksFromStats(stats);
  return { windowMin: stats.windowMin, ratio: stats.ratio, assistantMsgs: stats.assistantMsgs, cont: stats.cont, items };
}

