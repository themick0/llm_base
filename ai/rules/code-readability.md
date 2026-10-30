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
