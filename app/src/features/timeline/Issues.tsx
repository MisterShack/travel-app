import { findIssues, type Issue, type TimelineItem } from '@travel/shared';

/**
 * Conflicts and gaps on a trip (PLAN-V3 Phase 11).
 *
 * Computed on the client from the timeline already in hand, so it works with no
 * network and costs nothing — the same property that makes the offline cache
 * worth having.
 *
 * It renders nothing when there is nothing wrong. An app whose character is
 * quiet does not get to have a permanent "0 issues" panel; the absence of this
 * block is the good news.
 */
export function Issues({
  items,
  trip,
}: {
  items: TimelineItem[];
  trip: { startDate: string; endDate: string; homeTimezone: string };
}) {
  const issues = findIssues(items, trip);
  if (issues.length === 0) return null;

  const conflicts = issues.filter((i) => i.severity === 'conflict');
  const warnings = issues.filter((i) => i.severity === 'warning');

  return (
    <section className="issues" aria-label="Problems with this trip">
      {conflicts.length > 0 && <Group tone="conflict" issues={conflicts} />}
      {warnings.length > 0 && <Group tone="warning" issues={warnings} />}
    </section>
  );
}

function Group({ tone, issues }: { tone: 'conflict' | 'warning'; issues: Issue[] }) {
  return (
    <div className={`issue-group issue-${tone}`}>
      <h3>
        {tone === 'conflict'
          ? issues.length === 1
            ? 'This cannot happen'
            : 'These cannot happen'
          : 'Worth checking'}
      </h3>
      <ul>
        {issues.map((issue) => (
          <li key={`${issue.kind}:${issue.itemIds.join(',')}:${issue.message}`}>{issue.message}</li>
        ))}
      </ul>
    </div>
  );
}
