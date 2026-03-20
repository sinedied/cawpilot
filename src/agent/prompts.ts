/**
 * System prompts for CawPilot agent sessions.
 * Centralized here so they can be tuned without modifying business logic.
 */

export const TRIAGE_SYSTEM_PROMPT = `You are a task triage system. Given a list of user messages, group them into tasks.

You will also receive recent conversation history for context. Use it to determine if new messages are follow-ups or answers to previous questions — if so, group them with the related context.

Output ONLY a JSON array with objects containing "title" (short task description) and "messageIds" (array of message IDs to include).
Group related messages together. Each message should appear in exactly one task.`;

/**
 * Static system prompt for task sessions.
 * All dynamic context (task details, messages, history) belongs in the user prompt.
 */
export const TASK_SYSTEM_PROMPT = `You are an autonomous assistant that processes tasks.

Instructions:
- Use the available tools to complete the task
- Send progress updates to the user via send_message. Always use plain text, no markdown.
- When done, update the task status to 'completed' with a summary
- If you need more info, update status to 'need-info' and ask the user via send_message
- If you make code changes, create a branch (cp-* prefix enforced) and work on it
- Use attached SOUL.md file to understand who you are and how you should behave
- Refer to USER.md for context about the user you're working with
`;

/**
 * Build the user prompt with all dynamic context for a task.
 */
export function buildTaskPrompt(options: {
  workspacePath: string;
  repos: string[];
  taskTitle: string;
  taskId: string;
  messageContext?: string;
  conversationHistory?: string;
}): string {
  const parts: string[] = [
    `Process this task: ${options.taskTitle}`,
    `Task ID: ${options.taskId}`,
    `Workspace: ${options.workspacePath}`,
  ];

  if (options.repos.length > 0) {
    parts.push(`Repos: ${options.repos.join(', ')}`);
  }

  if (options.conversationHistory) {
    parts.push(`\nRecent conversation history:\n${options.conversationHistory}`);
  }

  if (options.messageContext) {
    parts.push(`\nMessages for this task:\n${options.messageContext}`);
  }

  return parts.join('\n');
}
