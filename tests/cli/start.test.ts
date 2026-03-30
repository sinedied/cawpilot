import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const handleCommandMock = vi.fn();
const startRuntimeMock = vi.fn();
const stopRuntimeMock = vi.fn();

class MockCliChannel {
  readonly name = 'cli';
  readonly canPushMessages = true;
  private commandHandler:
    | ((
        command: string,
        channel: string,
        sender: string,
        args: string[],
      ) => Promise<void> | void)
    | undefined;

  setCommandHandler(handler: typeof this.commandHandler): void {
    this.commandHandler = handler;
  }

  enableDashboardMode(): void {}

  handleLine(): void {}

  async start(): Promise<void> {
    await this.commandHandler?.('status', 'cli', 'local', []);
  }

  async stop(): Promise<void> {}

  async send(): Promise<void> {}
}

class MockSilentChannel {
  readonly canPushMessages = false;

  constructor(public readonly name: string) {}

  async start(): Promise<void> {}

  async stop(): Promise<void> {}

  async send(): Promise<void> {}
}

class MockOrchestrator {
  start = vi.fn();
  stop = vi.fn();
  cancelTask = vi.fn();
  archiveCompletedTasks = vi.fn();

  constructor(
    public readonly config: Record<string, unknown>,
    public readonly db: Record<string, unknown>,
    public readonly channels: Map<string, unknown>,
  ) {}
}

vi.mock('../../src/workspace/config.js', () => ({
  configExists: vi.fn(() => true),
  loadConfig: vi.fn(() => ({
    channels: [],
    repos: [],
    skills: [],
    maxConcurrency: 5,
    contextMessagesCount: 10,
    cleanupIntervalDays: 7,
    persistence: { enabled: false, repo: '', backupIntervalDays: 1 },
    web: { setupEnabled: false },
    models: { orchestrator: 'gpt-4.1', task: 'gpt-4.1' },
    workspacePath: '',
  })),
  getDbPath: vi.fn(() => '/tmp/cawpilot-test.sqlite'),
  getAttachmentsPath: vi.fn(() => '/tmp/cawpilot-attachments'),
}));

vi.mock('../../src/db/client.js', () => ({
  getDb: vi.fn(() => ({ mockDb: true })),
  closeDb: vi.fn(),
}));

vi.mock('../../src/db/messages.js', () => ({
  createMessage: vi.fn(),
}));

vi.mock('../../src/workspace/manager.js', () => ({
  ensureWorkspace: vi.fn(),
  cloneRepo: vi.fn(),
}));

vi.mock('../../src/agent/runtime.js', () => ({
  startRuntime: startRuntimeMock,
  stopRuntime: stopRuntimeMock,
}));

vi.mock('../../src/agent/orchestrator.js', () => ({
  Orchestrator: MockOrchestrator,
}));

vi.mock('../../src/channels/cli.js', () => ({
  CliChannel: MockCliChannel,
}));

vi.mock('../../src/channels/http.js', () => ({
  HttpChannel: class extends MockSilentChannel {
    constructor() {
      super('http');
    }

    setAttachmentsDir(): void {}
  },
}));

vi.mock('../../src/channels/telegram.js', () => ({
  TelegramChannel: class extends MockSilentChannel {
    constructor() {
      super('telegram');
    }

    setAttachmentsDir(): void {}
    setCommandHandler(): void {}
  },
}));

vi.mock('../../src/workspace/env.js', () => ({
  loadEnvFile: vi.fn(),
}));

vi.mock('../../src/commands/handler.js', () => ({
  handleCommand: handleCommandMock,
}));

describe('cli/start', () => {
  let initialSigintListeners: Function[];
  let initialSigtermListeners: Function[];

  beforeEach(() => {
    handleCommandMock.mockReset();
    startRuntimeMock.mockReset();
    stopRuntimeMock.mockReset();
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

    vi.clearAllMocks();
  });

  it('wires an initialized orchestrator into early command handling', async () => {
    const { runStart } = await import('../../src/cli/start.js');

    await runStart('/tmp/workspace', { debug: true });

    expect(startRuntimeMock).toHaveBeenCalledOnce();
    expect(handleCommandMock).toHaveBeenCalledOnce();
    const commandContext = handleCommandMock.mock.calls[0][4] as {
      orchestrator?: MockOrchestrator;
    };
    expect(commandContext.orchestrator).toBeInstanceOf(MockOrchestrator);
    expect(commandContext.orchestrator?.start).toHaveBeenCalledOnce();
  });
});