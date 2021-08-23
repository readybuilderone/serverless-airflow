import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as iam from '@aws-cdk/aws-iam';
import * as cdk from '@aws-cdk/core';

export interface AirflowClusterProps {
  readonly vpc?: ec2.IVpc;
  readonly containerInsights?: boolean;
}

export class AirflowCluster extends cdk.Construct {
  readonly taskExecutionRole?: iam.Role;
  readonly taskRole?: iam.Role;

  constructor(scope: cdk.Construct, id: string, props: AirflowClusterProps={}) {
    super(scope, id);

    this.taskExecutionRole = new iam.Role(this, 'AirflowECSTaskExecutionRole', {
      roleName: 'AirflowECSTaskExecutionRole',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')],
    });
    this.taskRole = new iam.Role(this, 'AriflowECSTaskRole', {
      roleName: 'AriflowECSTaskRole',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')],
    });


    new iam.Policy(this, 'AirflowECSOperatorPolicy', {
      statements: [
        new iam.PolicyStatement({
          actions: [
            'ecs:RunTask',
            'logs:GetLogEvents',
            'logs:FilterLogEvents',
            'ecs:DescribeTasks',
          ],
          resources: ['*'],
          effect: iam.Effect.ALLOW,
        }),
        new iam.PolicyStatement({
          actions: ['iam:PassRole'],
          resources: [this.taskExecutionRole.roleArn],
          effect: iam.Effect.ALLOW,
          conditions: {
            StringLike: { 'iam:PassedToService': 'ecs-tasks.amazonaws.com' },
          },
        }),
      ],
      roles: [this.taskRole],
    });
    //TODO, Add More Policies

    //create airflow ecs cluster
    const vpc = props.vpc ?? new ec2.Vpc(this, 'Vpc', {
      natGateways: 1,
    });
    const containerInsights = props.containerInsights?? true;
    const airflowCluster= new ecs.Cluster(this, 'AirflowCluster', {
      vpc,
      containerInsights,
    });

    console.log(airflowCluster.clusterName);
  }
}