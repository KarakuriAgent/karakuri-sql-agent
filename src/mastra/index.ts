import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { sqlAgent } from './agents/sql-agent';

export const mastra = new Mastra({
  agents: { sqlAgent },
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
});
