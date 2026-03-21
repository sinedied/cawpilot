import { spawn } from 'node:child_process';
import { logger } from '../utils/logger.js';

export type CopilotAuthEvent =
  | { type: 'code'; code: string; url: string }
  | { type: 'done'; login?: string }
  | { type: 'error'; message: string }
  | { type: 'raw'; text: string };

/**
 * Spawn `copilot /login` and stream events via callback.
 * Captures stdout/stderr to detect the device code and verification URL.
 */
export function runCopilotLogin(
  onEvent: (event: CopilotAuthEvent) => void,
): void {
  const child = spawn('copilot', ['/login'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let codeEmitted = false;
  const lineBuffer = { stdout: '', stderr: '' };

  const processLine = (line: string): CopilotAuthEvent | undefined => {
    const codeMatch = /\b([A-Z\d]{4}-[A-Z\d]{4})\b/v.exec(line);
    const urlMatch = /https:\/\/github\.com\/login\/device/v.exec(line);

    if (codeMatch && !codeEmitted) {
      codeEmitted = true;
      return {
        type: 'code',
        code: codeMatch[1],
        url: urlMatch ? urlMatch[0] : 'https://github.com/login/device',
      };
    }

    if (urlMatch && !codeEmitted) {
      return { type: 'raw', text: line.trim() };
    }

    if (/authenticated|logged in|success/iv.test(line)) {
      const loginMatch = /as\s+(\S+)/iv.exec(line);
      return { type: 'done', login: loginMatch?.[1] };
    }

    return undefined;
  };

  const handleData = (stream: 'stdout' | 'stderr', chunk: Uint8Array) => {
    lineBuffer[stream] += new TextDecoder().decode(chunk);
    const lines = lineBuffer[stream].split('\n');
    lineBuffer[stream] = lines.pop()!;
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = processLine(line);
      onEvent(event ?? { type: 'raw', text: line.trim() });
    }
  };

  child.stdout?.on('data', (chunk: Uint8Array) => {
    handleData('stdout', chunk);
  });

  child.stderr?.on('data', (chunk: Uint8Array) => {
    handleData('stderr', chunk);
  });

  child.on('close', (code) => {
    for (const stream of ['stdout', 'stderr'] as const) {
      const remaining = lineBuffer[stream].trim();
      if (remaining) {
        const event = processLine(remaining);
        if (event) {
          onEvent(event);
        }
      }
    }

    onEvent(
      code === 0
        ? { type: 'done' }
        : {
            type: 'error',
            message: `copilot /login exited with code ${code}`,
          },
    );
    logger.debug('copilot /login process completed');
  });

  child.on('error', (error) => {
    onEvent({ type: 'error', message: error.message });
  });
}
