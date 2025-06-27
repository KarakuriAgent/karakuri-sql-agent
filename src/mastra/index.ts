import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { sqlAgent } from './agents/sql-agent';
import { sqlExecuteRoute } from './api/sql-confirm-execute';
import { serverConfig } from '../config/env';

export const mastra = new Mastra({
  agents: { sqlAgent },
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  server: {
    host: serverConfig.host,
    port: serverConfig.mastraPort,
    apiRoutes: [sqlExecuteRoute],
  },
});
