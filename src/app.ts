import { webSearchSchema } from 'src/web-search/web-search-tools.schema';
import { ReminderService } from 'src/reminders/reminder.service';
import { createReminderTools } from 'src/reminders/reminder-tools';
import { barbershopSystemPrompt } from 'src/prompts/barbershop-prompts';
import { renderChatPage } from 'src/ui/chat-page';
import Anthropic from '@anthropic-ai/sdk';
import Fastify from 'fastify';
import { loadConfig, type Config } from 'src/config';
import { ANTHROPIC_MAX_RETRIES, ANTHROPIC_TIMEOUT_MS } from 'src/llm/constants';
import { LlmService } from 'src/llm/llm.service';
import { createTimeTools } from 'src/time/time-tools';
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
  const reminderService = new ReminderService((reminder) => {
    app.log.info({ reminder }, 'Reminder due');
  });

  app.addHook('onClose', async () => reminderService.close());
  const llm = new LlmService(
    anthropic,
    config.anthropicModel,
    app.log,
    [...createTimeTools(timeService), ...createReminderTools(reminderService)],
    [webSearchSchema],
  );
  const prefix = `/${config.apiPrefix}`;

  app.get('/', async (_request, reply) => {
    return reply
      .type('text/html; charset=utf-8')
      .send(renderChatPage(config.apiPrefix));
  });

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
        return await llm.generate(request.body.prompt, barbershopSystemPrompt);
      } catch (err) {
        app.log.error(err, 'Anthropic request failed');

        return reply.code(502).send({ detail: 'Anthropic request failed' });
      }
    },
  );
  return app;
}
