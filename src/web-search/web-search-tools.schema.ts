import type { WebSearchTool20250305 } from '@anthropic-ai/sdk/resources/messages';

export const webSearchSchema = {
  type: 'web_search_20250305',
  name: 'web_search',
  allowed_domains: ['wikipedia.org'],
} satisfies WebSearchTool20250305;
