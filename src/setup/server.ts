import process from 'node:process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import chalk from 'chalk';
import { ensureWorkspace } from '../workspace/manager.js';
import { loadEnvFile } from '../workspace/env.js';
import { logger } from '../utils/logger.js';
import { renderBanner, gradientText } from '../ui/banner.js';
import { createSetupRouter } from './routes.js';

const SETUP_PORT = 2243;

export async function runSetupServer(workspacePath: string): Promise<void> {
  const setupKey = process.env.SETUP_KEY;
  if (!setupKey) {
    throw new Error('SETUP_KEY environment variable is required for web setup');
  }

  ensureWorkspace(workspacePath);
  loadEnvFile(workspacePath);

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Serve static web UI files
  const webDir = resolveWebDir();
  if (webDir) {
    app.use('/setup', express.static(webDir));
  }

  // Redirect root to setup wizard
  app.get('/', (_req, res) => {
    res.redirect('/setup/');
  });

  // Health check (no auth required)
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'setup', mode: 'web-setup' });
  });

  // Setup API routes (auth required)
  app.use('/api/setup', createSetupRouter(workspacePath, setupKey));

  // Start server
  const server = app.listen(SETUP_PORT, () => {
    const url = `http://localhost:${SETUP_PORT}/setup/?key=${setupKey}`;
    logger.info(`Setup server running at ${url}`);

    console.log('\n' + renderBanner() + '\n');
    console.log(chalk.bold('  Web Setup Mode\n'));
    console.log('  Open this URL to complete setup:\n');
    console.log('  ' + gradientText(url) + '\n');
    console.log(
      chalk.dim('  Waiting for setup to complete... (Ctrl+C to cancel)\n'),
    );
  });

  // Graceful shutdown
  const shutdown = () => {
    server.close();
  };

  process.on('SIGINT', () => {
    shutdown();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    shutdown();
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}

function resolveWebDir(): string | undefined {
  // Development: web/dist (when running with tsx)
  const devPath = join(process.cwd(), 'web', 'dist');
  if (existsSync(devPath)) return devPath;

  // Production: dist/web (copied by Dockerfile)
  const distPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');
  if (existsSync(distPath)) return distPath;

  // Fallback: dist/web from project root
  const rootDist = join(process.cwd(), 'dist', 'web');
  if (existsSync(rootDist)) return rootDist;

  logger.warn('Web UI directory not found — setup API will work but no UI.');
  return undefined;
}
