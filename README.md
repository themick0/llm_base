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

| Variable            | Default            | Purpose                            |
| ------------------- | ------------------ | ---------------------------------- |
| `NODE_ENV`          | `development`      | development, test, or production   |
| `PORT`              | `3000`             | HTTP server port                   |
| `API_PREFIX`        | `api`              | Route prefix                       |
| `ANTHROPIC_API_KEY` | —                  | Required Anthropic API key         |
| `ANTHROPIC_MODEL`   | `claude-haiku-5-5` | Model ID available to your account |

The client is explicitly created once per application instance. The application requires an API key to start. Static parameters and the system prompt are defined in `src/llm/constants.ts`. The `src/*` import alias works during development and after compilation.

## Routes

```bash
curl http://localhost:3000/api/health
# {"status":"ok"}

curl -X POST http://localhost:3000/api/llm/generate \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Hello!"}'
```

The LLM route returns `{"response": "..."}` containing the generated text. The system prompt requests JSON without Markdown code fences; this is an instruction, not schema validation or a guarantee of valid JSON. Requests end with the current user message and do not use assistant prefill. Streaming text is logged to the console; the HTTP response is sent after generation completes.

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

The script calls `LlmService.generate` directly; no HTTP server is required.
Each task first uses the barbershop system prompt, then a separate judge system
prompt containing the ten evaluation criteria in `src/evaluation/judge-prompt.ts`.
The judge receives the original system prompt, task, and response as data.
Its structured output is validated as a numeric score from 0 to 10.

Results are written to `datasets/aws-prompt-evaluation-auto-scored.json` as
`[{ "task": "...", "response": "...", "score": 9 }]`. The assistant's `agentText`
is extracted into `response`. Fresh service instances isolate every task and judge;
the underlying Anthropic client is reused. Results are saved atomically after
each completed task. A new run replaces the selected output file. On failure,
the script stops with a nonzero exit code and retains completed results.

This runs real API requests: two per task, or 100 requests for the 50-task dataset.
The same model from `ANTHROPIC_MODEL` is used for generation and grading.
Model-generated scores are estimates; this AWS dataset primarily measures scope
adherence rather than the complete booking workflow.
