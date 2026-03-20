import { describe, it, expect, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { CliChannel } from '../../src/channels/cli.js';
import type { ChannelMessage } from '../../src/channels/types.js';

function writeLine(stream: PassThrough, text: string): void {
  stream.push(`${text}\n`);
}

describe('channels/cli', () => {
  let cli: CliChannel;
  let input: PassThrough;

  afterEach(async () => {
    await cli?.stop();
  });

  it('has canPushMessages = true', () => {
    input = new PassThrough();
    cli = new CliChannel(input);
    expect(cli.canPushMessages).toBe(true);
  });

  it('dispatches typed lines as messages', async () => {
    input = new PassThrough();
    cli = new CliChannel(input);
    const received: ChannelMessage[] = [];
    await cli.start((msg) => {
      received.push(msg);
    });

    writeLine(input, 'hello world');
    await new Promise((r) => setTimeout(r, 20));

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({
      channel: 'cli',
      sender: 'local',
      content: 'hello world',
    });
  });

  it('waitForInput intercepts the next line', async () => {
    input = new PassThrough();
    cli = new CliChannel(input);
    const received: ChannelMessage[] = [];
    await cli.start((msg) => {
      received.push(msg);
    });

    const inputPromise = cli.waitForInput('local');

    writeLine(input, 'my answer');
    const answer = await inputPromise;

    expect(answer).toBe('my answer');
    expect(received).toHaveLength(0);
  });

  it('resumes normal dispatch after waitForInput resolves', async () => {
    input = new PassThrough();
    cli = new CliChannel(input);
    const received: ChannelMessage[] = [];
    await cli.start((msg) => {
      received.push(msg);
    });

    const inputPromise = cli.waitForInput('local');
    writeLine(input, 'intercepted');
    await inputPromise;

    writeLine(input, 'normal message');
    await new Promise((r) => setTimeout(r, 20));

    expect(received).toHaveLength(1);
    expect(received[0].content).toBe('normal message');
  });
});
