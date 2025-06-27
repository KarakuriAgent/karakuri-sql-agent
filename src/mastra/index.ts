import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { sqlAgent } from './agents/sql-agent';
import { sqlExecuteRoute } from './api/sql-execute';

export const mastra = new Mastra({
  agents: { sqlAgent },
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  server: {
    host: process.env.HOST || 'localhost',
    port: process.env.MASTRA_PORT
      ? parseInt(process.env.MASTRA_PORT, 10)
      : 4111,
    apiRoutes: [sqlExecuteRoute],
  },
});
