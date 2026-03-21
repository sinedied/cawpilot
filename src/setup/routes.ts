import process from 'node:process';
import { Buffer } from 'node:buffer';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, cpSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Request, type Response, Router } from 'express';
import {
  loadConfig,
  saveConfig,
  getSkillsPath,
  configExists,
  type ChannelConfig,
} from '../workspace/config.js';
import { saveEnvValue } from '../workspace/env.js';
import { logger } from '../utils/logger.js';
import {
  startRuntime,
  stopRuntime,
  listAvailableModels,
  checkCopilotAuth,
} from '../agent/runtime.js';
import {
  resolveEnvStatus,
  checkGitHubAuth,
  authenticateGitHub,
  buildChannelsFromEnv,
  listSkillDirs,
} from './env-config.js';
import { runCopilotLogin } from './copilot-auth.js';

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function getSkillsRoot(): string {
  // Check project root skills dir first (dev), then relative to dist
  const devPath = join(process.cwd(), 'skills');
  const distPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'skills',
  );
  return existsSync(devPath) ? devPath : distPath;
}

export function createSetupRouter(
  workspacePath: string,
  setupKey: string,
): Router {
  // eslint-disable-next-line new-cap
  const router = Router();

  // Auth middleware — all routes require valid setup key
  router.use((req: Request, res: Response, next) => {
    const provided = req.headers['x-setup-key'] as string | undefined;
    if (!provided || !safeCompare(provided, setupKey)) {
      res.status(401).json({ error: 'Invalid or missing setup key' });
      return;
    }

    next();
  });

  // ── Status ────────────────────────────────────────────
  router.get('/status', (_req: Request, res: Response) => {
    const envStatus = resolveEnvStatus();
    const hasConfig = configExists(workspacePath);
    res.json({ hasConfig, env: envStatus });
  });

  // ── GitHub Auth ───────────────────────────────────────
  router.get('/gh-auth', (_req: Request, res: Response) => {
    const user = checkGitHubAuth();
    res.json({ authenticated: Boolean(user), user });
  });

  router.post('/gh-auth', (req: Request, res: Response) => {
    const { token } = req.body as { token?: string };
    if (!token) {
      res.status(400).json({ error: 'token is required' });
      return;
    }

    const user = authenticateGitHub(token);
    if (user) {
      saveEnvValue(workspacePath, 'GH_TOKEN', token);
      res.json({ authenticated: true, user });
    } else {
      res.status(401).json({ error: 'Authentication failed' });
    }
  });

  // ── Copilot Auth ──────────────────────────────────────
  router.get('/copilot-auth', async (_req: Request, res: Response) => {
    try {
      await startRuntime();
      const status = await checkCopilotAuth();
      res.json({
        authenticated: status.isAuthenticated,
        login: status.login,
      });
    } catch {
      res.json({ authenticated: false });
    }
  });

  // SSE endpoint — streams copilot /login device code events
  router.post('/copilot-login', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    runCopilotLogin((event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);

      if (event.type === 'done' || event.type === 'error') {
        res.end();
      }
    });
  });

  // ── Models ────────────────────────────────────────────
  router.get('/models', async (_req: Request, res: Response) => {
    try {
      await startRuntime();
      const models = await listAvailableModels();
      await stopRuntime();
      res.json({ models });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  // ── Skills ────────────────────────────────────────────
  router.get('/skills', (_req: Request, res: Response) => {
    const skills = listSkillDirs(getSkillsRoot());
    res.json({ skills });
  });

  // ── Channels ──────────────────────────────────────────
  router.post('/channels', (req: Request, res: Response) => {
    const { channels } = req.body as { channels?: ChannelConfig[] };
    if (!channels || !Array.isArray(channels)) {
      res.status(400).json({ error: 'channels array is required' });
      return;
    }

    // Validate and sanitize
    const sanitized: ChannelConfig[] = channels
      .filter((c) => c.type === 'telegram' || c.type === 'http')
      .map((c) => ({
        type: c.type,
        enabled: c.enabled ?? true,
        ...(c.type === 'telegram' && {
          telegramToken: c.telegramToken,
          allowList: c.allowList ?? [],
        }),
        ...(c.type === 'http' && {
          httpPort: c.httpPort ?? 2243,
          httpApiKey: c.httpApiKey ?? randomBytes(24).toString('base64url'),
        }),
      }));

    const config = loadConfig(workspacePath);
    config.channels = sanitized;
    saveConfig(config);
    res.json({ ok: true });
  });

  // ── Complete Setup ────────────────────────────────────
  router.post('/complete', (req: Request, res: Response) => {
    const body = req.body as {
      model?: string;
      skills?: string[];
      channels?: ChannelConfig[];
    };

    const config = loadConfig(workspacePath);
    config.workspacePath = workspacePath;

    // Apply final values
    if (body.model) {
      config.model = body.model;
    }

    if (body.skills) {
      config.skills = body.skills;
      copySkills(workspacePath, body.skills);
    }

    config.channels = body.channels ?? buildChannelsFromEnv(config.channels);

    // Disable web setup
    config.web = { setupEnabled: false };

    saveConfig(config);
    ensureTemplate(workspacePath, 'SOUL.md');
    ensureTemplate(workspacePath, 'USER.md');

    logger.info('Web setup completed');
    res.json({ ok: true, message: 'Setup complete. Restarting...' });

    // Exit after response is sent — container auto-restarts into normal mode
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  });

  return router;
}

function copySkills(workspacePath: string, skills: string[]): void {
  const targetDir = getSkillsPath(workspacePath);
  mkdirSync(targetDir, { recursive: true });
  const skillsRoot = getSkillsRoot();

  for (const skill of skills) {
    const src = join(skillsRoot, skill);
    const dest = join(targetDir, skill);
    if (existsSync(src)) {
      cpSync(src, dest, { recursive: true });
    }
  }
}

function ensureTemplate(workspacePath: string, filename: string): void {
  const targetPath = join(workspacePath, '.cawpilot', filename);
  if (existsSync(targetPath)) return;

  const devPath = join(process.cwd(), 'templates', filename);
  const distPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'templates',
    filename,
  );
  const src = existsSync(devPath) ? devPath : distPath;

  if (existsSync(src)) {
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(src, targetPath);
  }
}
