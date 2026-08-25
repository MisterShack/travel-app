/**
 * Turning a rejected save into something that names the field.
 *
 * "Check the journey details." on a form with twelve controls and a passenger
 * list tells you that something is wrong and nothing about where. A sighted
 * user at least sees red text at the bottom of the form; someone listening has
 * to walk the whole thing guessing. That is WCAG 3.3.1 — an error must identify
 * the item in error and describe it *in text*.
 *
 * The server already sends what is needed. Every rejected write returns the Zod
 * issues alongside the message, and each issue carries the path it failed at,
 * so the only missing piece was translating that path into the words the form
 * actually shows. It is deliberately the *label*, not the field name: the
 * person is looking at a control called "Operator", and telling them `carrier`
 * failed is a different kind of unhelpful.
 */

/**
 * The labels of the fields an error is about, in the order the issues arrived,
 * de-duplicated. Empty when nothing can be mapped — a caller that gets nothing
 * must fall back to the server's own message rather than inventing detail.
 *
 * Only the first path segment is read. `['departure', 'local']` and
 * `['departure', 'timezone']` are both the departure field as far as the form is
 * concerned: they are one control, and naming it twice would be noise.
 */
export function invalidFieldLabels(issues: unknown, labels: Record<string, string>): string[] {
  if (!Array.isArray(issues)) return [];

  const named: string[] = [];
  for (const issue of issues) {
    if (issue === null || typeof issue !== 'object') continue;
    const path = (issue as { path?: unknown }).path;
    if (!Array.isArray(path) || path.length === 0) continue;

    const label = labels[String(path[0])];
    if (label !== undefined && !named.includes(label)) named.push(label);
  }
  return named;
}

/** "From", "From and Arrives", "From, To and Arrives". */
export function listPhrase(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * The message to show for a rejected save.
 *
 * Keeps the server's sentence and adds the fields to look at, rather than
 * replacing it — the server knows why it refused and this only knows where.
 */
export function describeRejection(
  message: string,
  issues: unknown,
  labels: Record<string, string>,
): string {
  const fields = invalidFieldLabels(issues, labels);
  return fields.length === 0 ? message : `${message} Look at ${listPhrase(fields)}.`;
}
