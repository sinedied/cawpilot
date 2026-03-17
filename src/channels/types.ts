export interface ChannelMessage {
  channel: string;
  sender: string;
  content: string;
  attachments?: string[];
}

export type MessageHandler = (message: ChannelMessage) => void | Promise<void>;

/**
 * Handler called when a /pair command is received.
 * - No argument: generate and show a pairing code in the originating channel.
 * - With code: attempt to link the sender using that code.
 */
export type PairCommandHandler = (channel: string, sender: string, code?: string) => void | Promise<void>;

export interface Channel {
  readonly name: string;
  start(onMessage: MessageHandler): Promise<void>;
  stop(): Promise<void>;
  send(sender: string, content: string): Promise<void>;
  /** Set the handler for /pair commands. Called before start(). */
  setPairHandler?(handler: PairCommandHandler): void;
}
