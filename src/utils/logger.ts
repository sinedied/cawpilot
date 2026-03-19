import chalk from 'chalk';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const levelColors: Record<LogLevel, (s: string) => string> = {
  debug: chalk.gray,
  info: chalk.blue,
  warn: chalk.yellow,
  error: chalk.red,
};

let currentLevel: LogLevel = 'debug';
let enabled = false;

function shouldLog(level: LogLevel): boolean {
  return enabled && levels[level] >= levels[currentLevel];
}

function formatMessage(level: LogLevel, msg: string): string {
  const timestamp = new Date().toISOString().slice(11, 19);
  const tag = levelColors[level](`[${level.toUpperCase()}]`);
  return `${chalk.dim(timestamp)} ${tag} ${msg}`;
}

export const logger = {
  debug(msg: string, ...args: unknown[]) {
    if (shouldLog('debug')) console.debug(formatMessage('debug', msg), ...args);
  },
  info(msg: string, ...args: unknown[]) {
    if (shouldLog('info')) console.info(formatMessage('info', msg), ...args);
  },
  warn(msg: string, ...args: unknown[]) {
    if (shouldLog('warn')) console.warn(formatMessage('warn', msg), ...args);
  },
  error(msg: string, ...args: unknown[]) {
    if (shouldLog('error')) console.error(formatMessage('error', msg), ...args);
  },
  setLevel(level: LogLevel) {
    currentLevel = level;
  },
  enable() {
    enabled = true;
  },
  disable() {
    enabled = false;
  },
};
