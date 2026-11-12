# Fastify LLM boilerplate

TypeScript + Fastify, Node.js 22+, pnpm 10.20.0. Configuration from `.env`, with ESLint and Prettier.

## Getting started

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
# Set ANTHROPIC_API_KEY in .env
pnpm dev
```

Keep your existing `.env` if it is already configured. Process environment variables take precedence over `.env`.

| Variable                  | Default            | Purpose                                         |
| ------------------------- | ------------------ | ----------------------------------------------- |
| `NODE_ENV`                | `development`      | development, test, or production                |
| `PORT`                    | `3000`             | HTTP server port                                |
| `API_PREFIX`              | `api`              | Route prefix                                    |
| `ANTHROPIC_API_KEY`       | —                  | Required Anthropic API key                      |
| `ANTHROPIC_MODEL`         | `claude-haiku-5-5` | Model ID available to your account              |
| `ANTHROPIC_GRANDER_MODEL` | `ANTHROPIC_MODEL`  | Model used by the Grander for prompt evaluation |

The client is explicitly created once per application instance. The application requires an API key to start. Static parameters are defined in `src/llm/constants.ts`. All system prompts are grouped in `src/prompts/`: the assistant prompt in `barbershop-prompts.ts` and the evaluation prompt in `grander-prompt.ts`. The `src/*` import alias works during development and after compilation.

## Test chat

Run `pnpm dev` and open `http://localhost:3000` (or your configured port).
The page includes message history, suggested prompts, a loading indicator, and
retryable errors. Enter sends a message; Shift + Enter inserts a newline.
It uses the configured API prefix and displays plain-text answers with source URLs.
The chat and evaluator share `barbershopSystemPrompt`.

The visible history lasts until reload. Server history is shared by all clients
and survives page reloads; restart the server to begin an independent scenario.

## Routes

```bash
curl http://localhost:3000/api/health
# {"status":"ok"}

curl -X POST http://localhost:3000/api/llm/generate \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Hello!"}'
```

The LLM route returns `{"response": "..."}` containing the generated text. Assistant replies use plain text so web search citations can be returned. The Grander still uses structured JSON output. Requests end with the current user message and do not use assistant prefill. Streaming text is logged to the console; the HTTP response is sent after generation completes.

`prompt` must be a nonempty string of up to 10,000 characters containing at least one non-whitespace character. Additional fields are rejected. Validation errors return Fastify's standard **400** status; Anthropic errors return **502** without provider details.

Conversation history is shared across requests, stored in memory, and cleared on restart. Run a single process to maintain one history. Model requests are processed sequentially; failed requests are not saved to history.

## Commands

```bash
pnpm dev
pnpm build
pnpm start
pnpm typecheck
pnpm lint
pnpm lint:fix
pnpm format
pnpm format:check
pnpm test
```

Tests use `fastify.inject()` and a fake Anthropic client, without paid API requests.

## Generate and score a dataset

```bash
pnpm evaluate
# Optional input and output paths:
pnpm evaluate datasets/aws-prompt-evaluation.json datasets/my-evaluation.json
```

The script creates `PromptEvaluator` from `src/evaluation/PromptEvaluator.ts` and calls
its `run()` method. The class handles dataset loading, generation, Grander evaluation,
validation, and checkpoint saving. It calls `LlmService.generate` directly; no HTTP
server is required.
Each task first uses the barbershop system prompt, then a separate Grander system
prompt containing the ten evaluation criteria in `src/prompts/grander-prompt.ts`.
The Grander receives the original system prompt, task, and response as data.
Its structured output is validated as `strengths` and `weaknesses` arrays with 1–3 nonempty items each, a nonempty `reasoning` string, and a numeric `score` from 1 to 10.

Results are written to `datasets/aws-prompt-evaluation-auto-scored.json` as
`[{ "task": "...", "response": "...", "strengths": ["..."], "weaknesses": ["..."], "reasoning": "...", "score": 9 }]`. The assistant's text is saved in `response`. Fresh service instances isolate every task and Grander;
the underlying Anthropic client is reused. Results are saved atomically after
each completed task. A new run replaces the selected output file. On failure,
the script stops with a nonzero exit code and retains completed results.

This runs paid API requests: at least two per task, with additional requests for tool calls or paused search turns. Web search also incurs provider search charges.
The assistant uses `ANTHROPIC_MODEL`. The Grander uses `ANTHROPIC_GRANDER_MODEL`,
falling back to `ANTHROPIC_MODEL` when the variable is not set.
Model-generated scores are estimates; this AWS dataset primarily measures scope
adherence under the old barbershop-only scope. Its earlier scores are not directly comparable after enabling Wikipedia questions.

### Average evaluation score

```bash
pnpm evaluate:average
pnpm evaluate:average datasets/aws-prompt-evaluation-scored.json
```

By default, the script reads `datasets/aws-prompt-evaluation-auto-scored.json`.
It prints the file path, result count, and arithmetic mean as JSON. Zero scores
are included. Empty arrays and missing, nonnumeric, or out-of-range scores cause
a nonzero exit instead of silently skipping records.

## Time tools

`src/time/time-tools.schema.ts` defines `getCurrentTimeSchema` with a strict Zod
input schema. `createTimeTools` builds the Anthropic tool with `strict: true`. Its input is an empty
object. `TimeService.getCurrentTime()` returns the server time as an ISO 8601 UTC
string.

`src/time/time-tools.schema.ts` also defines `addDurationToDatetimeSchema`.
Its tool name is `addDurationToDatetime`; arguments are `datetime` (ISO 8601 with
an explicit timezone) and `durationMinutes` (a finite number). The result is UTC;
negative durations subtract elapsed time.

`createTimeTools(timeService)` registers both tools. `LlmService` accepts a list
of `ToolDefinition` objects as its fourth constructor argument. Each definition
pairs an Anthropic `schema` with an `execute(input: unknown)` handler. Handlers
validate their own arguments and return text or Anthropic tool-result content
blocks, either directly or through a promise. Serialize JSON results to text.
To add a tool, pass another definition; no changes to `LlmService` are needed.
Duplicate names are rejected. Only registered tools can execute.

When Anthropic returns `tool_use`, `LlmService` finds each handler by name,
awaits calls sequentially, and sends a `tool_result` with the matching
`tool_use_id`, and requests the final response. The complete tool exchange is
saved to history only after the turn succeeds. Unknown tools and invalid arguments
produce error tool results, as do thrown errors and rejected handler promises. Tool rounds are limited by `MAX_TOOL_ROUNDS`.

The Grander does not receive the time tool. The tool gives UTC time, not the
barbershop local timezone or appointment availability.

### Assistant system prompt

`src/prompts/barbershop-prompts.ts` exports one `barbershopSystemPrompt` for chat
and evaluation. It covers barbershop facts, booking preparation, both time tools,
console reminders, and general factual questions researched through Wikipedia.
It does not redirect general knowledge questions to booking.

### Wikipedia search

Chat and evaluation pass `webSearchSchema` as a server tool to `LlmService`.
Anthropic executes `web_search`; there is no local execute handler. Search is
restricted to `wikipedia.org`, including language subdomains. Paused server turns
are resumed within the same round limit as local tools. Source URLs from citations
are appended to response text and displayed in the chat.

Try: "What is the history of barbershops? Find sources on Wikipedia."
Web search must be enabled for the Anthropic organization. The assistant reports
search failures instead of claiming that unverified information was researched.

## Reminder tool

The chat registers `setReminder` through `createReminderTools`. Its arguments are
`message` (1–1000 non-whitespace characters) and `remindAt` (a future ISO 8601
datetime with a timezone). The result includes an ID, UTC time, and delivery
limitations. For example, ask: "Remind me in one minute to call the barbershop."

Reminders emit a `Reminder due` server log at the requested time. There is no
browser, SMS, email, or push delivery. They are stored in memory, disappear on
restart (including development watch reloads), and are cancelled on application
shutdown. Keep the server running to observe delivery. Times longer than Node's
maximum timer delay are scheduled in chunks.

Chat and evaluation use the same prompt. Evaluation has time and search tools,
but does not register or schedule reminders. `LlmService` remains independent of the reminder implementation.

## Tool module layout

Tool modules follow the same structure:

| Responsibility | Time | Reminders |
| --- | --- | --- |
| Names, descriptions, Zod input schemas | `time/time-tools.schema.ts` | `reminders/reminder-tools.schema.ts` |
| Tool factories | `time/time-tools.ts` | `reminders/reminder-tools.ts` |
| Domain behavior and state | `time/time.service.ts` | `reminders/reminder.service.ts` |

Paths are relative to `src/`. Each factory returns a `ToolDefinition[]` and uses
`src/llm/create-tool.ts`. This shared helper derives the Anthropic schema through
`zodOutputFormat`, validates input using the same Zod schema, and passes typed
arguments to the handler. Unsupported provider constraints remain enforced
locally. Add new tools using this layout; no handwritten JSON Schema is needed.
