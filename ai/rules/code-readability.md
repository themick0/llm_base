# Code readability

Prefer explicit, straightforward code that is easy to follow while learning.
Use descriptive names and keep functions focused on one clear responsibility.

Separate logical steps with a single blank line. In particular, separate variable
declarations and initialization from their subsequent use. Related declarations
can stay together as one group.

```ts
const config = loadConfig();
const app = createApp(config);

await app.listen({ port: config.port, host: '0.0.0.0' });
```

Use blank lines between validation, setup, external calls, response processing,
and the final return when these are distinct steps. Do not add blank lines
between every statement or inside a tightly related declaration group.

Use block statements and readable multiline formatting instead of compressed
one-line conditions or functions. Prefer explicit object construction and clear
initialization over clever shortcuts or hidden lazy initialization.

Keep reusable static parameters in named constants. Read configuration once when
initializing a component when its values do not need to change per request.

Use comments to explain intent or a non-obvious mechanism. Keep formatting
consistent with Prettier and follow the repository's ESLint rules.

## Identifier naming

Use camelCase without underscores for project-defined variables, constants,
functions, methods, properties, tool names, and tool argument names. Keep tool
schemas, runtime validation, service calls, tests, and prompts consistent:
`getCurrentTime`, `addDurationToDatetime`, and `durationMinutes`.
Use PascalCase for classes, types, and interfaces. File names follow the separate
file naming rules.

Preserve identifiers required by external contracts, such as Anthropic's
`input_schema`, `tool_use_id`, and `is_error`, and environment variable names.
Apply this convention to new and renamed identifiers; migrate existing names
when changing the corresponding contract, updating all callers together.

## Tool schemas and execution

Define each tool's arguments once with `z.strictObject` in the domain's
`*-tools.schema.ts`. Include field descriptions there. Export a camelCase
`<toolName>Schema` object with `name`, `description`, and `inputSchema`, checked
with `satisfies ToolSchema<z.ZodObject>`.

Use `createTool` from `src/llm/create-tool.ts` in every domain tool factory.
It derives the provider JSON Schema with the SDK's Zod converter, sets
`strict: true`, validates the input, and passes typed, normalized arguments to
the handler. Do not maintain a second handwritten JSON Schema or put tool
schemas inline in factories. Provider schema conversion can omit unsupported
validation constraints; local Zod validation remains authoritative.

Factories connect validated arguments to service methods and serialize results.
Services own domain checks (such as whether a reminder is in the future), state,
and side effects. Keep provider contracts and unknown-input parsing out of
services. `LlmService` only dispatches registered tools and handles tool results.

For provider-defined tools such as Anthropic web search, export the provider's
configuration from the domain's `*-tools.schema.ts`, checked with the specific
SDK tool type. Preserve required provider names and fields. Do not recreate its
input schema in Zod or use `createTool` for server-executed tools, which have no
local handler.

Register all tools in one `ToolDefinition[]`. Use `execution: 'local'` with a
schema and handler for client-executed tools, or `execution: 'server'` with only
the provider schema for tools executed by Anthropic. `createTool` returns a
`LocalToolDefinition`. Do not introduce separate server-tool arrays or dummy
handlers; the dispatcher must only execute local definitions.
