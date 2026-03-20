import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { HttpChannel } from '../../src/channels/http.js';
import type { ChannelMessage } from '../../src/channels/types.js';

describe('channels/http', () => {
  it('starts and stops without error', async () => {
    const http = new HttpChannel(0, 'test-key'); // port 0 = random
    const handler = () => {};

    await http.start(handler);
    await http.stop();
  });

  it('responds to health endpoint', async () => {
    const http = new HttpChannel(0, 'test-key');
    await http.start(() => {});

    // Get the actual port from the server
    const server = (
      http as unknown as { server: { address: () => { port: number } } }
    ).server;
    const port = server.address().port;

    const res = await fetch(`http://localhost:${port}/api/health`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');

    await http.stop();
  });

  it('rejects message without API key', async () => {
    const http = new HttpChannel(0, 'test-key');
    await http.start(() => {});

    const server = (
      http as unknown as { server: { address: () => { port: number } } }
    ).server;
    const port = server.address().port;

    const res = await fetch(`http://localhost:${port}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: 'test', content: 'hello' }),
    });

    expect(res.status).toBe(401);

    await http.stop();
  });

  it('accepts message with valid API key', async () => {
    let received: unknown = null;
    const http = new HttpChannel(0, 'test-key');
    await http.start((msg) => {
      received = msg;
    });

    const server = (
      http as unknown as { server: { address: () => { port: number } } }
    ).server;
    const port = server.address().port;

    const res = await fetch(`http://localhost:${port}/api/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': 'test-key',
      },
      body: JSON.stringify({ sender: 'test', content: 'hello' }),
    });

    expect(res.status).toBe(200);
    expect(received).toEqual({
      channel: 'http',
      sender: 'test',
      content: 'hello',
      attachments: undefined,
    });

    await http.stop();
  });

  it('rejects message with wrong API key', async () => {
    const http = new HttpChannel(0, 'test-key');
    await http.start(() => {});

    const server = (
      http as unknown as { server: { address: () => { port: number } } }
    ).server;
    const port = server.address().port;

    const res = await fetch(`http://localhost:${port}/api/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': 'wrong-key',
      },
      body: JSON.stringify({ sender: 'test', content: 'hello' }),
    });

    expect(res.status).toBe(401);

    await http.stop();
  });

  it('rejects message missing required fields', async () => {
    const http = new HttpChannel(0, 'test-key');
    await http.start(() => {});

    const server = (
      http as unknown as { server: { address: () => { port: number } } }
    ).server;
    const port = server.address().port;

    const res = await fetch(`http://localhost:${port}/api/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': 'test-key',
      },
      body: JSON.stringify({ content: 'hello' }), // missing sender
    });

    expect(res.status).toBe(400);

    await http.stop();
  });

  it('saves base64 attachments to disk', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'cawpilot-http-'));
    let received: ChannelMessage | null = null;
    const http = new HttpChannel(0, 'test-key');
    http.setAttachmentsDir(tmpDir);
    await http.start((msg) => {
      received = msg;
    });

    const server = (
      http as unknown as { server: { address: () => { port: number } } }
    ).server;
    const port = server.address().port;

    const imageData = Buffer.from('fake-png-data').toString('base64');
    const res = await fetch(`http://localhost:${port}/api/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': 'test-key',
      },
      body: JSON.stringify({
        sender: 'test',
        content: 'look at this',
        attachments: [{ mimeType: 'image/png', data: imageData }],
      }),
    });

    expect(res.status).toBe(200);
    expect(received).not.toBeNull();
    expect(received!.attachments).toHaveLength(1);

    const att = received!.attachments![0];
    expect(att.type).toBe('image');
    expect(att.mimeType).toBe('image/png');
    expect(existsSync(att.path)).toBe(true);

    await http.stop();
  });

  it('has canPushMessages = false', () => {
    const http = new HttpChannel(0, 'test-key');
    expect(http.canPushMessages).toBe(false);
  });

  it('waitForInput intercepts next message from same sender', async () => {
    let received: ChannelMessage | null = null;
    const http = new HttpChannel(0, 'test-key');
    await http.start((msg) => {
      received = msg;
    });

    const server = (
      http as unknown as { server: { address: () => { port: number } } }
    ).server;
    const port = server.address().port;

    // Start waiting for input from 'bot-user'
    const inputPromise = http.waitForInput('bot-user');

    // Send a message from that sender — should be intercepted
    const res = await fetch(`http://localhost:${port}/api/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': 'test-key',
      },
      body: JSON.stringify({ sender: 'bot-user', content: 'my answer' }),
    });

    expect(res.status).toBe(200);
    const answer = await inputPromise;
    expect(answer).toBe('my answer');
    // Should NOT have been dispatched as a regular message
    expect(received).toBeNull();

    await http.stop();
  });

  it('waitForInput does not intercept messages from other senders', async () => {
    let received: ChannelMessage | null = null;
    const http = new HttpChannel(0, 'test-key');
    await http.start((msg) => {
      received = msg;
    });

    const server = (
      http as unknown as { server: { address: () => { port: number } } }
    ).server;
    const port = server.address().port;

    // Wait for input from 'alice'
    const _inputPromise = http.waitForInput('alice');

    // Send a message from 'bob' — should NOT be intercepted
    const res = await fetch(`http://localhost:${port}/api/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': 'test-key',
      },
      body: JSON.stringify({ sender: 'bob', content: 'hello from bob' }),
    });

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));
    expect(received).toEqual({
      channel: 'http',
      sender: 'bob',
      content: 'hello from bob',
      attachments: undefined,
    });

    await http.stop();
  });
});
