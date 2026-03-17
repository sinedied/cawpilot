export interface ChannelMessage {
  channel: string;
  sender: string;
  content: string;
  attachments?: string[];
}

export type MessageHandler = (message: ChannelMessage) => void | Promise<void>;

export interface Channel {
  readonly name: string;
  start(onMessage: MessageHandler): Promise<void>;
  stop(): Promise<void>;
  send(sender: string, content: string): Promise<void>;
}
