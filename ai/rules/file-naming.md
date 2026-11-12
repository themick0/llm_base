# File naming

Use descriptive English names in lowercase kebab-case for files and directories.
Separate words with hyphens, for example `prompt-evaluator.ts`,
`text-from-message.ts`, `run-evaluation.mjs`, and `aws-prompt-evaluation.json`.
This convention also applies to documentation, such as `project-context.md`.

Use a dot before a role suffix when it helps explain the file's purpose:

- Services: `llm.service.ts`, `time.service.ts`.
- Schemas: `evaluation.schema.ts`, `time-tools.schema.ts`.
- Tests: `app.test.ts`, `time-tool.test.ts`.

Use hyphens between words in the base name; reserve dots for role suffixes and
extensions. Do not add a role suffix to every file. Simple names such as
`app.ts`, `main.ts`, and `config.ts` are appropriate when their purpose is clear.
Prefer names that describe the contents over vague names such as `constants.ts`
when a more specific name would clarify their purpose.

Class names remain PascalCase inside kebab-case files: `PromptEvaluator` belongs
in `prompt-evaluator.ts`.

Preserve standard and tool-defined filenames, including `README.md`, `AGENTS.md`,
`package.json`, `tsconfig.json`, `tsconfig.build.json`, `eslint.config.mjs`, and
`.env.example`.

Apply these rules to new and renamed files. When renaming an existing file,
update all affected imports, scripts, and documentation links.

## Source module structure

Group code under `src/<domain>/` by responsibility. Keep small modules flat;
do not add nested `services/`, `schemas/`, or `tools/` directories for single files.
Use the same layout for every module that exposes LLM tools:

- `<domain>-tools.schema.ts`: tool names, descriptions, and strict Zod input schemas.
- `<domain>-tools.ts`: a `create<Domain>Tools(service)` factory returning a
  `ToolDefinition[]`, even when the module has only one tool.
- `<domain>.service.ts`: domain behavior, state, and lifecycle management.

For example, the reminders module uses `reminder-tools.schema.ts`,
`reminder-tools.ts`, and `reminder.service.ts`. Other modules only need the files
that match their responsibilities; do not create empty layers to match a template.
Shared tool construction belongs in `src/llm/`, not in a concrete domain module.
