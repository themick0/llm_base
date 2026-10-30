import 'dotenv/config';
import { ANTHROPIC_DEFAULT_MODEL } from 'src/llm/constants';

export interface Config {
  port: number;
  apiPrefix: string;
  nodeEnv: 'development' | 'test' | 'production';
  anthropicApiKey: string;
  anthropicModel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  const apiPrefix = env.API_PREFIX ?? 'api';
  if (!/^[a-zA-Z0-9_-]+$/.test(apiPrefix)) {
    throw new Error('API_PREFIX must be a nonempty URL path segment');
  }
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (
    nodeEnv !== 'development' &&
    nodeEnv !== 'test' &&
    nodeEnv !== 'production'
  ) {
    throw new Error('NODE_ENV must be development, test or production');
  }
  const anthropicApiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!anthropicApiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
  const anthropicModel = env.ANTHROPIC_MODEL ?? ANTHROPIC_DEFAULT_MODEL;
  if (!anthropicModel.trim())
    throw new Error('ANTHROPIC_MODEL must not be empty');
  return { port, apiPrefix, nodeEnv, anthropicApiKey, anthropicModel };
}
