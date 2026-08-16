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

/** A downloaded attachment, held in memory only. */
export type Attachment = {
  filename: string;
  contentType: string;
  /** Base64, as the model API wants it. Never written to disk (PLAN.md §4). */
  data: string;
};

export interface InboundClient {
  fetchMessage(id: string): Promise<ReceivedEmail>;
  /**
   * Attachments for a message, downloaded and returned in memory.
   *
   * Real airline confirmations put the itinerary in a PDF and leave the body as
   * a covering note, so a parser that reads only text/html sees almost nothing.
   * This is the half of PLAN.md §6.3 that was specified and then not built.
   */
  fetchAttachments(id: string, maxBytes?: number): Promise<Attachment[]>;
}

export class ResendInboundClient implements InboundClient {
  constructor(private readonly apiKey: string) {}

  async fetchAttachments(id: string, maxBytes = 8 * 1024 * 1024): Promise<Attachment[]> {
    const listed = await fetch(
      `https://api.resend.com/emails/receiving/${encodeURIComponent(id)}/attachments`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } },
    );
    if (!listed.ok) return [];

    const body = (await listed.json()) as { data?: Record<string, unknown>[] };
    const rows = Array.isArray(body.data) ? body.data : [];
    const out: Attachment[] = [];
    let budget = maxBytes;

    for (const row of rows) {
      const url = row['download_url'];
      const contentType = String(row['content_type'] ?? '');
      const size = Number(row['size'] ?? 0);
      // Only what the model can read, and only while there is budget. A 30 MB
      // brochure is not worth the request it would take to send it.
      if (typeof url !== 'string' || !/^application\/pdf$|^text\//.test(contentType)) continue;
      if (size > budget) continue;

      const file = await fetch(url);
      if (!file.ok) continue;
      const buffer = Buffer.from(await file.arrayBuffer());
      if (buffer.byteLength > budget) continue;
      budget -= buffer.byteLength;

      out.push({
        filename: String(row['filename'] ?? 'attachment'),
        contentType,
        data: buffer.toString('base64'),
      });
    }
    return out;
  }

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
  constructor(
    private readonly messages: Record<string, ReceivedEmail>,
    private readonly attachments: Record<string, Attachment[]> = {},
  ) {}
  fetchMessage(id: string): Promise<ReceivedEmail> {
    const found = this.messages[id];
    if (!found) return Promise.reject(new Error(`no such message ${id}`));
    return Promise.resolve(found);
  }
  fetchAttachments(id: string): Promise<Attachment[]> {
    return Promise.resolve(this.attachments[id] ?? []);
  }
}

/** `"Someone <a@b.com>"` → `a@b.com`, lower-cased. */
export function addressOf(value: string): string {
  const angled = /<([^>]+)>/.exec(value);
  return (angled?.[1] ?? value).trim().toLowerCase();
}
