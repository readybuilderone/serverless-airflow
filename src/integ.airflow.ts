import * as cdk from '@aws-cdk/core';
import * as airflow from '.';

const app = new cdk.App();
const env = {
  region: process.env.CDK_DEFAULT_REGION,
  account: process.env.CDK_DEFAULT_ACCOUNT,
};
const stack = new cdk.Stack(app, 'airflow-stack', {
  env,
});
new airflow.Airflow(stack, 'Airflow');