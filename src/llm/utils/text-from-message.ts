import type { Message } from '@anthropic-ai/sdk/resources/messages';

export function textFromMessage(message: Message): string {
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}
