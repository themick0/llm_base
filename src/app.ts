import Anthropic from '@anthropic-ai/sdk';
import Fastify from 'fastify';
import { loadConfig, type Config } from 'src/config';
import { ANTHROPIC_MAX_RETRIES, ANTHROPIC_TIMEOUT_MS } from 'src/llm/constants';
import { LlmService } from 'src/llm/llm.service';
import {
  addDurationToDatetimeTool,
  getCurrentTimeTool,
} from 'src/time/anthropic.time.schema';
import { TimeService } from 'src/time/time.service';

export function createApp(config: Config = loadConfig(), client?: Anthropic) {
  const app = Fastify({
    logger: config.nodeEnv !== 'test',
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
  });

  let anthropic = client;
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: config.anthropicApiKey,
      timeout: ANTHROPIC_TIMEOUT_MS,
      maxRetries: ANTHROPIC_MAX_RETRIES,
    });
  }
  const timeService = new TimeService();
  const llm = new LlmService(
    anthropic,
    config.anthropicModel,
    app.log,
    timeService,
    [getCurrentTimeTool, addDurationToDatetimeTool],
  );
  const prefix = `/${config.apiPrefix}`;

  app.get(`${prefix}/health`, async () => ({ status: 'ok' }));
  app.post<{ Body: { prompt: string } }>(
    `${prefix}/llm/generate`,
    {
      schema: {
        body: {
          type: 'object',
          required: ['prompt'],
          additionalProperties: false,
          properties: {
            prompt: {
              type: 'string',
              minLength: 1,
              maxLength: 10_000,
              pattern: '\\S',
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        return await llm.generate(request.body.prompt);
      } catch (err) {
        app.log.error(err, 'Anthropic request failed');

        return reply.code(502).send({ detail: 'Anthropic request failed' });
      }
    },
  );
  return app;
}
