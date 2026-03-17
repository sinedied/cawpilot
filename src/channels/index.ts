/**
 * Channel interface — the plugin contract for communication channels.
 *
 * A channel provides bidirectional messaging between CawPilot and a user
 * via an external platform (Telegram, Signal, etc.).
 *
 * To create a custom channel, implement this interface and register it
 * with `registerChannel()` before calling `createChannel()`.
 */
export interface Channel {
  /** Start listening for incoming messages. */
  start(onMessage: (message: IncomingMessage) => Promise<void>): Promise<void>;
  /** Send a text message to the given recipient. */
  send(to: string, text: string): Promise<void>;
  /** Gracefully stop the channel. */
  stop(): Promise<void>;
}

export interface IncomingMessage {
  /** Sender identifier (platform-specific). */
  from: string;
  /** Message text content. */
  text: string;
  /** Timestamp in milliseconds. */
  timestamp: number;
  /** Channel name that received the message. */
  channel: string;
}

/**
 * Channel factory function.
 * Receives the channel-specific config object and returns a Channel instance.
 */
export type ChannelFactory = (config: Record<string, unknown>) => Channel;

const channelRegistry = new Map<string, ChannelFactory>();

/**
 * Register a channel plugin.
 * Call this before `createChannel()` to make custom channels available.
 *
 * @example
 * ```ts
 * registerChannel('discord', (config) => new DiscordChannel(config));
 * ```
 */
export function registerChannel(name: string, factory: ChannelFactory): void {
  channelRegistry.set(name, factory);
}

/**
 * Create a channel instance from config.
 * Looks up the channel name in the registry and calls its factory.
 */
export function createChannel(name: string, config: Record<string, unknown>): Channel {
  const factory = channelRegistry.get(name);
  if (!factory) {
    const available = [...channelRegistry.keys()].join(', ') || 'none';
    throw new Error(
      `Unknown channel "${name}". Available channels: ${available}.\n` +
      'Use registerChannel() to add custom channels.',
    );
  }
  return factory(config);
}
