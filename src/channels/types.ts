export type Attachment = {
  type: 'image' | 'audio' | 'file';
  path: string;
  mimeType: string;
};

export type ChannelMessage = {
  channel: string;
  sender: string;
  content: string;
  attachments?: Attachment[];
};

export type MessageHandler = (message: ChannelMessage) => void | Promise<void>;

/**
 * Generic handler for slash commands.
 * @param command - command name without the leading slash (e.g. "pair", "bootstrap")
 * @param channel - originating channel name
 * @param sender - sender ID
 * @param args - remaining arguments after the command name
 */
export type CommandHandler = (
  command: string,
  channel: string,
  sender: string,
  args: string[],
) => void | Promise<void>;

export type Channel = {
  readonly name: string;
  /** Whether this channel can proactively send messages back to the user. */
  readonly canPushMessages: boolean;
  start(onMessage: MessageHandler): Promise<void>;
  stop(): Promise<void>;
  send(
    sender: string,
    content: string,
    attachments?: Attachment[],
  ): Promise<void>;
  /** Set the handler for slash commands (e.g. /pair, /bootstrap). Called before start(). */
  setCommandHandler?(handler: CommandHandler): void;
  /** Wait for the next inbound message from a specific sender when interactive prompts are supported. */
  waitForInput?(sender: string): Promise<string>;
};
