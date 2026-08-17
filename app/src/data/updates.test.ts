import { afterEach, describe, expect, it, vi } from 'vitest';
import { reloadOnNewVersion } from './updates';

type Listener = () => void;

function fakeServiceWorker(controller: object | null) {
  const listeners: Listener[] = [];
  const sw = {
    controller,
    addEventListener: (_type: string, fn: Listener) => listeners.push(fn),
  };
  vi.stubGlobal('navigator', { serviceWorker: sw });
  return { fire: () => listeners.forEach((l) => l()) };
}

afterEach(() => vi.unstubAllGlobals());

describe('reloadOnNewVersion', () => {
  it('reloads when a new worker takes control of a running page', () => {
    // The bug this exists for: a fix is deployed, the worker updates, and the
    // page keeps running the JavaScript it downloaded days ago.
    const { fire } = fakeServiceWorker({});
    const reload = vi.fn();
    reloadOnNewVersion(reload);
    fire();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload a first visit', () => {
    // A page that starts uncontrolled gets the same event from clients.claim(),
    // which would reload every new visitor once for nothing.
    const { fire } = fakeServiceWorker(null);
    const reload = vi.fn();
    reloadOnNewVersion(reload);
    fire();
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads at most once', () => {
    const { fire } = fakeServiceWorker({});
    const reload = vi.fn();
    reloadOnNewVersion(reload);
    fire();
    fire();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
