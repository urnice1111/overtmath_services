import serverlessExpress from '@codegenie/serverless-express';
import app from './app.js';

const serverlessHandler = serverlessExpress({ app });

export const handler = async (event, context) => {
  return serverlessHandler(event, context);
};