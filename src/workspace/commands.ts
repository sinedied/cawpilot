import { spawnSync, type SpawnSyncOptions } from 'node:child_process';

type CommandOptions = Omit<SpawnSyncOptions, 'encoding'>;

function formatCommandFailure(
  command: string,
  args: string[],
  result: ReturnType<typeof spawnSync>,
): Error {
  const stderr = result.stderr?.toString().trim();
  const stdout = result.stdout?.toString().trim();
  const signal = result.signal ? ` (signal: ${result.signal})` : '';
  const detail = stderr || stdout || `exit code ${result.status ?? 'unknown'}`;
  return new Error(`${command} ${args.join(' ')} failed${signal}: ${detail}`);
}

export function runCommand(
  command: string,
  args: string[],
  options: CommandOptions = {},
): string {
  const result = spawnSync(command, args, {
    ...options,
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw formatCommandFailure(command, args, result);
  }

  return result.stdout?.toString().trim() ?? '';
}

export function commandSucceeds(
  command: string,
  args: string[],
  options: CommandOptions = {},
): boolean {
  const result = spawnSync(command, args, {
    ...options,
    encoding: 'utf8',
  });

  return !result.error && result.status === 0;
}
