import { useEffect, useState } from 'react';
import { api, ApiError } from '@/api/client';
import { ErrorText } from '@/components/Bits';

/**
 * Notification settings for one trip (PLAN.md §7).
 *
 * Email is the default channel and needs no setup, so this screen is only ever
 * about two things: muting this trip, and adding push on top.
 */

/**
 * The VAPID key arrives base64url; `pushManager.subscribe` wants raw bytes.
 *
 * Built on an explicit `ArrayBuffer` rather than `Uint8Array.from`, because the
 * latter is typed over `ArrayBufferLike` — which includes `SharedArrayBuffer`,
 * and `BufferSource` does not accept one.
 */
function decodeKey(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.padEnd(base64url.length + ((4 - (base64url.length % 4)) % 4), '=');
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  ('standalone' in window.navigator && Boolean((window.navigator as { standalone?: boolean }).standalone));

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  // iPadOS reports as a Mac; the touch points give it away.
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

type PushState = 'unsupported' | 'needs-install' | 'available' | 'enabled' | 'denied' | 'unconfigured';

export function NotificationSettings({ tripId, enabled }: { tripId: string; enabled: boolean }) {
  const [muted, setMuted] = useState(!enabled);
  const [push, setPush] = useState<PushState>('unsupported');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const { enabled: configured } = await api
        .get<{ enabled: boolean }>('/push/key')
        .catch(() => ({ enabled: false }));
      if (!configured) return setPush('unconfigured');

      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        /**
         * On iOS this is the normal case, not an error: Safari exposes
         * PushManager only to a PWA launched from the Home Screen. Telling
         * someone "not supported" when the real answer is "install it first"
         * would be both wrong and unactionable.
         */
        return setPush(isIOS() && !isStandalone() ? 'needs-install' : 'unsupported');
      }
      if (Notification.permission === 'denied') return setPush('denied');

      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      setPush(existing ? 'enabled' : 'available');
    })();
  }, []);

  const enablePush = async () => {
    setBusy(true);
    setError('');
    try {
      const { publicKey } = await api.get<{ publicKey: string }>('/push/key');
      // Must be called from the click, not after an await chain that loses the
      // user gesture — Safari in particular refuses otherwise.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPush(permission === 'denied' ? 'denied' : 'available');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeKey(publicKey),
      });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await api.post('/push/subscribe', { endpoint: json.endpoint, keys: json.keys });
      setPush('enabled');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not turn on notifications on this device.');
    } finally {
      setBusy(false);
    }
  };

  const disablePush = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.post('/push/unsubscribe', { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setPush('available');
    } finally {
      setBusy(false);
    }
  };

  const toggleMute = async (next: boolean) => {
    setMuted(next);
    await api.post(`/trips/${tripId}/reminders`, { enabled: !next }).catch(() => setMuted(!next));
  };

  return (
    <section className="card">
      <h3 style={{ marginTop: 0, fontSize: 16 }}>Reminders</h3>
      <p className="muted tiny" style={{ marginTop: 0 }}>
        Before each flight, check-in and booking. Sent by email; add this device for push as well.
      </p>

      <label className="row" style={{ gap: 8, alignItems: 'center', margin: '12px 0' }}>
        <input
          type="checkbox"
          style={{ width: 'auto' }}
          checked={!muted}
          onChange={(e) => void toggleMute(!e.target.checked)}
        />
        <span className="grow">Remind me about this trip</span>
      </label>

      {push === 'unconfigured' && <p className="muted tiny">Push is not set up on this server; reminders go by email.</p>}

      {push === 'needs-install' && (
        <p className="muted tiny">
          To get push notifications on iPhone, add Trips to your Home Screen first — Share, then
          <strong> Add to Home Screen</strong>, then open it from there. Until then, reminders
          still arrive by email.
        </p>
      )}

      {push === 'denied' && (
        <p className="muted tiny">
          Notifications are blocked for this site in your browser settings. Email reminders are
          unaffected.
        </p>
      )}

      {push === 'available' && (
        <button className="secondary" disabled={busy} onClick={() => void enablePush()}>
          {busy ? 'Turning on…' : 'Also notify this device'}
        </button>
      )}

      {push === 'enabled' && (
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <span className="grow muted tiny">This device will get push notifications.</span>
          <button className="secondary" disabled={busy} onClick={() => void disablePush()}>
            Turn off
          </button>
        </div>
      )}

      <ErrorText>{error}</ErrorText>
    </section>
  );
}
