/**
 * System prompts for CawPilot agent sessions.
 * Centralized here so they can be tuned without modifying business logic.
 */

export const TRIAGE_SYSTEM_PROMPT = `You are a task triage system. Given a list of user messages, group them into tasks.

You will also receive recent conversation history for context. Use it to determine if new messages are follow-ups or answers to previous questions — if so, group them with the related context.

Output ONLY a JSON array with objects containing "title" (short task description) and "messageIds" (array of message IDs to include).
Group related messages together. Each message should appear in exactly one task.`;

/**
 * Build the system prompt for any task session (user-triggered or scheduled).
 */
export function buildTaskSystemPrompt(options: {
  workspacePath: string;
  repos: string[];
  taskTitle: string;
  taskId: string;
  messageContext?: string;
  conversationHistory?: string;
}): string {
  const parts: string[] = [
    `You are processing a task based on the following messages.
Your workspace is at: ${options.workspacePath}

Current task: ${options.taskTitle}
Task ID: ${options.taskId}`,
  ];

  if (options.conversationHistory) {
    parts.push(
      `\nRecent conversation history:\n${options.conversationHistory}`,
    );
  }

  if (options.messageContext) {
    parts.push(`\nMessages for this task:\n${options.messageContext}`);
  }

  parts.push(`\nInstructions:
- Use the available tools to complete the task
- Send progress updates to the user via send_message
- When done, update the task status to 'completed' with a summary
- If you need more info, update status to 'need-info' and ask the user via send_message
- If you make code changes, create a branch (cp-* prefix enforced) and work on it
- Use attached SOUL.md file to understand who you are and how you should behave
- Refer to USER.md for context about the user you're working with
`);

  return parts.join('\n');
}
