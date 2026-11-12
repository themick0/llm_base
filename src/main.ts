import { createApp } from 'src/app';
import { loadConfig } from 'src/config';

async function main() {
  const config = loadConfig();
  const app = createApp(config);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void app.close().catch(() => {
        process.exitCode = 1;
      });
    });
  }
  await app.listen({ port: config.port, host: '0.0.0.0' });
}

void main().catch((error: unknown) => {
  const reason = error instanceof Error ? error.message : String(error);

  console.error(`Application startup failed: ${reason}`);
  process.exitCode = 1;
});
