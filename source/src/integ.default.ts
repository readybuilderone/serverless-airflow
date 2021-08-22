import * as ec2 from '@aws-cdk/aws-ec2';
import * as cdk from '@aws-cdk/core';
import * as foo from './index';

export class IntegTesting {
  readonly stack: cdk.Stack[];

  constructor() {
    const app = new cdk.App();
    const env = {
      region: process.env.CDK_DEFAULT_REGION,
      account: process.env.CDK_DEFAULT_ACCOUNT,
    };
    const stack = new cdk.Stack(app, 'foo-stack', {
      env,
    });

    const vpc = ec2.Vpc.fromLookup(stack, 'Vpc', { isDefault: true });

    const svc = new foo.Foo(stack, 'FooSvc', { vpc });

    new cdk.CfnOutput(stack, 'EndpointURL', {
      value: svc.endpoint,
    });
    this.stack = [stack];
  };
}

// run the integ testing
new IntegTesting();