import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as cdk from '@aws-cdk/core';
import * as ecsPatterns from '@aws-cdk/aws-ecs-patterns';

export interface FooProps {
  readonly vpc?: ec2.IVpc;
}

export class Foo extends cdk.Construct {
  readonly endpoint: string;
  constructor(scope: cdk.Construct, id: string, props: FooProps ={}){
    super(scope, id);

    const vpc = props.vpc ?? new ec2.Vpc(this, 'Vpc', {
      natGateways:1
    });
    const svc = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'nginx-service',{
      vpc,
      taskImageOptions:{
        image: ecs.ContainerImage.fromRegistry('public.ecr.aws/k5r2e2q2/amazon-ecs-sample:latest'),
      },
      assignPublicIp:true,
    });

    this.endpoint = `http://${svc.loadBalancer.loadBalancerDnsName}`;
  }
}