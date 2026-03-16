export interface IncomingMessage {
  from: string;
  text: string;
  timestamp: number;
  platform: 'signal' | 'whatsapp' | 'telegram';
}
