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
    apiRoutes: [sqlExecuteRoute],
  },
});
