import process from 'node:process';
import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import { type Request, type Response, Router } from 'express';
import {
  loadConfig,
  saveConfig,
  configExists,
  type ChannelConfig,
} from '../workspace/config.js';
import { saveEnvValue } from '../workspace/env.js';
import { logger } from '../utils/logger.js';
import { isRunningInDocker } from '../utils/docker.js';
import {
  startRuntime,
  stopRuntime,
  listAvailableModels,
  checkCopilotAuth,
} from '../agent/runtime.js';
import {
  getGitHubUser,
  authenticateGitHub,
  resolveEnvStatus,
  listAvailableSkills,
  getSkillsRoot,
  sanitizeChannels,
  buildChannelsFromEnv,
  copyEnabledSkills,
  finalizeSetup,
} from './steps.js';
import { runCopilotLogin } from './copilot-auth.js';

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
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
    const config = hasConfig ? loadConfig(workspacePath) : undefined;
    res.json({
      hasConfig,
      env: envStatus,
      isDocker: isRunningInDocker(),
      persistence: config?.persistence,
    });
  });

  // ── GitHub Auth ───────────────────────────────────────
  router.get('/gh-auth', (_req: Request, res: Response) => {
    const user = getGitHubUser();
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
    const skills = listAvailableSkills();
    res.json({ skills });
  });

  // ── Channels ──────────────────────────────────────────
  router.post('/channels', (req: Request, res: Response) => {
    const { channels } = req.body as { channels?: ChannelConfig[] };
    if (!channels || !Array.isArray(channels)) {
      res.status(400).json({ error: 'channels array is required' });
      return;
    }

    const sanitized = sanitizeChannels(channels);

    const config = loadConfig(workspacePath);
    config.channels = sanitized;
    saveConfig(config);
    res.json({ ok: true });
  });

  // ── Complete Setup ────────────────────────────────────
  router.post('/complete', async (req: Request, res: Response) => {
    const body = req.body as {
      model?: string;
      skills?: string[];
      channels?: ChannelConfig[];
      persistence?: {
        enabled: boolean;
        repo: string;
        backupIntervalDays: number;
      };
    };

    const config = loadConfig(workspacePath);
    config.workspacePath = workspacePath;

    // Apply final values
    if (body.model) {
      config.model = body.model;
    }

    if (body.skills) {
      config.skills = body.skills;
    }

    config.channels = body.channels ?? buildChannelsFromEnv(config.channels);

    if (body.persistence) {
      config.persistence = body.persistence;
    }

    // Disable web setup
    config.web = { setupEnabled: false };

    saveConfig(config);
    finalizeSetup(workspacePath, config.skills);

    // Initialize persistence if enabled
    if (config.persistence.enabled && config.persistence.repo) {
      try {
        const { initializePersistence } =
          await import('../workspace/persistence.js');
        initializePersistence(config);
      } catch {
        logger.warn('Persistence initialization failed during web setup');
      }
    }

    logger.info('Web setup completed');
    res.json({ ok: true });

    if (isRunningInDocker()) {
      // Container auto-restarts into normal mode
      setTimeout(() => {
        process.exit(0);
      }, 1000);
    } else {
      // Locally: restart into normal start mode
      setTimeout(() => {
        void (async () => {
          try {
            const { runStart } = await import('../cli/start.js');
            await runStart(workspacePath);
          } catch {
            process.exit(0);
          }
        })();
      }, 500);
    }
  });

  return router;
}
