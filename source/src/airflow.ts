// import * as path from 'path';
import * as s3 from '@aws-cdk/aws-s3';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as cdk from '@aws-cdk/core';
import * as ecs from '@aws-cdk/aws-ecs';
// import * as assets from '@aws-cdk/aws-ecr-assets';
import * as rds from '@aws-cdk/aws-rds';

export interface AirflowProps{
  readonly bucketName?: string;
  readonly vpcName?: string;
}

export class Airflow extends cdk.Construct {

  constructor(scope: cdk.Construct, id:string, props: AirflowProps= {}) {
    super(scope, id);

    const airflowBucket = this._getAirflowBucket(props);
    console.log(airflowBucket.bucketName);

    const vpc= this._getAirflowVPC(props);
    console.log(vpc.availabilityZones);

    const airflowDB = this._getAirflowDB(props);
    console.log(airflowDB.instanceArn);

    this._getAirflowECSCluster(props);

  }
  private _getAirflowDB(props: AirflowProps): rds.IDatabaseInstance {
    
    throw new Error('Method not implemented.');
  }

  /**
   * Create a S3 bucket for airflow to synch the DAG.
   * If the bucket name is provided in the props, it will use
   * @param props
   * @returns
   */
  private _getAirflowBucket(props: AirflowProps): s3.IBucket {
    const bucketName = props.bucketName ?? `airflow-bucket-${Math.floor(Math.random() * 1000001)}`;
    const airflowBucket = new s3.Bucket(this, 'AirflowBucket', {
      bucketName,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true,
      }),
      autoDeleteObjects: true,
    });
    return airflowBucket;
  }

  /**
   * Get the VPC for airflow.
   * This endpoints will be created for following services:
   *   - S3
   *   - ECS
   *   - CloudWatch
   *   - Secrets Manager
   * @param props 
   * @returns 
   */
  private _getAirflowVPC(props: AirflowProps): ec2.IVpc {
    const vpcName = props.vpcName ?? 'airflow-vpc';
    const airflowVPC = new ec2.Vpc(this, vpcName, {
      cidr: '10.0.0.0/16',
      enableDnsHostnames: true,
      enableDnsSupport: true,
      maxAzs: 2,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'airflow-public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'airflow-isolated',
          subnetType: ec2.SubnetType.ISOLATED,
        }
     ]
    });

    //TagSubnets
    airflowVPC.publicSubnets.forEach(subnet => {
      cdk.Tags.of(subnet).add('Name', `public-subnet-${subnet.availabilityZone}-airflow`);
    });
    airflowVPC.isolatedSubnets.forEach(subnet => {
      cdk.Tags.of(subnet).add('Name', `isolated-subnet-${subnet.availabilityZone}-airflow`);
    })

    this._createVPCEndpoints(airflowVPC);
    return airflowVPC;
  }

  private _createVPCEndpoints(vpc: ec2.IVpc) {
    vpc.addGatewayEndpoint('s3-endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets:[
        { subnetType: ec2.SubnetType.ISOLATED }
      ],
    });

    const vpcendpointSG= new ec2.SecurityGroup(this, 'vpcendpoint-sg', {
      vpc,
      securityGroupName: 'vpcendpoint-sg',
    });
    vpcendpointSG.connections.allowFrom(ec2.Peer.ipv4('10.0.0.0/16'), ec2.Port.tcp(443), 'vpc endpoint security group');

    vpc.addInterfaceEndpoint('ecs-endpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.ECS,
      privateDnsEnabled: true,
      securityGroups: [vpcendpointSG],
    });
    
    vpc.addInterfaceEndpoint('cloudwatchlogs-endpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      privateDnsEnabled: true,
      securityGroups: [vpcendpointSG],
    });

    vpc.addInterfaceEndpoint('secrets-manager-endpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      privateDnsEnabled: true,
      securityGroups: [vpcendpointSG],
    })
  }

  /**
   * Create the Ariflow ECS Cluster
   * @param props 
   * @returns 
   */
  private _getAirflowECSCluster(props: AirflowProps): ecs.Cluster {
    console.log(props);
    const airflowCluster = new ecs.Cluster(this, 'airflow-ecs-cluster', {

    });
    return airflowCluster;
  }

  // private _createAirflowWebService() {
  //   new assets.DockerImageAsset(this, 'airflow-webserver', {
  //     directory: path.join(__dirname, '/../docker-images/airflow-webserver'),
  //   });
  // }
}