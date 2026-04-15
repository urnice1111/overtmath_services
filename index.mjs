import serverlessExpress from '@codegenie/serverless-express';
import app from './app.mjs';

const serverlessHandler = serverlessExpress({ app });

export const handler = async (event, context) => {
  return serverlessHandler(event, context);
};