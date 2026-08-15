import { serve } from '@hono/node-server';
import { buildApp } from './app';
import { loadEnv } from './env';

const env = loadEnv();
const app = buildApp({ env });

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.info(`Travel API listening on http://localhost:${info.port} (${env.NODE_ENV})`);
});
