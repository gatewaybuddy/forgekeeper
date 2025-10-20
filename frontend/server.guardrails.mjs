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
    const token = /\b(sk|api|token|secret)[-_]?[a-z0-9]{12,}\b/gi;
    const urlCreds = /(https?:\/\/)([^\s:@]+):([^\s@]+)@/gi;
    let out = str.replace(email, '<redacted:email>');
    out = out.replace(token, '<redacted:token>');
    out = out.replace(urlCreds, (_m, p1) => `${p1}<redacted:creds>@`);
    return truncatePreview(out);
  } catch {
    return truncatePreview(String(input || ''));
  }
}

