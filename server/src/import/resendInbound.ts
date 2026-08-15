/**
 * Fetching a received message from Resend (PLAN.md §6).
 *
 * The webhook payload is metadata only, so the body has to be pulled from the
 * API. It is parsed in memory and never written to our database — the seam is
 * here so that rule has exactly one place it could be broken.
 */

export type ReceivedEmail = {
  id: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string | null;
  createdAt: string;
};

export interface InboundClient {
  fetchMessage(id: string): Promise<ReceivedEmail>;
}

export class ResendInboundClient implements InboundClient {
  constructor(private readonly apiKey: string) {}

  async fetchMessage(id: string): Promise<ReceivedEmail> {
    const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!response.ok) {
      throw new Error(`Resend returned ${response.status} fetching message ${id}`);
    }
    const body = (await response.json()) as Record<string, unknown>;
    return {
      id: String(body['id'] ?? id),
      from: String(body['from'] ?? ''),
      to: Array.isArray(body['to']) ? (body['to'] as string[]) : [String(body['to'] ?? '')],
      subject: String(body['subject'] ?? ''),
      text: String(body['text'] ?? ''),
      html: body['html'] ? String(body['html']) : null,
      createdAt: String(body['created_at'] ?? new Date().toISOString()),
    };
  }
}

/** Test double. */
export class MemoryInboundClient implements InboundClient {
  constructor(private readonly messages: Record<string, ReceivedEmail>) {}
  fetchMessage(id: string): Promise<ReceivedEmail> {
    const found = this.messages[id];
    if (!found) return Promise.reject(new Error(`no such message ${id}`));
    return Promise.resolve(found);
  }
}

/** `"Someone <a@b.com>"` → `a@b.com`, lower-cased. */
export function addressOf(value: string): string {
  const angled = /<([^>]+)>/.exec(value);
  return (angled?.[1] ?? value).trim().toLowerCase();
}
