import * as path from 'path';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as assets from '@aws-cdk/aws-ecr-assets';
import * as ecs from '@aws-cdk/aws-ecs';
import * as elasticache from '@aws-cdk/aws-elasticache';
import * as iam from '@aws-cdk/aws-iam';
import { PolicyStatement } from '@aws-cdk/aws-iam';
import * as logs from '@aws-cdk/aws-logs';
import * as rds from '@aws-cdk/aws-rds';
import * as s3 from '@aws-cdk/aws-s3';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';
import * as cdk from '@aws-cdk/core';

export interface AirflowProps{
  readonly bucketName?: string;
  readonly vpcName?: string;
  readonly dbName?: string;
  readonly redisName?: string;
  readonly ecsclusterName?: string;
  readonly airflowFernetKey?: string;
}

export class Airflow extends cdk.Construct {

  constructor(scope: cdk.Construct, id:string, props: AirflowProps= {}) {
    super(scope, id);

    const airflowBucket = this._getAirflowBucket(props);
    console.log(airflowBucket.bucketName);

    const vpc= this._getAirflowVPC(props);
    console.log(vpc.availabilityZones);

    const airflowDBSecret = this._getAirflowDBSecret();
    const dbName = props.dbName ?? 'airflowdb';
    const airflowDB = this._getAirflowDB(vpc, airflowDBSecret, dbName);
    console.log(airflowDB.instanceArn);

    const airflowRedis = this._getAirflowRedis(props, vpc);
    console.log(airflowRedis.clusterName);

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

    this._createVPCEndpoints(airflowVPC);
    return airflowVPC;
  }

  private _createVPCEndpoints(vpc: ec2.IVpc) {
    vpc.addGatewayEndpoint('s3-endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [
        { subnetType: ec2.SubnetType.ISOLATED },
      ],
    });

    const vpcendpointSG= new ec2.SecurityGroup(this, 'vpcendpoint-sg', {
      vpc,
      securityGroupName: 'vpcendpoint-sg',
    });
    vpcendpointSG.connections.allowFrom(ec2.Peer.ipv4('10.0.0.0/16'), ec2.Port.tcp(443), 'vpc endpoint security group');
    vpcendpointSG.connections.allowFrom(ec2.Peer.anyIpv4(), ec2.Port.tcpRange(0, 65535), 'vpc endpoint sg 2');

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
    });

    vpc.addInterfaceEndpoint('ecr-endpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.ECR,
      privateDnsEnabled: true,
      securityGroups: [vpcendpointSG],
    });

    vpc.addInterfaceEndpoint('ecr-docker-endpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      privateDnsEnabled: true,
      securityGroups: [vpcendpointSG],
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
      vpcSecurityGroupIds: [new ec2.SecurityGroup(this, 'airflow-redis-sg', {
        vpc,
        allowAllOutbound: true,
      }).securityGroupId],
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
    const clusterName = props.ecsclusterName?? 'AirflowECSCluster';
    const airflowCluster = new ecs.Cluster(this, 'airflow-ecs-cluster', {
      vpc,
      clusterName,
      containerInsights: true,
    });

    //Log Group
    const webserverLogGroup= this._createAirflowLogGroup('airflow-webserver-lg', '/ecs/airflow-webserver');
    const schedulerLogGroup= this._createAirflowLogGroup('airflow-scheduler-lg', '/ecs/airflow-scheduler');
    const workerLogGroup= this._createAirflowLogGroup('airflow-worker-lg', '/ecs/airflow-worker');

    //ECS Roles
    const executionRole = this._createTaskExecutionRole();
    const taskRole = this._createTaskRole(bucket);

    webserverLogGroup.grantWrite(taskRole);
    schedulerLogGroup.grantWrite(taskRole);
    workerLogGroup.grantWrite(taskRole);

    //FernetKey
    const fernetKey = props.airflowFernetKey?? 'gjDz-PXGnhitGbAGkiPziGCGWie9Q-ai3c56FUmNsuY=';

    //Tasks
    const webserverTask = new ecs.FargateTaskDefinition(this, 'AriflowWebserverTask', {
      executionRole,
      taskRole,
      cpu: 512,
      memoryLimitMiB: 1024,
      family: 'airflow-webserver',
    });
    webserverTask.addContainer('airflow-webserver-container', {
      image: ecs.AssetImage.fromDockerImageAsset(this._createECSSampleDockerImage()),
      // image: ecs.AssetImage.fromDockerImageAsset(this._createAirflowWebServiceDockerImage()),
      // image: ecs.ContainerImage.fromRegistry('750521193989.dkr.ecr.ap-southeast-1.amazonaws.com/ecs-sample:latest'),
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
      portMappings: [{ containerPort: 80 }],
      // portMappings: [{
      //   containerPort: 8080,
      //   hostPort: 8080,
      //   protocol: ecs.Protocol.TCP,
      // }],
    });

    const airflowECSServiceSG = new ec2.SecurityGroup(this, 'airflow-ecsservice-sg', {
      vpc,
      allowAllOutbound: true,
      securityGroupName: 'airflow-ecsservice-sg',
    });
    airflowECSServiceSG.connections.allowFromAnyIpv4(ec2.Port.allTcp());
    new ecs.FargateService(this, 'AirflowWebserverService', {
      cluster: airflowCluster,
      taskDefinition: webserverTask,
      serviceName: 'AirflowWebserverService',
      securityGroups: [airflowECSServiceSG],
    });

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

  // private _createAirflowWebServiceDockerImage(): assets.DockerImageAsset {
  //   return new assets.DockerImageAsset(this, 'airflow-webserver', {
  //     directory: path.join(__dirname, '/../docker-images/airflow-webserver'),
  //   });
  // }
  private _createECSSampleDockerImage(): assets.DockerImageAsset {
    // return new assets.DockerImageAsset(this, 'ecslocal-sample', {
    //   directory: path.join(__dirname, '/../docker-images/ecs-sample'),
    // });
    return new assets.DockerImageAsset(this, 'airflow-webserver', {
      directory: path.join(__dirname, '/../docker-images/airflow-webserver'),
    });
  }
}