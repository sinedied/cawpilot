import { existsSync, readFileSync } from 'node:fs';

let _isDocker: boolean | undefined;

export function isRunningInDocker(): boolean {
  if (_isDocker !== undefined) return _isDocker;

  // Standard Docker marker file
  if (existsSync('/.dockerenv')) {
    _isDocker = true;
    return true;
  }

  // Fallback: check cgroup for docker/container runtime indicators
  try {
    const cgroup = readFileSync('/proc/1/cgroup', 'utf8');
    _isDocker = /docker|containerd|kubepods/v.test(cgroup);
  } catch {
    _isDocker = false;
  }

  return _isDocker;
}
