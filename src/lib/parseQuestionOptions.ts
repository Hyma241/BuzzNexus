/** Normalize options from DB jsonb / AI JSON (array, string, or object). */
export function parseQuestionOptions(options: unknown): string[] {
  if (Array.isArray(options)) {
    return options.map((o) => String(o).trim()).filter(Boolean);
  }
  if (typeof options === 'string') {
    try {
      const parsed = JSON.parse(options);
      return parseQuestionOptions(parsed);
    } catch {
      return options.trim() ? [options.trim()] : [];
    }
  }
  if (options && typeof options === 'object') {
    const vals = Object.values(options as Record<string, unknown>)
      .map((o) => String(o).trim())
      .filter(Boolean);
    if (vals.length > 0) return vals;
  }
  return [];
}
