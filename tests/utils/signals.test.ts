import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('utils/signals', () => {
  let initialSigintListeners: Function[];
  let initialSigtermListeners: Function[];

  beforeEach(() => {
    vi.resetModules();
    initialSigintListeners = process.listeners('SIGINT');
    initialSigtermListeners = process.listeners('SIGTERM');
  });

  afterEach(() => {
    for (const listener of process.listeners('SIGINT')) {
      if (!initialSigintListeners.includes(listener)) {
        process.off('SIGINT', listener as () => void);
      }
    }

    for (const listener of process.listeners('SIGTERM')) {
      if (!initialSigtermListeners.includes(listener)) {
        process.off('SIGTERM', listener as () => void);
      }
    }

    vi.restoreAllMocks();
  });

  it('removes only the listeners it registers', async () => {
    const externalSigint = vi.fn();
    const externalSigterm = vi.fn();
    process.on('SIGINT', externalSigint);
    process.on('SIGTERM', externalSigterm);

    const { registerSignalHandlers } = await import(
      '../../src/utils/signals.js'
    );

    const ownedSigint = vi.fn();
    const ownedSigterm = vi.fn();
    const dispose = registerSignalHandlers({
      SIGINT: ownedSigint,
      SIGTERM: ownedSigterm,
    });

    expect(process.listeners('SIGINT')).toContain(externalSigint);
    expect(process.listeners('SIGINT')).toContain(ownedSigint);
    expect(process.listeners('SIGTERM')).toContain(externalSigterm);
    expect(process.listeners('SIGTERM')).toContain(ownedSigterm);

    dispose();

    expect(process.listeners('SIGINT')).toContain(externalSigint);
    expect(process.listeners('SIGINT')).not.toContain(ownedSigint);
    expect(process.listeners('SIGTERM')).toContain(externalSigterm);
    expect(process.listeners('SIGTERM')).not.toContain(ownedSigterm);

    process.off('SIGINT', externalSigint);
    process.off('SIGTERM', externalSigterm);
  });
});