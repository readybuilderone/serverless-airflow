import * as path from 'path';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as assets from '@aws-cdk/aws-ecr-assets';
import * as ecs from '@aws-cdk/aws-ecs';
import * as elasticache from '@aws-cdk/aws-elasticache';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as iam from '@aws-cdk/aws-iam';
import { PolicyStatement } from '@aws-cdk/aws-iam';
import * as logs from '@aws-cdk/aws-logs';
import * as rds from '@aws-cdk/aws-rds';
import * as s3 from '@aws-cdk/aws-s3';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';
import * as cdk from '@aws-cdk/core';

export interface AirflowProps {
  readonly bucketName?: string;
  readonly vpcName?: string;
  readonly dbName?: string;
  readonly redisName?: string;
  readonly ecsclusterName?: string;
  readonly airflowFernetKey?: string;
}

export class Airflow extends cdk.Construct {
  private readonly airflowECSServiceSG: ec2.ISecurityGroup;
  private readonly airflowAlbSG: ec2.ISecurityGroup;
  private readonly vpcendpointSG: ec2.ISecurityGroup;
  private readonly redisSG: ec2.ISecurityGroup;
  private readonly databaseSG: ec2.ISecurityGroup;
  

  constructor(scope: cdk.Construct, id: string, props: AirflowProps = {}) {
    super(scope, id);

    //Create Bucket
    const airflowBucket = this._getAirflowBucket(props);

    //Create VPC
    const vpc = this._getAirflowVPC(props);

    //Initial Security Group Property
    this.airflowECSServiceSG = new ec2.SecurityGroup(this, 'airflow-ecsservice-sg', {
      vpc,
      allowAllOutbound: true,
      securityGroupName: 'airflow-ecsservice-sg',
    });
    this.airflowECSServiceSG.connections.allowFromAnyIpv4(ec2.Port.allTcp());
    
    this.airflowAlbSG = new ec2.SecurityGroup(this, 'airflow-alb-sg', {
      vpc,
      allowAllOutbound: true,
      securityGroupName: 'airflow-alb-sg',
    });
    this.airflowECSServiceSG.connections.allowFrom(this.airflowAlbSG, ec2.Port.tcp(8080));
    this.airflowECSServiceSG.connections.allowFrom(this.airflowAlbSG, ec2.Port.tcp(80));

    this.vpcendpointSG = new ec2.SecurityGroup(this, 'vpcendpoint-sg', {
      vpc,
      securityGroupName: 'vpcendpoint-sg',
    });
    this.vpcendpointSG.connections.allowFrom(ec2.Peer.ipv4('10.0.0.0/16'), ec2.Port.tcp(443), 'vpc endpoint security group');
    this.vpcendpointSG.connections.allowFrom(ec2.Peer.anyIpv4(), ec2.Port.tcpRange(0, 65535), 'vpc endpoint sg 2');
    
    this.redisSG = new ec2.SecurityGroup(this, 'airflow-redis-sg', {
      vpc,
      allowAllOutbound: true,
    });
    this.redisSG.connections.allowFrom(this.airflowECSServiceSG, ec2.Port.tcp(6379), 'Redis SG');

    this.databaseSG = new ec2.SecurityGroup(this, 'airflow-database-sg', {
      vpc,
      allowAllOutbound: true,
    });
    this.databaseSG.connections.allowFrom(this.airflowECSServiceSG, ec2.Port.tcp(5432), 'Database SG');


    //Create VPC Endpoints
    this._createVPCEndpoints(vpc);

    //Create Database
    const airflowDBSecret = this._getAirflowDBSecret();
    const dbName = props.dbName ?? 'airflowdb';
    const airflowDB = this._getAirflowDB(vpc, airflowDBSecret, dbName);

    //Create Redis
    const airflowRedis = this._getAirflowRedis(props, vpc);

    //Create AirflowCluster
    this._getAirflowECSCluster(props, vpc, airflowBucket, airflowDBSecret, airflowDB, dbName, airflowRedis);

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
        },
      ],
    });

    //TagSubnets
    airflowVPC.publicSubnets.forEach(subnet => {
      cdk.Tags.of(subnet).add('Name', `public-subnet-${subnet.availabilityZone}-airflow`);
    });
    airflowVPC.isolatedSubnets.forEach(subnet => {
      cdk.Tags.of(subnet).add('Name', `isolated-subnet-${subnet.availabilityZone}-airflow`);
    });

    
    return airflowVPC;
  }

  /**
   * Create VPC Endpoints
   * @param vpc
   */
  private _createVPCEndpoints(vpc: ec2.IVpc) {
    //Create S3 Gateway VPC Endpoints
    vpc.addGatewayEndpoint('s3-endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [
        { subnetType: ec2.SubnetType.ISOLATED },
      ],
    });

    //Create Interface VPC Endpoints for ECR/ECS/CloudWatch/SecretsManager
    vpc.addInterfaceEndpoint('ecr-endpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.ECR,
      privateDnsEnabled: true,
      securityGroups: [this.vpcendpointSG],
    });
    vpc.addInterfaceEndpoint('ecr-docker-endpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      privateDnsEnabled: true,
      securityGroups: [this.vpcendpointSG],
    });
    vpc.addInterfaceEndpoint('ecs-endpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.ECS,
      privateDnsEnabled: true,
      securityGroups: [this.vpcendpointSG],
    });
    vpc.addInterfaceEndpoint('cloudwatchlogs-endpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      privateDnsEnabled: true,
      securityGroups: [this.vpcendpointSG],
    });
    vpc.addInterfaceEndpoint('secrets-manager-endpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      privateDnsEnabled: true,
      securityGroups: [this.vpcendpointSG],
    });
  }

  private _getAirflowDBSecret(): secretsmanager.Secret {
    const databaseSceret = new secretsmanager.Secret(this, 'airflow-db-credentials', {
      secretName: 'airflow-db-credentials',
      generateSecretString: {
        secretStringTemplate: '{"username":"airfflow"}',
        generateStringKey: 'password',
        passwordLength: 16,
        excludeCharacters: '\"@/',
        excludePunctuation: true,

      },
    });
    return databaseSceret;
  }

  /**
   * Get Database for Airflow
   * @param props
   * @param vpc
   * @returns
   */
  private _getAirflowDB(vpc: ec2.IVpc, databaseSceret: secretsmanager.Secret, dbName: string): rds.IDatabaseInstance {
    const credentials = rds.Credentials.fromSecret(databaseSceret);
    const dbInstance = new rds.DatabaseInstance(this, 'airflow-db', {
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.ISOLATED,
      },
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_9_6_18,
      }),
      credentials,
      instanceIdentifier: 'airflow-db',
      databaseName: dbName,
      port: 5432,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE3,
        ec2.InstanceSize.MICRO,
      ),
      allocatedStorage: 20,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      parameterGroup: rds.ParameterGroup.fromParameterGroupName(this, 'airflow-db-parametergroup', 'default.postgres9.6'),
      deletionProtection: false,
      securityGroups: [this.databaseSG],
    });
    return dbInstance;
  }

  private _getAirflowRedis(props: AirflowProps, vpc: ec2.IVpc): elasticache.CfnCacheCluster {
    const redisName = props.redisName ?? 'airflowredis';
    const redisCluster = new elasticache.CfnCacheCluster(this, 'airflowredis', {
      engine: 'redis',
      cacheNodeType: 'cache.t2.small',
      numCacheNodes: 1,
      port: 6379,
      clusterName: redisName,
      cacheSubnetGroupName: new elasticache.CfnSubnetGroup(this, 'redissubnets', {
        description: 'Airflow Redis isolated subnet group',
        subnetIds: vpc.isolatedSubnets.map((subnet) => subnet.subnetId),
      }).ref,
      vpcSecurityGroupIds: [this.redisSG.securityGroupId],
    });
    return redisCluster;
  }

  /**
   * Create the Ariflow ECS Cluster
   * @param props
   * @returns
   */
  private _getAirflowECSCluster(props: AirflowProps, vpc: ec2.IVpc, bucket: s3.IBucket, databaseSceret: secretsmanager.Secret,
    database: rds.IDatabaseInstance, dbName: string, redis: elasticache.CfnCacheCluster): ecs.Cluster {
    //Create ECS Cluster
    const clusterName = props.ecsclusterName ?? 'AirflowECSCluster';
    const airflowCluster = new ecs.Cluster(this, 'airflow-ecs-cluster', {
      vpc,
      clusterName,
      containerInsights: true,
    });
    //Create Roles
    const executionRole = this._createTaskExecutionRole();
    const taskRole = this._createTaskRole(bucket);

    //Airflow ECS Service SG


    //Create Log Group
    const webserverLogGroup = this._createAirflowLogGroup('airflow-webserver-lg', '/ecs/airflow-webserver');
    const schedulerLogGroup = this._createAirflowLogGroup('airflow-scheduler-lg', '/ecs/airflow-scheduler');
    const workerLogGroup = this._createAirflowLogGroup('airflow-worker-lg', '/ecs/airflow-worker');
    webserverLogGroup.grantWrite(taskRole);
    schedulerLogGroup.grantWrite(taskRole);
    workerLogGroup.grantWrite(taskRole);

    //Create Airflow ECS Service
    this._createAirflowWebserverService(props, executionRole, taskRole, webserverLogGroup, bucket, databaseSceret, database,
      dbName, redis, vpc, airflowCluster);
    this._createAirflowSchedulerService();
    this._createAirflowWorkerService();

    return airflowCluster;
  }

  /**
   * Create log group for Airflow ECS Cluster
   */
  private _createAirflowLogGroup(logGroupId: string, logGroupName: string): logs.LogGroup {
    return new logs.LogGroup(this, logGroupId, {
      logGroupName,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }

  private _createTaskExecutionRole(): iam.Role {
    const executionRole = new iam.Role(this, 'AirflowTaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    executionRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'));
    executionRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));
    return executionRole;
  }

  private _createTaskRole(bucket: s3.IBucket): iam.Role {
    const taskRole = new iam.Role(this, 'AirflowTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    taskRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));
    //S3 Policy
    taskRole.addToPolicy(new PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:ListBucket',
        's3:GetObject',
        's3:GetBucketLocation',
      ],
      resources: [`${bucket.bucketArn}`, `${bucket.bucketArn}/*`],
    }));

    //Secrets Manager
    taskRole.addToPolicy(new PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['secretsmanager:GetSecretValue'],
      resources: ['*'],
    }));

    return taskRole;
  }

  /**
   * Create Airflow Webserver ECS Service
   */
  private _createAirflowWebserverService(props: AirflowProps, executionRole: iam.IRole, taskRole: iam.IRole, webserverLogGroup: logs.ILogGroup,
    bucket: s3.IBucket, databaseSceret: secretsmanager.Secret, database: rds.IDatabaseInstance, dbName: string, redis: elasticache.CfnCacheCluster,
    vpc: ec2.IVpc, airflowCluster: ecs.ICluster) {

    //Create Task Definition
    const fernetKey = props.airflowFernetKey ?? 'gjDz-PXGnhitGbAGkiPziGCGWie9Q-ai3c56FUmNsuY='; //TODO: Update fernetKey
    const webserverTask = new ecs.FargateTaskDefinition(this, 'AriflowWebserverTask', {
      executionRole,
      taskRole,
      cpu: 512,
      memoryLimitMiB: 1024,
      family: 'airflow-webserver',
    });
    webserverTask.addContainer('airflow-webserver-container', {
      // image: ecs.AssetImage.fromDockerImageAsset(this._createECSSampleDockerImage()),
      image: ecs.AssetImage.fromDockerImageAsset(this._createAirflowWebServiceDockerImage()),
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'ecs',
        logGroup: webserverLogGroup,
      }),
      environment: {
        AIRFLOW_FERNET_KEY: fernetKey,
        AIRFLOW_DATABASE_NAME: dbName,
        AIRFLOW_DATABASE_PORT_NUMBER: '5432',
        AIRFLOW_DATABASE_HOST: database.dbInstanceEndpointAddress,
        AIRFLOW_EXECUTOR: 'CeleryExecutor',
        AIRFLOW_WEBSERVER_HOST: 'webserver.airflow',
        AIRFLOW_LOAD_EXAMPLES: 'no',
        AIRFLOW__SCHEDULER__DAG_DIR_LIST_INTERVAL: '30',
        REDIS_HOST: redis.attrRedisEndpointAddress,
        BUCKET_NAME: bucket.bucketName,
      },
      secrets: {
        AIRFLOW_DATABASE_USERNAME: ecs.Secret.fromSecretsManager(databaseSceret, 'username'),
        AIRFLOW_DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(databaseSceret, 'password'),
      },
      portMappings: [{ containerPort: 8080 }], //Change to 8080
    });

    //Create AirflowWebServerService
    const airflowWebserverService = new ecs.FargateService(this, 'AirflowWebserverService', {
      cluster: airflowCluster,
      taskDefinition: webserverTask,
      serviceName: 'AirflowWebserverServiceName',
      securityGroups: [this.airflowECSServiceSG],
    });

    //Create Airflow ALB
    
    const alb = new elbv2.ApplicationLoadBalancer(this, 'LB', {
      vpc,
      internetFacing: true,
      securityGroup: this.airflowAlbSG,
      loadBalancerName: 'Airflow-Webserver-Loadbalancer',
    });
    const listener = alb.addListener('PublicListener', {
      port: 80,
      open: true,
    });
    listener.addTargets('Fargate', {
      port: 80,
      targets: [airflowWebserverService],
      healthCheck: {
        enabled: true,
        path: '/health',
        interval: cdk.Duration.seconds(60),
        timeout: cdk.Duration.seconds(5),
      },

    });
  }

  private _createAirflowWebServiceDockerImage(): assets.DockerImageAsset {
    return new assets.DockerImageAsset(this, 'airflow-webserver', {
      directory: path.join(__dirname, '/../docker-images/airflow-webserver'),
    });
  }

  // private _createECSSampleDockerImage(): assets.DockerImageAsset {
  //   return new assets.DockerImageAsset(this, 'ecslocal-sample', {
  //     directory: path.join(__dirname, '/../docker-images/ecs-sample'),
  //   });
  // }

  /**
   * Create Airflow Scheduler ECS Service
   */
  private _createAirflowSchedulerService() {

  }

  /**
   *  Create Airflow Worker ECS Service
   */
  private _createAirflowWorkerService() {

  }
}