import * as cdk from '@aws-cdk/core';
import * as airflow from '.';

export class IntegTesting {
  readonly stack: cdk.Stack[];

  constructor() {
    const app = new cdk.App();
    const env = {
      region: process.env.CDK_DEFAULT_REGION,
      account: process.env.CDK_DEFAULT_ACCOUNT,
    };
    const stack = new cdk.Stack(app, 'airflow-stack', {
      env,
    });

    // const vpc = ec2.Vpc.fromLookup(stack, 'Vpc', { isDefault: true });
    new airflow.Airflow(stack, 'Airflow');
    this.stack = [stack];
  };
}

// run the integ testing
new IntegTesting();