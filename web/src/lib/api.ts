let setupKey = '';

export function initApi() {
  const params = new URLSearchParams(globalThis.location.search);
  setupKey = params.get('key') ?? '';
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`/api/setup${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Setup-Key': setupKey,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `HTTP ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

export function apiSSE(
  path: string,
  onEvent: (event: Record<string, unknown>) => void,
  onDone: () => void,
): void {
  fetch(`/api/setup${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Setup-Key': setupKey,
    },
  })
    .then(async (res) => {
      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              onEvent(data as Record<string, unknown>);
            } catch {
              // Skip malformed lines
            }
          }
        }
      }

      onDone();
    })
    .catch(() => {
      onDone();
    });
}
