import type { Message } from '@anthropic-ai/sdk/resources/messages';

export function textFromMessage(message: Message): string {
  const blocks = message.content.filter((block) => block.type === 'text');
  const text = blocks.map((block) => block.text).join('\n');
  const sources = new Map<string, string>();

  for (const block of blocks) {
    for (const citation of block.citations ?? []) {
      if (citation.type === 'web_search_result_location') {
        sources.set(citation.url, citation.title ?? citation.url);
      }
    }
  }

  if (sources.size === 0) {
    return text;
  }

  const references = [...sources].map(([url, title]) => `${title}: ${url}`);

  return `${text}\n\n${references.join('\n')}`;
}
