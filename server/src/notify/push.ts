import { eq } from 'drizzle-orm';
import webpush from 'web-push';
import type { Db } from '../db/client';
import { pushSubscriptions, type PushSubscriptionRow } from '../db/schema';

export type PushConfig = { publicKey: string; privateKey: string; subject: string };

export type Pusher = {
  send(sub: PushSubscriptionRow, payload: { title: string; body: string; url?: string }): Promise<void>;
};

/** Test double: records instead of sending. */
export class MemoryPusher implements Pusher {
  readonly sent: { endpoint: string; title: string }[] = [];
  send(sub: PushSubscriptionRow, payload: { title: string; body: string }) {
    this.sent.push({ endpoint: sub.endpoint, title: payload.title });
    return Promise.resolve();
  }
}

/** Thrown when the push service says the subscription is dead. */
export class GoneError extends Error {
  constructor() {
    super('Subscription is gone');
    this.name = 'GoneError';
  }
}

export function createPusher(config: PushConfig, db: Db): Pusher {
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  return {
    async send(sub, payload) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        /**
         * 404 and 410 are the push service saying this subscription no longer
         * exists — the browser was uninstalled, the user cleared site data, the
         * endpoint expired. Deleting the row is the only correct response;
         * keeping it means retrying forever against a dead endpoint.
         */
        if (status === 404 || status === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
          throw new GoneError();
        }
        throw error;
      }
    },
  };
}
