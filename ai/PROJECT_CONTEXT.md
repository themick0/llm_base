# Project context

## Purpose

This is a training project for learning how LLM models and their APIs work.
The primary goal is to understand the mechanisms behind model integration,
requests, responses, and different LLM capabilities through practical experiments.

Prioritize understanding, readable code, and explicit behavior. Keep examples
small enough to inspect and modify. Introduce abstractions when they help explain
or implement a concrete feature; avoid unnecessary production infrastructure.

## Learning topics

- Connecting to model providers and authenticating API requests.
- Understanding messages, roles, system prompts, and conversation history.
- Exploring streaming, model parameters, response structures, and token usage.
- Experimenting with capabilities such as tool use and structured outputs.
- Understanding errors, timeouts, retries, and the lifecycle of API clients.

These topics describe learning interests, not a requirement to implement them all.

## Current implementation

- TypeScript and Fastify on Node.js 22 or newer.
- pnpm for dependencies and scripts; ESLint and Prettier for code quality.
- Configuration from `.env`, with process environment variables taking precedence.
- Anthropic SDK with one explicitly created client per application instance.
- `GET /` serves a dependency-free test chat UI from `src/ui/chat-page.ts`.
  It uses the configured API prefix; its visible history is local to the page.
- `GET /api/health` and `POST /api/llm/generate`; the prefix is configurable.
- Streaming text logged to the console, followed by a complete HTTP response.
- Conversation history is stored in memory per service instance.
- Full assistant content blocks are preserved in history after a successful turn.
  `requestMessage()` returns the SDK message; `textFromMessage()` extracts text for the API response.
- The assistant can call the strict `getCurrentTime` and `addDurationToDatetime` tools, executed by `TimeService`.
  Duration arithmetic accepts an ISO 8601 datetime with a timezone and a duration in minutes.
  Tool arguments use camelCase (`datetime`, `durationMinutes`).
  Tool results contain UTC timestamps; the Grander has no time tool.
- The chat registers `setReminder` with `message` and `remindAt` arguments.
  `ReminderService` schedules in-memory timers and emits `Reminder due` server logs;
  shutdown cancels timers and restart loses reminders. There is no browser or
  external notification delivery.
- `barbershopSystemPrompt` is the single assistant prompt used by chat and evaluation.
  It covers bookings, time tools, reminders, and general questions via Wikipedia.
  The separate Grander prompt evaluates answers against this expanded scope.
- `LlmService` accepts tool definitions (`schema` and `execute`) without depending
  on concrete tool services. Handlers validate their own inputs and may be sync
  or async. Calls execute sequentially; handler failures become tool errors.
  Domain modules use `*-tools.schema.ts`, `*-tools.ts`, and `*.service.ts`.
  `createTool` derives Anthropic schemas from strict Zod inputs and validates
  arguments before dispatching to typed handlers. `createTimeTools` and
  `createReminderTools` return arrays using this shared helper.
- Chat and evaluation register Anthropic web search restricted to `wikipedia.org`
  and its subdomains. Server tool schemas are passed separately from local handlers.
  `pause_turn` responses resume within the tool-round limit. Web citation URLs are
  included in returned text; full citation blocks remain in conversation history.
- Assistant responses are plain text to support search citations; the Grander
  retains an explicit structured output schema. Evaluation does not register reminders.
- `LlmService` uses the Anthropic SDK client type directly; tests mock its streaming method.
- Model requests are processed sequentially.
- `PromptEvaluator` encapsulates dataset loading, generation, Grander evaluation,
  validation, and checkpoint saving; `pnpm evaluate` calls its `run()` method.
- Evaluation uses separate system prompts,
  isolated service instances, structured numeric scores, and per-task file checkpoints.
- Tests use a fake provider and do not make paid API requests.
- The `src/*` import alias works during development and after compilation.

## AI workspace

The `ai/` directory is the home for project rules, skills, roles, and temporary
development artifacts such as plans and reviews. Only `rules/` is needed initially;
create other directories when there is actual content to store.

Keep durable project context here and reusable instructions in `rules/`.
Temporary plans and reviews must not become permanent requirements unless the
user adopts them. Never put API keys, credentials, or private environment values
in AI workspace documents.

Update this context when the stack, behavior, or learning goals change.
