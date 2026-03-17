import { describe, it, expect } from 'vitest';
import { HttpChannel } from '../../src/channels/http.js';

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
    const server = (http as unknown as { server: { address: () => { port: number } } }).server;
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

    const server = (http as unknown as { server: { address: () => { port: number } } }).server;
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
    await http.start((msg) => { received = msg; });

    const server = (http as unknown as { server: { address: () => { port: number } } }).server;
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

    const server = (http as unknown as { server: { address: () => { port: number } } }).server;
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

    const server = (http as unknown as { server: { address: () => { port: number } } }).server;
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
});
