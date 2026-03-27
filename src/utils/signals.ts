import process from 'node:process';

type ManagedSignal = 'SIGINT' | 'SIGTERM';
type SignalHandler = () => void;
type SignalHandlerMap = Partial<Record<ManagedSignal, SignalHandler>>;

export function registerSignalHandlers(
  handlers: SignalHandlerMap,
  options?: { once?: boolean },
): () => void {
  const removeFns: Array<() => void> = [];

  for (const [signal, handler] of Object.entries(handlers) as Array<
    [ManagedSignal, SignalHandler | undefined]
  >) {
    if (!handler) {
      continue;
    }

    if (options?.once) {
      process.once(signal, handler);
    } else {
      process.on(signal, handler);
    }

    removeFns.push(() => {
      process.off(signal, handler);
    });
  }

  return () => {
    for (const remove of removeFns) {
      remove();
    }
  };
}
