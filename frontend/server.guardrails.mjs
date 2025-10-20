// Guardrail helpers for redaction and preview truncation

const DEFAULT_MAX_PREVIEW = Number(process.env.TOOLS_LOG_MAX_PREVIEW || '4096');

export function truncatePreview(text, maxBytes = DEFAULT_MAX_PREVIEW) {
  try {
    if (text == null) return '';
    const buf = Buffer.from(String(text), 'utf8');
    if (buf.length <= maxBytes) return buf.toString('utf8');
    const slice = buf.subarray(0, maxBytes).toString('utf8');
    return `${slice} [TRUNCATED] (${buf.length} bytes)`;
  } catch {
    return String(text);
  }
}

export function redactPreview(input) {
  try {
    const str = typeof input === 'string' ? input : JSON.stringify(input);
    const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
    // Common secret markers + Stripe-like keys: sk_test_*, sk_live_*
    const token = /(sk_(live|test)_[A-Za-z0-9_-]{8,}|\b(api|token|secret)[-_]?[A-Za-z0-9]{12,}\b)/gi;
    const urlCreds = /(https?:\/\/)([^\s:@]+):([^\s@]+)@/gi;
    // Redact URL credentials first to avoid email regex swallowing parts of the URL
    let out = str.replace(urlCreds, (_m, p1) => `${p1}<redacted:creds>@`);
    out = out.replace(email, '<redacted:email>');
    out = out.replace(token, '<redacted:token>');
    return truncatePreview(out);
  } catch {
    return truncatePreview(String(input || ''));
  }
}
