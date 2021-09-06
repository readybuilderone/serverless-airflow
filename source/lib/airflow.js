"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Airflow = void 0;
const path = require("path");
const ec2 = require("@aws-cdk/aws-ec2");
const assets = require("@aws-cdk/aws-ecr-assets");
const ecs = require("@aws-cdk/aws-ecs");
const patterns = require("@aws-cdk/aws-ecs-patterns");
const elasticache = require("@aws-cdk/aws-elasticache");
const iam = require("@aws-cdk/aws-iam");
const logs = require("@aws-cdk/aws-logs");
const rds = require("@aws-cdk/aws-rds");
const s3 = require("@aws-cdk/aws-s3");
const secretsmanager = require("@aws-cdk/aws-secretsmanager");
const servicediscovery = require("@aws-cdk/aws-servicediscovery");
const cdk = require("@aws-cdk/core");
const core_1 = require("@aws-cdk/core");
class Airflow extends cdk.Construct {
    constructor(scope, id, props = {}) {
        var _a, _b;
        super(scope, id);
        this.fernetKey = (_a = process.env.AIRFLOW__CORE__FERNET_KEY) !== null && _a !== void 0 ? _a : '';
        const airflowBucket = this._getAirflowBucket(props);
        const vpc = this._getAirflowVPC(props);
        //Initial Security Group Property
        this.vpcendpointSG = this._createSecurityGroup(vpc, 'vpcendpoint-sg');
        this.airflowECSServiceSG = this._createSecurityGroup(vpc, 'airflow-ecsservice-sg');
        this.redisSG = this._createSecurityGroup(vpc, 'airflow-redis-sg');
        this.databaseSG = this._createSecurityGroup(vpc, 'airflow-database-sg');
        this._configSecurityGroup();
        //Create VPC Endpoints
        this._createVPCEndpoints(vpc);
        //Create Database
        const airflowDBSecret = this._getAirflowDBSecret();
        const dbName = (_b = props.dbName) !== null && _b !== void 0 ? _b : 'airflowdb';
        const airflowDB = this._getAirflowDB(vpc, airflowDBSecret, dbName);
        //Create Redis
        const airflowRedis = this._getAirflowRedis(props, vpc);
        //Create AirflowCluster
        this._getAirflowECSCluster(props, vpc, airflowBucket, airflowDBSecret, airflowDB, dbName, airflowRedis);
    }
    /**
     * Create Security Group
     * @param vpc
     * @param securityGroupName
     * @returns
     */
    _createSecurityGroup(vpc, securityGroupName) {
        return new ec2.SecurityGroup(this, securityGroupName, {
            vpc,
            securityGroupName,
        });
    }
    /**
     * Setting rules for security groups
     */
    _configSecurityGroup() {
        this.airflowECSServiceSG.connections.allowFrom(this.airflowECSServiceSG, ec2.Port.tcp(8080), 'Allow airflow scheduler/worker can connect to webserver');
        this.vpcendpointSG.connections.allowFrom(ec2.Peer.ipv4('10.0.0.0/16'), ec2.Port.tcp(443), 'Allow ECS Cluster to access VPC Endpoints');
        this.redisSG.connections.allowFrom(this.airflowECSServiceSG, ec2.Port.tcp(6379), 'Allow ECS Cluster to access Redis');
        this.databaseSG.connections.allowFrom(this.airflowECSServiceSG, ec2.Port.tcp(5432), 'Allow ECS Cluster to access Database');
    }
    /**
     * Create a S3 bucket for airflow to synch the DAG.
     * If the bucket name is provided in the props, it will use
     * @param props
     * @returns
     */
    _getAirflowBucket(props) {
        var _a;
        const bucketName = (_a = props.bucketName) !== null && _a !== void 0 ? _a : `airflow-bucket-${Math.floor(Math.random() * 1000001)}`;
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
        new core_1.CfnOutput(this, 'airflow-bucket', {
            value: airflowBucket.bucketName,
            exportName: 'AirflowBucket',
            description: 'Buckent Name',
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
    _getAirflowVPC(props) {
        var _a;
        const vpcName = (_a = props.vpcName) !== null && _a !== void 0 ? _a : 'airflow-vpc';
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
    _createVPCEndpoints(vpc) {
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
    _getAirflowDBSecret() {
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
    _getAirflowDB(vpc, databaseSceret, dbName) {
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
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO),
            allocatedStorage: 20,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            parameterGroup: rds.ParameterGroup.fromParameterGroupName(this, 'airflow-db-parametergroup', 'default.postgres9.6'),
            deletionProtection: false,
            securityGroups: [this.databaseSG],
        });
        return dbInstance;
    }
    _getAirflowRedis(props, vpc) {
        var _a;
        const redisName = (_a = props.redisName) !== null && _a !== void 0 ? _a : 'airflowredis';
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
    _getAirflowECSCluster(props, vpc, bucket, databaseSceret, database, dbName, redis) {
        var _a;
        //Create ECS Cluster
        const clusterName = (_a = props.ecsclusterName) !== null && _a !== void 0 ? _a : 'AirflowECSCluster';
        const airflowCluster = new ecs.Cluster(this, 'airflow-ecs-cluster', {
            vpc,
            clusterName,
            containerInsights: true,
        });
        //Create Roles
        const executionRole = this._createTaskExecutionRole();
        const taskRole = this._createTaskRole(bucket);
        //Create Log Group
        const webserverLogGroup = this._createAirflowLogGroup('airflow-webserver-lg', '/ecs/airflow-webserver');
        const schedulerLogGroup = this._createAirflowLogGroup('airflow-scheduler-lg', '/ecs/airflow-scheduler');
        const workerLogGroup = this._createAirflowLogGroup('airflow-worker-lg', '/ecs/airflow-worker');
        webserverLogGroup.grantWrite(taskRole);
        schedulerLogGroup.grantWrite(taskRole);
        workerLogGroup.grantWrite(taskRole);
        //Create Airflow ECS Service
        this._createAirflowWebserverService(executionRole, taskRole, bucket, databaseSceret, database, dbName, airflowCluster, webserverLogGroup);
        this._createAirflowSchedulerService(executionRole, taskRole, schedulerLogGroup, bucket, databaseSceret, database, dbName, redis, airflowCluster);
        this._createAirflowWorkerService(executionRole, taskRole, workerLogGroup, bucket, databaseSceret, database, dbName, redis, airflowCluster);
        return airflowCluster;
    }
    /**
     * Create log group for Airflow ECS Cluster
     */
    _createAirflowLogGroup(logGroupId, logGroupName) {
        return new logs.LogGroup(this, logGroupId, {
            logGroupName,
            retention: logs.RetentionDays.ONE_MONTH,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
    }
    _createTaskExecutionRole() {
        const executionRole = new iam.Role(this, 'AirflowTaskExecutionRole', {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        });
        executionRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'));
        executionRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));
        return executionRole;
    }
    _createTaskRole(bucket) {
        const taskRole = new iam.Role(this, 'AirflowTaskRole', {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        });
        taskRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));
        //S3 Policy
        taskRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                's3:ListBucket',
                's3:GetObject',
                's3:GetBucketLocation',
            ],
            resources: [`${bucket.bucketArn}`, `${bucket.bucketArn}/*`],
        }));
        //Secrets Manager
        taskRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['secretsmanager:GetSecretValue'],
            resources: ['*'],
        }));
        return taskRole;
    }
    /**
     * Create Airflow Webserver ECS Service
     */
    _createAirflowWebserverService(executionRole, taskRole, bucket, databaseSceret, database, dbName, airflowCluster, webserverLogGroup) {
        const loadBalancedFargateService = new patterns.ApplicationLoadBalancedFargateService(this, 'airflow-webserver-pattners', {
            cluster: airflowCluster,
            cpu: 512,
            memoryLimitMiB: 1024,
            taskImageOptions: {
                image: ecs.AssetImage.fromDockerImageAsset(this._createAirflowWebServiceDockerImage()),
                taskRole,
                executionRole,
                family: 'airflow-webserver-pattners',
                environment: {
                    AIRFLOW_FERNET_KEY: this.fernetKey,
                    AIRFLOW_DATABASE_NAME: dbName,
                    AIRFLOW_DATABASE_PORT_NUMBER: '5432',
                    AIRFLOW_DATABASE_HOST: database.dbInstanceEndpointAddress,
                    AIRFLOW_EXECUTOR: 'CeleryExecutor',
                    AIRFLOW_LOAD_EXAMPLES: 'no',
                    AIRFLOW__SCHEDULER__DAG_DIR_LIST_INTERVAL: '30',
                    BUCKET_NAME: bucket.bucketName,
                },
                secrets: {
                    AIRFLOW_DATABASE_USERNAME: ecs.Secret.fromSecretsManager(databaseSceret, 'username'),
                    AIRFLOW_DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(databaseSceret, 'password'),
                },
                containerPort: 8080,
                logDriver: ecs.LogDriver.awsLogs({
                    streamPrefix: 'ecs',
                    logGroup: webserverLogGroup,
                }),
            },
            securityGroups: [this.airflowECSServiceSG],
            serviceName: 'AirflowWebserverServiceName',
            desiredCount: 1,
            loadBalancerName: 'Airflow-Webserver-LB',
            cloudMapOptions: {
                name: 'webserver',
                dnsRecordType: servicediscovery.DnsRecordType.A,
                dnsTtl: cdk.Duration.seconds(30),
                cloudMapNamespace: new servicediscovery.PrivateDnsNamespace(this, 'webserver-dns-namespace', {
                    name: 'airflow',
                    vpc: airflowCluster.vpc,
                }),
            },
        });
        loadBalancedFargateService.targetGroup.configureHealthCheck({
            path: '/health',
            interval: cdk.Duration.seconds(60),
            timeout: cdk.Duration.seconds(20),
        });
    }
    /**
     * Create Airflow Scheduler ECS Service
     */
    _createAirflowSchedulerService(executionRole, taskRole, schedulerLogGroup, bucket, databaseSceret, database, dbName, redis, airflowCluster) {
        //Create Task Definition
        const schedulerTask = new ecs.FargateTaskDefinition(this, 'AriflowSchedulerTask', {
            executionRole,
            taskRole,
            cpu: 512,
            memoryLimitMiB: 2048,
            family: 'airflow-scheduler',
        });
        schedulerTask.addContainer('airflow-scheduler-container', {
            image: ecs.AssetImage.fromDockerImageAsset(this._createAirflowSchedulerDockerImage()),
            logging: new ecs.AwsLogDriver({
                streamPrefix: 'ecs',
                logGroup: schedulerLogGroup,
            }),
            environment: {
                AIRFLOW_FERNET_KEY: this.fernetKey,
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
        });
        //Create AirflowSchedulerService
        new ecs.FargateService(this, 'AirflowSchedulerService', {
            cluster: airflowCluster,
            taskDefinition: schedulerTask,
            serviceName: 'AirflowSchedulerServiceName',
            securityGroups: [this.airflowECSServiceSG],
        });
    }
    /**
     *  Create Airflow Worker ECS Service
     */
    _createAirflowWorkerService(executionRole, taskRole, workerLogGroup, bucket, databaseSceret, database, dbName, redis, airflowCluster) {
        //Create Task Definition
        const workerTask = new ecs.FargateTaskDefinition(this, 'AriflowworkerTask', {
            executionRole,
            taskRole,
            cpu: 1024,
            memoryLimitMiB: 3072,
            family: 'airflow-worker',
        });
        workerTask.addContainer('airflow-worker-container', {
            image: ecs.AssetImage.fromDockerImageAsset(this._createAirflowWorkerDockerImage()),
            logging: new ecs.AwsLogDriver({
                streamPrefix: 'ecs',
                logGroup: workerLogGroup,
            }),
            environment: {
                AIRFLOW_FERNET_KEY: this.fernetKey,
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
            portMappings: [{ containerPort: 8793 }],
        });
        //Create AirflowWorkerService
        new ecs.FargateService(this, 'AirflowWorkerService', {
            cluster: airflowCluster,
            taskDefinition: workerTask,
            serviceName: 'AirflowWorkerServiceName',
            securityGroups: [this.airflowECSServiceSG],
        });
    }
    _createAirflowWebServiceDockerImage() {
        return new assets.DockerImageAsset(this, 'airflow-webserver', {
            directory: path.join(__dirname, '/../docker-images/airflow-webserver'),
        });
    }
    _createAirflowSchedulerDockerImage() {
        return new assets.DockerImageAsset(this, 'airflow-scheduler', {
            directory: path.join(__dirname, '/../docker-images/airflow-scheduler'),
        });
    }
    _createAirflowWorkerDockerImage() {
        return new assets.DockerImageAsset(this, 'airflow-worker', {
            directory: path.join(__dirname, '/../docker-images/airflow-worker'),
        });
    }
}
exports.Airflow = Airflow;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlyZmxvdy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9haXJmbG93LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDZCQUE2QjtBQUM3Qix3Q0FBd0M7QUFDeEMsa0RBQWtEO0FBQ2xELHdDQUF3QztBQUN4QyxzREFBc0Q7QUFDdEQsd0RBQXdEO0FBQ3hELHdDQUF3QztBQUN4QywwQ0FBMEM7QUFDMUMsd0NBQXdDO0FBQ3hDLHNDQUFzQztBQUN0Qyw4REFBOEQ7QUFDOUQsa0VBQWtFO0FBQ2xFLHFDQUFxQztBQUNyQyx3Q0FBMEM7QUFXMUMsTUFBYSxPQUFRLFNBQVEsR0FBRyxDQUFDLFNBQVM7SUFPeEMsWUFBWSxLQUFvQixFQUFFLEVBQVUsRUFBRSxRQUFzQixFQUFFOztRQUNwRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLElBQUksQ0FBQyxTQUFTLFNBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsbUNBQUcsRUFBRSxDQUFDO1FBRTVELE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNwRCxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRXZDLGlDQUFpQztRQUNqQyxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztRQUN0RSxJQUFJLENBQUMsbUJBQW1CLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsRUFBRSx1QkFBdUIsQ0FBQyxDQUFDO1FBQ25GLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1FBQ2xFLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsRUFBRSxxQkFBcUIsQ0FB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LENBQUMsSUFBSSxFQUFFLHNCQUFzQixFQUFFO1lBQ25ELE9BQU8sRUFBRSxjQUFjO1lBQ3ZCLGNBQWMsRUFBRSxVQUFVO1lBQzFCLFdBQVcsRUFBRSwwQkFBMEI7WUFDdkMsY0FBYyxFQUFFLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDO1NBQzNDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTyxtQ0FBbUM7UUFDekMsT0FBTyxJQUFJLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDNUQsU0FBUyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLHFDQUFxQyxDQUFDO1NBQ3ZFLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTyxrQ0FBa0M7UUFDeEMsT0FBTyxJQUFJLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDNUQsU0FBUyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLHFDQUFxQyxDQUFDO1NBQ3ZFLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTywrQkFBK0I7UUFDckMsT0FBTyxJQUFJLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDekQsU0FBUyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLGtDQUFrQyxDQUFDO1NBQ3BFLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXhlRCwwQkF3ZUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0ICogYXMgZWMyIGZyb20gJ0Bhd3MtY2RrL2F3cy1lYzInO1xuaW1wb3J0ICogYXMgYXNzZXRzIGZyb20gJ0Bhd3MtY2RrL2F3cy1lY3ItYXNzZXRzJztcbmltcG9ydCAqIGFzIGVjcyBmcm9tICdAYXdzLWNkay9hd3MtZWNzJztcbmltcG9ydCAqIGFzIHBhdHRlcm5zIGZyb20gJ0Bhd3MtY2RrL2F3cy1lY3MtcGF0dGVybnMnO1xuaW1wb3J0ICogYXMgZWxhc3RpY2FjaGUgZnJvbSAnQGF3cy1jZGsvYXdzLWVsYXN0aWNhY2hlJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdAYXdzLWNkay9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnQGF3cy1jZGsvYXdzLWxvZ3MnO1xuaW1wb3J0ICogYXMgcmRzIGZyb20gJ0Bhd3MtY2RrL2F3cy1yZHMnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnQGF3cy1jZGsvYXdzLXMzJztcbmltcG9ydCAqIGFzIHNlY3JldHNtYW5hZ2VyIGZyb20gJ0Bhd3MtY2RrL2F3cy1zZWNyZXRzbWFuYWdlcic7XG5pbXBvcnQgKiBhcyBzZXJ2aWNlZGlzY292ZXJ5IGZyb20gJ0Bhd3MtY2RrL2F3cy1zZXJ2aWNlZGlzY292ZXJ5JztcbmltcG9ydCAqIGFzIGNkayBmcm9tICdAYXdzLWNkay9jb3JlJztcbmltcG9ydCB7IENmbk91dHB1dCB9IGZyb20gJ0Bhd3MtY2RrL2NvcmUnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEFpcmZsb3dQcm9wcyB7XG4gIHJlYWRvbmx5IGJ1Y2tldE5hbWU/OiBzdHJpbmc7XG4gIHJlYWRvbmx5IHZwY05hbWU/OiBzdHJpbmc7XG4gIHJlYWRvbmx5IGRiTmFtZT86IHN0cmluZztcbiAgcmVhZG9ubHkgcmVkaXNOYW1lPzogc3RyaW5nO1xuICByZWFkb25seSBlY3NjbHVzdGVyTmFtZT86IHN0cmluZztcbiAgcmVhZG9ubHkgYWlyZmxvd0Zlcm5ldEtleT86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIEFpcmZsb3cgZXh0ZW5kcyBjZGsuQ29uc3RydWN0IHtcbiAgcHJpdmF0ZSByZWFkb25seSBmZXJuZXRLZXk6IHN0cmluZztcbiAgcHJpdmF0ZSByZWFkb25seSBhaXJmbG93RUNTU2VydmljZVNHOiBlYzIuSVNlY3VyaXR5R3JvdXA7XG4gIHByaXZhdGUgcmVhZG9ubHkgdnBjZW5kcG9pbnRTRzogZWMyLklTZWN1cml0eUdyb3VwO1xuICBwcml2YXRlIHJlYWRvbmx5IHJlZGlzU0c6IGVjMi5JU2VjdXJpdHlHcm91cDtcbiAgcHJpdmF0ZSByZWFkb25seSBkYXRhYmFzZVNHOiBlYzIuSVNlY3VyaXR5R3JvdXA7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IGNkay5Db25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBBaXJmbG93UHJvcHMgPSB7fSkge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICB0aGlzLmZlcm5ldEtleSA9IHByb2Nlc3MuZW52LkFJUkZMT1dfX0NPUkVfX0ZFUk5FVF9LRVk/PyAnJztcblxuICAgIGNvbnN0IGFpcmZsb3dCdWNrZXQgPSB0aGlzLl9nZXRBaXJmbG93QnVja2V0KHByb3BzKTtcbiAgICBjb25zdCB2cGMgPSB0aGlzLl9nZXRBaXJmbG93VlBDKHByb3BzKTtcblxuICAgIC8vSW5pdGlhbCBTZWN1cml0eSBHcm91cCBQcm9wZXJ0eVxuICAgIHRoaXMudnBjZW5kcG9pbnRTRyA9IHRoaXMuX2NyZWF0ZVNlY3VyaXR5R3JvdXAodnBjLCAndnBjZW5kcG9pbnQtc2cnKTtcbiAgICB0aGlzLmFpcmZsb3dFQ1NTZXJ2aWNlU0cgPSB0aGlzLl9jcmVhdGVTZWN1cml0eUdyb3VwKHZwYywgJ2FpcmZsb3ctZWNzc2VydmljZS1zZycpO1xuICAgIHRoaXMucmVkaXNTRyA9IHRoaXMuX2NyZWF0ZVNlY3VyaXR5R3JvdXAodnBjLCAnYWlyZmxvdy1yZWRpcy1zZycpO1xuICAgIHRoaXMuZGF0YWJhc2VTRyA9IHRoaXMuX2NyZWF0ZVNlY3VyaXR5R3JvdXAodnBjLCAnYWlyZmxvdy1kYXRhYmFzZS1zZycpO1xuICAgIHRoaXMuX2NvbmZpZ1NlY3VyaXR5R3JvdXAoKTtcblxuICAgIC8vQ3JlYXRlIFZQQyBFbmRwb2ludHNcbiAgICB0aGlzLl9jcmVhdGVWUENFbmRwb2ludHModnBjKTtcblxuICAgIC8vQ3JlYXRlIERhdGFiYXNlXG4gICAgY29uc3QgYWlyZmxvd0RCU2VjcmV0ID0gdGhpcy5fZ2V0QWlyZmxvd0RCU2VjcmV0KCk7XG4gICAgY29uc3QgZGJOYW1lID0gcHJvcHMuZGJOYW1lID8/ICdhaXJmbG93ZGInO1xuICAgIGNvbnN0IGFpcmZsb3dEQiA9IHRoaXMuX2dldEFpcmZsb3dEQih2cGMsIGFpcmZsb3dEQlNlY3JldCwgZGJOYW1lKTtcblxuICAgIC8vQ3JlYXRlIFJlZGlzXG4gICAgY29uc3QgYWlyZmxvd1JlZGlzID0gdGhpcy5fZ2V0QWlyZmxvd1JlZGlzKHByb3BzLCB2cGMpO1xuXG4gICAgLy9DcmVhdGUgQWlyZmxvd0NsdXN0ZXJcbiAgICB0aGlzLl9nZXRBaXJmbG93RUNTQ2x1c3Rlcihwcm9wcywgdnBjLCBhaXJmbG93QnVja2V0LCBhaXJmbG93REJTZWNyZXQsIGFpcmZsb3dEQiwgZGJOYW1lLCBhaXJmbG93UmVkaXMpO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBTZWN1cml0eSBHcm91cFxuICAgKiBAcGFyYW0gdnBjXG4gICAqIEBwYXJhbSBzZWN1cml0eUdyb3VwTmFtZVxuICAgKiBAcmV0dXJuc1xuICAgKi9cbiAgcHJpdmF0ZSBfY3JlYXRlU2VjdXJpdHlHcm91cCh2cGM6IGVjMi5JVnBjLCBzZWN1cml0eUdyb3VwTmFtZTogc3RyaW5nKTogZWMyLklTZWN1cml0eUdyb3VwIHtcbiAgICByZXR1cm4gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsIHNlY3VyaXR5R3JvdXBOYW1lLCB7XG4gICAgICB2cGMsXG4gICAgICBzZWN1cml0eUdyb3VwTmFtZSxcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZXR0aW5nIHJ1bGVzIGZvciBzZWN1cml0eSBncm91cHNcbiAgICovXG4gIHByaXZhdGUgX2NvbmZpZ1NlY3VyaXR5R3JvdXAoKSB7XG4gICAgdGhpcy5haXJmbG93RUNTU2VydmljZVNHLmNvbm5lY3Rpb25zLmFsbG93RnJvbSh0aGlzLmFpcmZsb3dFQ1NTZXJ2aWNlU0csIGVjMi5Qb3J0LnRjcCg4MDgwKSwgJ0FsbG93IGFpcmZsb3cgc2NoZWR1bGVyL3dvcmtlciBjYW4gY29ubmVjdCB0byB3ZWJzZXJ2ZXInKTtcbiAgICB0aGlzLnZwY2VuZHBvaW50U0cuY29ubmVjdGlvbnMuYWxsb3dGcm9tKGVjMi5QZWVyLmlwdjQoJzEwLjAuMC4wLzE2JyksIGVjMi5Qb3J0LnRjcCg0NDMpLCAnQWxsb3cgRUNTIENsdXN0ZXIgdG8gYWNjZXNzIFZQQyBFbmRwb2ludHMnKTtcbiAgICB0aGlzLnJlZGlzU0cuY29ubmVjdGlvbnMuYWxsb3dGcm9tKHRoaXMuYWlyZmxvd0VDU1NlcnZpY2VTRywgZWMyLlBvcnQudGNwKDYzNzkpLCAnQWxsb3cgRUNTIENsdXN0ZXIgdG8gYWNjZXNzIFJlZGlzJyk7XG4gICAgdGhpcy5kYXRhYmFzZVNHLmNvbm5lY3Rpb25zLmFsbG93RnJvbSh0aGlzLmFpcmZsb3dFQ1NTZXJ2aWNlU0csIGVjMi5Qb3J0LnRjcCg1NDMyKSwgJ0FsbG93IEVDUyBDbHVzdGVyIHRvIGFjY2VzcyBEYXRhYmFzZScpO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhIFMzIGJ1Y2tldCBmb3IgYWlyZmxvdyB0byBzeW5jaCB0aGUgREFHLlxuICAgKiBJZiB0aGUgYnVja2V0IG5hbWUgaXMgcHJvdmlkZWQgaW4gdGhlIHByb3BzLCBpdCB3aWxsIHVzZVxuICAgKiBAcGFyYW0gcHJvcHNcbiAgICogQHJldHVybnNcbiAgICovXG4gIHByaXZhdGUgX2dldEFpcmZsb3dCdWNrZXQocHJvcHM6IEFpcmZsb3dQcm9wcyk6IHMzLklCdWNrZXQge1xuICAgIGNvbnN0IGJ1Y2tldE5hbWUgPSBwcm9wcy5idWNrZXROYW1lID8/IGBhaXJmbG93LWJ1Y2tldC0ke01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDEwMDAwMDEpfWA7XG4gICAgY29uc3QgYWlyZmxvd0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0FpcmZsb3dCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBuZXcgczMuQmxvY2tQdWJsaWNBY2Nlc3Moe1xuICAgICAgICBibG9ja1B1YmxpY0FjbHM6IHRydWUsXG4gICAgICAgIGJsb2NrUHVibGljUG9saWN5OiB0cnVlLFxuICAgICAgICBpZ25vcmVQdWJsaWNBY2xzOiB0cnVlLFxuICAgICAgICByZXN0cmljdFB1YmxpY0J1Y2tldHM6IHRydWUsXG4gICAgICB9KSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuICAgIH0pO1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ2FpcmZsb3ctYnVja2V0Jywge1xuICAgICAgdmFsdWU6IGFpcmZsb3dCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIGV4cG9ydE5hbWU6ICdBaXJmbG93QnVja2V0JyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQnVja2VudCBOYW1lJyxcbiAgICB9KTtcbiAgICByZXR1cm4gYWlyZmxvd0J1Y2tldDtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgdGhlIFZQQyBmb3IgYWlyZmxvdy5cbiAgICogVGhpcyBlbmRwb2ludHMgd2lsbCBiZSBjcmVhdGVkIGZvciBmb2xsb3dpbmcgc2VydmljZXM6XG4gICAqICAgLSBTM1xuICAgKiAgIC0gRUNTXG4gICAqICAgLSBDbG91ZFdhdGNoXG4gICAqICAgLSBTZWNyZXRzIE1hbmFnZXJcbiAgICogQHBhcmFtIHByb3BzXG4gICAqIEByZXR1cm5zXG4gICAqL1xuICBwcml2YXRlIF9nZXRBaXJmbG93VlBDKHByb3BzOiBBaXJmbG93UHJvcHMpOiBlYzIuSVZwYyB7XG4gICAgY29uc3QgdnBjTmFtZSA9IHByb3BzLnZwY05hbWUgPz8gJ2FpcmZsb3ctdnBjJztcbiAgICBjb25zdCBhaXJmbG93VlBDID0gbmV3IGVjMi5WcGModGhpcywgdnBjTmFtZSwge1xuICAgICAgY2lkcjogJzEwLjAuMC4wLzE2JyxcbiAgICAgIGVuYWJsZURuc0hvc3RuYW1lczogdHJ1ZSxcbiAgICAgIGVuYWJsZURuc1N1cHBvcnQ6IHRydWUsXG4gICAgICBtYXhBenM6IDIsXG4gICAgICBzdWJuZXRDb25maWd1cmF0aW9uOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBjaWRyTWFzazogMjQsXG4gICAgICAgICAgbmFtZTogJ2FpcmZsb3ctcHVibGljJyxcbiAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QVUJMSUMsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBjaWRyTWFzazogMjQsXG4gICAgICAgICAgbmFtZTogJ2FpcmZsb3ctaXNvbGF0ZWQnLFxuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLklTT0xBVEVELFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vVGFnU3VibmV0c1xuICAgIGFpcmZsb3dWUEMucHVibGljU3VibmV0cy5mb3JFYWNoKHN1Ym5ldCA9PiB7XG4gICAgICBjZGsuVGFncy5vZihzdWJuZXQpLmFkZCgnTmFtZScsIGBwdWJsaWMtc3VibmV0LSR7c3VibmV0LmF2YWlsYWJpbGl0eVpvbmV9LWFpcmZsb3dgKTtcbiAgICB9KTtcbiAgICBhaXJmbG93VlBDLmlzb2xhdGVkU3VibmV0cy5mb3JFYWNoKHN1Ym5ldCA9PiB7XG4gICAgICBjZGsuVGFncy5vZihzdWJuZXQpLmFkZCgnTmFtZScsIGBpc29sYXRlZC1zdWJuZXQtJHtzdWJuZXQuYXZhaWxhYmlsaXR5Wm9uZX0tYWlyZmxvd2ApO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIGFpcmZsb3dWUEM7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIFZQQyBFbmRwb2ludHNcbiAgICogQHBhcmFtIHZwY1xuICAgKi9cbiAgcHJpdmF0ZSBfY3JlYXRlVlBDRW5kcG9pbnRzKHZwYzogZWMyLklWcGMpIHtcbiAgICAvL0NyZWF0ZSBTMyBHYXRld2F5IFZQQyBFbmRwb2ludHNcbiAgICB2cGMuYWRkR2F0ZXdheUVuZHBvaW50KCdzMy1lbmRwb2ludCcsIHtcbiAgICAgIHNlcnZpY2U6IGVjMi5HYXRld2F5VnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlMzLFxuICAgICAgc3VibmV0czogW1xuICAgICAgICB7IHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLklTT0xBVEVEIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy9DcmVhdGUgSW50ZXJmYWNlIFZQQyBFbmRwb2ludHMgZm9yIEVDUi9FQ1MvQ2xvdWRXYXRjaC9TZWNyZXRzTWFuYWdlclxuICAgIHZwYy5hZGRJbnRlcmZhY2VFbmRwb2ludCgnZWNyLWVuZHBvaW50Jywge1xuICAgICAgc2VydmljZTogZWMyLkludGVyZmFjZVZwY0VuZHBvaW50QXdzU2VydmljZS5FQ1IsXG4gICAgICBwcml2YXRlRG5zRW5hYmxlZDogdHJ1ZSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbdGhpcy52cGNlbmRwb2ludFNHXSxcbiAgICB9KTtcbiAgICB2cGMuYWRkSW50ZXJmYWNlRW5kcG9pbnQoJ2Vjci1kb2NrZXItZW5kcG9pbnQnLCB7XG4gICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLkVDUl9ET0NLRVIsXG4gICAgICBwcml2YXRlRG5zRW5hYmxlZDogdHJ1ZSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbdGhpcy52cGNlbmRwb2ludFNHXSxcbiAgICB9KTtcbiAgICB2cGMuYWRkSW50ZXJmYWNlRW5kcG9pbnQoJ2Vjcy1lbmRwb2ludCcsIHtcbiAgICAgIHNlcnZpY2U6IGVjMi5JbnRlcmZhY2VWcGNFbmRwb2ludEF3c1NlcnZpY2UuRUNTLFxuICAgICAgcHJpdmF0ZURuc0VuYWJsZWQ6IHRydWUsXG4gICAgICBzZWN1cml0eUdyb3VwczogW3RoaXMudnBjZW5kcG9pbnRTR10sXG4gICAgfSk7XG4gICAgdnBjLmFkZEludGVyZmFjZUVuZHBvaW50KCdjbG91ZHdhdGNobG9ncy1lbmRwb2ludCcsIHtcbiAgICAgIHNlcnZpY2U6IGVjMi5JbnRlcmZhY2VWcGNFbmRwb2ludEF3c1NlcnZpY2UuQ0xPVURXQVRDSF9MT0dTLFxuICAgICAgcHJpdmF0ZURuc0VuYWJsZWQ6IHRydWUsXG4gICAgICBzZWN1cml0eUdyb3VwczogW3RoaXMudnBjZW5kcG9pbnRTR10sXG4gICAgfSk7XG4gICAgdnBjLmFkZEludGVyZmFjZUVuZHBvaW50KCdzZWNyZXRzLW1hbmFnZXItZW5kcG9pbnQnLCB7XG4gICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlNFQ1JFVFNfTUFOQUdFUixcbiAgICAgIHByaXZhdGVEbnNFbmFibGVkOiB0cnVlLFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFt0aGlzLnZwY2VuZHBvaW50U0ddLFxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBfZ2V0QWlyZmxvd0RCU2VjcmV0KCk6IHNlY3JldHNtYW5hZ2VyLlNlY3JldCB7XG4gICAgY29uc3QgZGF0YWJhc2VTY2VyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdhaXJmbG93LWRiLWNyZWRlbnRpYWxzJywge1xuICAgICAgc2VjcmV0TmFtZTogJ2FpcmZsb3ctZGItY3JlZGVudGlhbHMnLFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgc2VjcmV0U3RyaW5nVGVtcGxhdGU6ICd7XCJ1c2VybmFtZVwiOlwiYWlyZmZsb3dcIn0nLFxuICAgICAgICBnZW5lcmF0ZVN0cmluZ0tleTogJ3Bhc3N3b3JkJyxcbiAgICAgICAgcGFzc3dvcmRMZW5ndGg6IDE2LFxuICAgICAgICBleGNsdWRlQ2hhcmFjdGVyczogJ1xcXCJALycsXG4gICAgICAgIGV4Y2x1ZGVQdW5jdHVhdGlvbjogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgcmV0dXJuIGRhdGFiYXNlU2NlcmV0O1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBEYXRhYmFzZSBmb3IgQWlyZmxvd1xuICAgKiBAcGFyYW0gcHJvcHNcbiAgICogQHBhcmFtIHZwY1xuICAgKiBAcmV0dXJuc1xuICAgKi9cbiAgcHJpdmF0ZSBfZ2V0QWlyZmxvd0RCKHZwYzogZWMyLklWcGMsIGRhdGFiYXNlU2NlcmV0OiBzZWNyZXRzbWFuYWdlci5TZWNyZXQsIGRiTmFtZTogc3RyaW5nKTogcmRzLklEYXRhYmFzZUluc3RhbmNlIHtcbiAgICBjb25zdCBjcmVkZW50aWFscyA9IHJkcy5DcmVkZW50aWFscy5mcm9tU2VjcmV0KGRhdGFiYXNlU2NlcmV0KTtcbiAgICBjb25zdCBkYkluc3RhbmNlID0gbmV3IHJkcy5EYXRhYmFzZUluc3RhbmNlKHRoaXMsICdhaXJmbG93LWRiJywge1xuICAgICAgdnBjLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5JU09MQVRFRCxcbiAgICAgIH0sXG4gICAgICBlbmdpbmU6IHJkcy5EYXRhYmFzZUluc3RhbmNlRW5naW5lLnBvc3RncmVzKHtcbiAgICAgICAgdmVyc2lvbjogcmRzLlBvc3RncmVzRW5naW5lVmVyc2lvbi5WRVJfOV82XzE4LFxuICAgICAgfSksXG4gICAgICBjcmVkZW50aWFscyxcbiAgICAgIGluc3RhbmNlSWRlbnRpZmllcjogJ2FpcmZsb3ctZGInLFxuICAgICAgZGF0YWJhc2VOYW1lOiBkYk5hbWUsXG4gICAgICBwb3J0OiA1NDMyLFxuICAgICAgaW5zdGFuY2VUeXBlOiBlYzIuSW5zdGFuY2VUeXBlLm9mKFxuICAgICAgICBlYzIuSW5zdGFuY2VDbGFzcy5CVVJTVEFCTEUzLFxuICAgICAgICBlYzIuSW5zdGFuY2VTaXplLk1JQ1JPLFxuICAgICAgKSxcbiAgICAgIGFsbG9jYXRlZFN0b3JhZ2U6IDIwLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIHBhcmFtZXRlckdyb3VwOiByZHMuUGFyYW1ldGVyR3JvdXAuZnJvbVBhcmFtZXRlckdyb3VwTmFtZSh0aGlzLCAnYWlyZmxvdy1kYi1wYXJhbWV0ZXJncm91cCcsICdkZWZhdWx0LnBvc3RncmVzOS42JyksXG4gICAgICBkZWxldGlvblByb3RlY3Rpb246IGZhbHNlLFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFt0aGlzLmRhdGFiYXNlU0ddLFxuICAgIH0pO1xuICAgIHJldHVybiBkYkluc3RhbmNlO1xuICB9XG5cbiAgcHJpdmF0ZSBfZ2V0QWlyZmxvd1JlZGlzKHByb3BzOiBBaXJmbG93UHJvcHMsIHZwYzogZWMyLklWcGMpOiBlbGFzdGljYWNoZS5DZm5DYWNoZUNsdXN0ZXIge1xuICAgIGNvbnN0IHJlZGlzTmFtZSA9IHByb3BzLnJlZGlzTmFtZSA/PyAnYWlyZmxvd3JlZGlzJztcbiAgICBjb25zdCByZWRpc0NsdXN0ZXIgPSBuZXcgZWxhc3RpY2FjaGUuQ2ZuQ2FjaGVDbHVzdGVyKHRoaXMsICdhaXJmbG93cmVkaXMnLCB7XG4gICAgICBlbmdpbmU6ICdyZWRpcycsXG4gICAgICBjYWNoZU5vZGVUeXBlOiAnY2FjaGUudDIuc21hbGwnLFxuICAgICAgbnVtQ2FjaGVOb2RlczogMSxcbiAgICAgIHBvcnQ6IDYzNzksXG4gICAgICBjbHVzdGVyTmFtZTogcmVkaXNOYW1lLFxuICAgICAgY2FjaGVTdWJuZXRHcm91cE5hbWU6IG5ldyBlbGFzdGljYWNoZS5DZm5TdWJuZXRHcm91cCh0aGlzLCAncmVkaXNzdWJuZXRzJywge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ0FpcmZsb3cgUmVkaXMgaXNvbGF0ZWQgc3VibmV0IGdyb3VwJyxcbiAgICAgICAgc3VibmV0SWRzOiB2cGMuaXNvbGF0ZWRTdWJuZXRzLm1hcCgoc3VibmV0KSA9PiBzdWJuZXQuc3VibmV0SWQpLFxuICAgICAgfSkucmVmLFxuICAgICAgdnBjU2VjdXJpdHlHcm91cElkczogW3RoaXMucmVkaXNTRy5zZWN1cml0eUdyb3VwSWRdLFxuICAgIH0pO1xuICAgIHJldHVybiByZWRpc0NsdXN0ZXI7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIHRoZSBBcmlmbG93IEVDUyBDbHVzdGVyXG4gICAqIEBwYXJhbSBwcm9wc1xuICAgKiBAcmV0dXJuc1xuICAgKi9cbiAgcHJpdmF0ZSBfZ2V0QWlyZmxvd0VDU0NsdXN0ZXIocHJvcHM6IEFpcmZsb3dQcm9wcywgdnBjOiBlYzIuSVZwYywgYnVja2V0OiBzMy5JQnVja2V0LCBkYXRhYmFzZVNjZXJldDogc2VjcmV0c21hbmFnZXIuU2VjcmV0LFxuICAgIGRhdGFiYXNlOiByZHMuSURhdGFiYXNlSW5zdGFuY2UsIGRiTmFtZTogc3RyaW5nLCByZWRpczogZWxhc3RpY2FjaGUuQ2ZuQ2FjaGVDbHVzdGVyKTogZWNzLkNsdXN0ZXIge1xuICAgIC8vQ3JlYXRlIEVDUyBDbHVzdGVyXG4gICAgY29uc3QgY2x1c3Rlck5hbWUgPSBwcm9wcy5lY3NjbHVzdGVyTmFtZSA/PyAnQWlyZmxvd0VDU0NsdXN0ZXInO1xuICAgIGNvbnN0IGFpcmZsb3dDbHVzdGVyID0gbmV3IGVjcy5DbHVzdGVyKHRoaXMsICdhaXJmbG93LWVjcy1jbHVzdGVyJywge1xuICAgICAgdnBjLFxuICAgICAgY2x1c3Rlck5hbWUsXG4gICAgICBjb250YWluZXJJbnNpZ2h0czogdHJ1ZSxcbiAgICB9KTtcbiAgICAvL0NyZWF0ZSBSb2xlc1xuICAgIGNvbnN0IGV4ZWN1dGlvblJvbGUgPSB0aGlzLl9jcmVhdGVUYXNrRXhlY3V0aW9uUm9sZSgpO1xuICAgIGNvbnN0IHRhc2tSb2xlID0gdGhpcy5fY3JlYXRlVGFza1JvbGUoYnVja2V0KTtcblxuICAgIC8vQ3JlYXRlIExvZyBHcm91cFxuICAgIGNvbnN0IHdlYnNlcnZlckxvZ0dyb3VwID0gdGhpcy5fY3JlYXRlQWlyZmxvd0xvZ0dyb3VwKCdhaXJmbG93LXdlYnNlcnZlci1sZycsICcvZWNzL2FpcmZsb3ctd2Vic2VydmVyJyk7XG4gICAgY29uc3Qgc2NoZWR1bGVyTG9nR3JvdXAgPSB0aGlzLl9jcmVhdGVBaXJmbG93TG9nR3JvdXAoJ2FpcmZsb3ctc2NoZWR1bGVyLWxnJywgJy9lY3MvYWlyZmxvdy1zY2hlZHVsZXInKTtcbiAgICBjb25zdCB3b3JrZXJMb2dHcm91cCA9IHRoaXMuX2NyZWF0ZUFpcmZsb3dMb2dHcm91cCgnYWlyZmxvdy13b3JrZXItbGcnLCAnL2Vjcy9haXJmbG93LXdvcmtlcicpO1xuICAgIHdlYnNlcnZlckxvZ0dyb3VwLmdyYW50V3JpdGUodGFza1JvbGUpO1xuICAgIHNjaGVkdWxlckxvZ0dyb3VwLmdyYW50V3JpdGUodGFza1JvbGUpO1xuICAgIHdvcmtlckxvZ0dyb3VwLmdyYW50V3JpdGUodGFza1JvbGUpO1xuXG4gICAgLy9DcmVhdGUgQWlyZmxvdyBFQ1MgU2VydmljZVxuICAgIHRoaXMuX2NyZWF0ZUFpcmZsb3dXZWJzZXJ2ZXJTZXJ2aWNlKGV4ZWN1dGlvblJvbGUsIHRhc2tSb2xlLCBidWNrZXQsIGRhdGFiYXNlU2NlcmV0LCBkYXRhYmFzZSxcbiAgICAgIGRiTmFtZSwgYWlyZmxvd0NsdXN0ZXIsIHdlYnNlcnZlckxvZ0dyb3VwKTtcbiAgICB0aGlzLl9jcmVhdGVBaXJmbG93U2NoZWR1bGVyU2VydmljZShleGVjdXRpb25Sb2xlLCB0YXNrUm9sZSwgc2NoZWR1bGVyTG9nR3JvdXAsIGJ1Y2tldCwgZGF0YWJhc2VTY2VyZXQsIGRhdGFiYXNlLFxuICAgICAgZGJOYW1lLCByZWRpcywgYWlyZmxvd0NsdXN0ZXIpO1xuICAgIHRoaXMuX2NyZWF0ZUFpcmZsb3dXb3JrZXJTZXJ2aWNlKGV4ZWN1dGlvblJvbGUsIHRhc2tSb2xlLCB3b3JrZXJMb2dHcm91cCwgYnVja2V0LCBkYXRhYmFzZVNjZXJldCwgZGF0YWJhc2UsXG4gICAgICBkYk5hbWUsIHJlZGlzLCBhaXJmbG93Q2x1c3Rlcik7XG5cbiAgICByZXR1cm4gYWlyZmxvd0NsdXN0ZXI7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGxvZyBncm91cCBmb3IgQWlyZmxvdyBFQ1MgQ2x1c3RlclxuICAgKi9cbiAgcHJpdmF0ZSBfY3JlYXRlQWlyZmxvd0xvZ0dyb3VwKGxvZ0dyb3VwSWQ6IHN0cmluZywgbG9nR3JvdXBOYW1lOiBzdHJpbmcpOiBsb2dzLkxvZ0dyb3VwIHtcbiAgICByZXR1cm4gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgbG9nR3JvdXBJZCwge1xuICAgICAgbG9nR3JvdXBOYW1lLFxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgX2NyZWF0ZVRhc2tFeGVjdXRpb25Sb2xlKCk6IGlhbS5Sb2xlIHtcbiAgICBjb25zdCBleGVjdXRpb25Sb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdBaXJmbG93VGFza0V4ZWN1dGlvblJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnZWNzLXRhc2tzLmFtYXpvbmF3cy5jb20nKSxcbiAgICB9KTtcblxuICAgIGV4ZWN1dGlvblJvbGUuYWRkTWFuYWdlZFBvbGljeShpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BbWF6b25FQ1NUYXNrRXhlY3V0aW9uUm9sZVBvbGljeScpKTtcbiAgICBleGVjdXRpb25Sb2xlLmFkZE1hbmFnZWRQb2xpY3koaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdBZG1pbmlzdHJhdG9yQWNjZXNzJykpO1xuICAgIHJldHVybiBleGVjdXRpb25Sb2xlO1xuICB9XG5cbiAgcHJpdmF0ZSBfY3JlYXRlVGFza1JvbGUoYnVja2V0OiBzMy5JQnVja2V0KTogaWFtLlJvbGUge1xuICAgIGNvbnN0IHRhc2tSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdBaXJmbG93VGFza1JvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnZWNzLXRhc2tzLmFtYXpvbmF3cy5jb20nKSxcbiAgICB9KTtcbiAgICB0YXNrUm9sZS5hZGRNYW5hZ2VkUG9saWN5KGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnQWRtaW5pc3RyYXRvckFjY2VzcycpKTtcbiAgICAvL1MzIFBvbGljeVxuICAgIHRhc2tSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3MzOkxpc3RCdWNrZXQnLFxuICAgICAgICAnczM6R2V0T2JqZWN0JyxcbiAgICAgICAgJ3MzOkdldEJ1Y2tldExvY2F0aW9uJyxcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtgJHtidWNrZXQuYnVja2V0QXJufWAsIGAke2J1Y2tldC5idWNrZXRBcm59LypgXSxcbiAgICB9KSk7XG5cbiAgICAvL1NlY3JldHMgTWFuYWdlclxuICAgIHRhc2tSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFsnc2VjcmV0c21hbmFnZXI6R2V0U2VjcmV0VmFsdWUnXSxcbiAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgfSkpO1xuXG4gICAgcmV0dXJuIHRhc2tSb2xlO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBBaXJmbG93IFdlYnNlcnZlciBFQ1MgU2VydmljZVxuICAgKi9cbiAgcHJpdmF0ZSBfY3JlYXRlQWlyZmxvd1dlYnNlcnZlclNlcnZpY2UoZXhlY3V0aW9uUm9sZTogaWFtLklSb2xlLCB0YXNrUm9sZTogaWFtLklSb2xlLFxuICAgIGJ1Y2tldDogczMuSUJ1Y2tldCwgZGF0YWJhc2VTY2VyZXQ6IHNlY3JldHNtYW5hZ2VyLlNlY3JldCwgZGF0YWJhc2U6IHJkcy5JRGF0YWJhc2VJbnN0YW5jZSwgZGJOYW1lOiBzdHJpbmcsXG4gICAgYWlyZmxvd0NsdXN0ZXI6IGVjcy5JQ2x1c3Rlciwgd2Vic2VydmVyTG9nR3JvdXA6IGxvZ3MuSUxvZ0dyb3VwKSB7XG5cbiAgICBjb25zdCBsb2FkQmFsYW5jZWRGYXJnYXRlU2VydmljZSA9IG5ldyBwYXR0ZXJucy5BcHBsaWNhdGlvbkxvYWRCYWxhbmNlZEZhcmdhdGVTZXJ2aWNlKHRoaXMsICdhaXJmbG93LXdlYnNlcnZlci1wYXR0bmVycycsIHtcbiAgICAgIGNsdXN0ZXI6IGFpcmZsb3dDbHVzdGVyLFxuICAgICAgY3B1OiA1MTIsXG4gICAgICBtZW1vcnlMaW1pdE1pQjogMTAyNCxcbiAgICAgIHRhc2tJbWFnZU9wdGlvbnM6IHtcbiAgICAgICAgaW1hZ2U6IGVjcy5Bc3NldEltYWdlLmZyb21Eb2NrZXJJbWFnZUFzc2V0KHRoaXMuX2NyZWF0ZUFpcmZsb3dXZWJTZXJ2aWNlRG9ja2VySW1hZ2UoKSksXG4gICAgICAgIHRhc2tSb2xlLFxuICAgICAgICBleGVjdXRpb25Sb2xlLFxuICAgICAgICBmYW1pbHk6ICdhaXJmbG93LXdlYnNlcnZlci1wYXR0bmVycycsXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgQUlSRkxPV19GRVJORVRfS0VZOiB0aGlzLmZlcm5ldEtleSxcbiAgICAgICAgICBBSVJGTE9XX0RBVEFCQVNFX05BTUU6IGRiTmFtZSxcbiAgICAgICAgICBBSVJGTE9XX0RBVEFCQVNFX1BPUlRfTlVNQkVSOiAnNTQzMicsXG4gICAgICAgICAgQUlSRkxPV19EQVRBQkFTRV9IT1NUOiBkYXRhYmFzZS5kYkluc3RhbmNlRW5kcG9pbnRBZGRyZXNzLFxuICAgICAgICAgIEFJUkZMT1dfRVhFQ1VUT1I6ICdDZWxlcnlFeGVjdXRvcicsXG4gICAgICAgICAgQUlSRkxPV19MT0FEX0VYQU1QTEVTOiAnbm8nLFxuICAgICAgICAgIEFJUkZMT1dfX1NDSEVEVUxFUl9fREFHX0RJUl9MSVNUX0lOVEVSVkFMOiAnMzAnLFxuICAgICAgICAgIEJVQ0tFVF9OQU1FOiBidWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgfSxcbiAgICAgICAgc2VjcmV0czoge1xuICAgICAgICAgIEFJUkZMT1dfREFUQUJBU0VfVVNFUk5BTUU6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKGRhdGFiYXNlU2NlcmV0LCAndXNlcm5hbWUnKSxcbiAgICAgICAgICBBSVJGTE9XX0RBVEFCQVNFX1BBU1NXT1JEOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihkYXRhYmFzZVNjZXJldCwgJ3Bhc3N3b3JkJyksXG4gICAgICAgIH0sXG4gICAgICAgIGNvbnRhaW5lclBvcnQ6IDgwODAsXG4gICAgICAgIGxvZ0RyaXZlcjogZWNzLkxvZ0RyaXZlci5hd3NMb2dzKHtcbiAgICAgICAgICBzdHJlYW1QcmVmaXg6ICdlY3MnLFxuICAgICAgICAgIGxvZ0dyb3VwOiB3ZWJzZXJ2ZXJMb2dHcm91cCxcbiAgICAgICAgfSksXG4gICAgICB9LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFt0aGlzLmFpcmZsb3dFQ1NTZXJ2aWNlU0ddLFxuICAgICAgc2VydmljZU5hbWU6ICdBaXJmbG93V2Vic2VydmVyU2VydmljZU5hbWUnLFxuICAgICAgZGVzaXJlZENvdW50OiAxLFxuICAgICAgbG9hZEJhbGFuY2VyTmFtZTogJ0FpcmZsb3ctV2Vic2VydmVyLUxCJyxcbiAgICAgIGNsb3VkTWFwT3B0aW9uczoge1xuICAgICAgICBuYW1lOiAnd2Vic2VydmVyJyxcbiAgICAgICAgZG5zUmVjb3JkVHlwZTogc2VydmljZWRpc2NvdmVyeS5EbnNSZWNvcmRUeXBlLkEsXG4gICAgICAgIGRuc1R0bDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICBjbG91ZE1hcE5hbWVzcGFjZTogbmV3IHNlcnZpY2VkaXNjb3ZlcnkuUHJpdmF0ZURuc05hbWVzcGFjZSh0aGlzLCAnd2Vic2VydmVyLWRucy1uYW1lc3BhY2UnLCB7XG4gICAgICAgICAgbmFtZTogJ2FpcmZsb3cnLFxuICAgICAgICAgIHZwYzogYWlyZmxvd0NsdXN0ZXIudnBjLFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBsb2FkQmFsYW5jZWRGYXJnYXRlU2VydmljZS50YXJnZXRHcm91cC5jb25maWd1cmVIZWFsdGhDaGVjayh7XG4gICAgICBwYXRoOiAnL2hlYWx0aCcsXG4gICAgICBpbnRlcnZhbDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNjApLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMjApLFxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBBaXJmbG93IFNjaGVkdWxlciBFQ1MgU2VydmljZVxuICAgKi9cbiAgcHJpdmF0ZSBfY3JlYXRlQWlyZmxvd1NjaGVkdWxlclNlcnZpY2UoZXhlY3V0aW9uUm9sZTogaWFtLklSb2xlLCB0YXNrUm9sZTogaWFtLklSb2xlLCBzY2hlZHVsZXJMb2dHcm91cDogbG9ncy5JTG9nR3JvdXAsXG4gICAgYnVja2V0OiBzMy5JQnVja2V0LCBkYXRhYmFzZVNjZXJldDogc2VjcmV0c21hbmFnZXIuU2VjcmV0LCBkYXRhYmFzZTogcmRzLklEYXRhYmFzZUluc3RhbmNlLCBkYk5hbWU6IHN0cmluZywgcmVkaXM6IGVsYXN0aWNhY2hlLkNmbkNhY2hlQ2x1c3RlcixcbiAgICBhaXJmbG93Q2x1c3RlcjogZWNzLklDbHVzdGVyKSB7XG4gICAgLy9DcmVhdGUgVGFzayBEZWZpbml0aW9uXG4gICAgY29uc3Qgc2NoZWR1bGVyVGFzayA9IG5ldyBlY3MuRmFyZ2F0ZVRhc2tEZWZpbml0aW9uKHRoaXMsICdBcmlmbG93U2NoZWR1bGVyVGFzaycsIHtcbiAgICAgIGV4ZWN1dGlvblJvbGUsXG4gICAgICB0YXNrUm9sZSxcbiAgICAgIGNwdTogNTEyLFxuICAgICAgbWVtb3J5TGltaXRNaUI6IDIwNDgsXG4gICAgICBmYW1pbHk6ICdhaXJmbG93LXNjaGVkdWxlcicsXG4gICAgfSk7XG4gICAgc2NoZWR1bGVyVGFzay5hZGRDb250YWluZXIoJ2FpcmZsb3ctc2NoZWR1bGVyLWNvbnRhaW5lcicsIHtcbiAgICAgIGltYWdlOiBlY3MuQXNzZXRJbWFnZS5mcm9tRG9ja2VySW1hZ2VBc3NldCh0aGlzLl9jcmVhdGVBaXJmbG93U2NoZWR1bGVyRG9ja2VySW1hZ2UoKSksXG4gICAgICBsb2dnaW5nOiBuZXcgZWNzLkF3c0xvZ0RyaXZlcih7XG4gICAgICAgIHN0cmVhbVByZWZpeDogJ2VjcycsXG4gICAgICAgIGxvZ0dyb3VwOiBzY2hlZHVsZXJMb2dHcm91cCxcbiAgICAgIH0pLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgQUlSRkxPV19GRVJORVRfS0VZOiB0aGlzLmZlcm5ldEtleSxcbiAgICAgICAgQUlSRkxPV19EQVRBQkFTRV9OQU1FOiBkYk5hbWUsXG4gICAgICAgIEFJUkZMT1dfREFUQUJBU0VfUE9SVF9OVU1CRVI6ICc1NDMyJyxcbiAgICAgICAgQUlSRkxPV19EQVRBQkFTRV9IT1NUOiBkYXRhYmFzZS5kYkluc3RhbmNlRW5kcG9pbnRBZGRyZXNzLFxuICAgICAgICBBSVJGTE9XX0VYRUNVVE9SOiAnQ2VsZXJ5RXhlY3V0b3InLFxuICAgICAgICBBSVJGTE9XX1dFQlNFUlZFUl9IT1NUOiAnd2Vic2VydmVyLmFpcmZsb3cnLFxuICAgICAgICBBSVJGTE9XX0xPQURfRVhBTVBMRVM6ICdubycsXG4gICAgICAgIEFJUkZMT1dfX1NDSEVEVUxFUl9fREFHX0RJUl9MSVNUX0lOVEVSVkFMOiAnMzAnLFxuICAgICAgICBSRURJU19IT1NUOiByZWRpcy5hdHRyUmVkaXNFbmRwb2ludEFkZHJlc3MsXG4gICAgICAgIEJVQ0tFVF9OQU1FOiBidWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIH0sXG4gICAgICBzZWNyZXRzOiB7XG4gICAgICAgIEFJUkZMT1dfREFUQUJBU0VfVVNFUk5BTUU6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKGRhdGFiYXNlU2NlcmV0LCAndXNlcm5hbWUnKSxcbiAgICAgICAgQUlSRkxPV19EQVRBQkFTRV9QQVNTV09SRDogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIoZGF0YWJhc2VTY2VyZXQsICdwYXNzd29yZCcpLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vQ3JlYXRlIEFpcmZsb3dTY2hlZHVsZXJTZXJ2aWNlXG4gICAgbmV3IGVjcy5GYXJnYXRlU2VydmljZSh0aGlzLCAnQWlyZmxvd1NjaGVkdWxlclNlcnZpY2UnLCB7XG4gICAgICBjbHVzdGVyOiBhaXJmbG93Q2x1c3RlcixcbiAgICAgIHRhc2tEZWZpbml0aW9uOiBzY2hlZHVsZXJUYXNrLFxuICAgICAgc2VydmljZU5hbWU6ICdBaXJmbG93U2NoZWR1bGVyU2VydmljZU5hbWUnLFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFt0aGlzLmFpcmZsb3dFQ1NTZXJ2aWNlU0ddLFxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqICBDcmVhdGUgQWlyZmxvdyBXb3JrZXIgRUNTIFNlcnZpY2VcbiAgICovXG4gIHByaXZhdGUgX2NyZWF0ZUFpcmZsb3dXb3JrZXJTZXJ2aWNlKGV4ZWN1dGlvblJvbGU6IGlhbS5JUm9sZSwgdGFza1JvbGU6IGlhbS5JUm9sZSwgd29ya2VyTG9nR3JvdXA6IGxvZ3MuSUxvZ0dyb3VwLFxuICAgIGJ1Y2tldDogczMuSUJ1Y2tldCwgZGF0YWJhc2VTY2VyZXQ6IHNlY3JldHNtYW5hZ2VyLlNlY3JldCwgZGF0YWJhc2U6IHJkcy5JRGF0YWJhc2VJbnN0YW5jZSwgZGJOYW1lOiBzdHJpbmcsIHJlZGlzOiBlbGFzdGljYWNoZS5DZm5DYWNoZUNsdXN0ZXIsXG4gICAgYWlyZmxvd0NsdXN0ZXI6IGVjcy5JQ2x1c3Rlcikge1xuICAgIC8vQ3JlYXRlIFRhc2sgRGVmaW5pdGlvblxuICAgIGNvbnN0IHdvcmtlclRhc2sgPSBuZXcgZWNzLkZhcmdhdGVUYXNrRGVmaW5pdGlvbih0aGlzLCAnQXJpZmxvd3dvcmtlclRhc2snLCB7XG4gICAgICBleGVjdXRpb25Sb2xlLFxuICAgICAgdGFza1JvbGUsXG4gICAgICBjcHU6IDEwMjQsXG4gICAgICBtZW1vcnlMaW1pdE1pQjogMzA3MixcbiAgICAgIGZhbWlseTogJ2FpcmZsb3ctd29ya2VyJyxcbiAgICB9KTtcbiAgICB3b3JrZXJUYXNrLmFkZENvbnRhaW5lcignYWlyZmxvdy13b3JrZXItY29udGFpbmVyJywge1xuICAgICAgaW1hZ2U6IGVjcy5Bc3NldEltYWdlLmZyb21Eb2NrZXJJbWFnZUFzc2V0KHRoaXMuX2NyZWF0ZUFpcmZsb3dXb3JrZXJEb2NrZXJJbWFnZSgpKSxcbiAgICAgIGxvZ2dpbmc6IG5ldyBlY3MuQXdzTG9nRHJpdmVyKHtcbiAgICAgICAgc3RyZWFtUHJlZml4OiAnZWNzJyxcbiAgICAgICAgbG9nR3JvdXA6IHdvcmtlckxvZ0dyb3VwLFxuICAgICAgfSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBBSVJGTE9XX0ZFUk5FVF9LRVk6IHRoaXMuZmVybmV0S2V5LFxuICAgICAgICBBSVJGTE9XX0RBVEFCQVNFX05BTUU6IGRiTmFtZSxcbiAgICAgICAgQUlSRkxPV19EQVRBQkFTRV9QT1JUX05VTUJFUjogJzU0MzInLFxuICAgICAgICBBSVJGTE9XX0RBVEFCQVNFX0hPU1Q6IGRhdGFiYXNlLmRiSW5zdGFuY2VFbmRwb2ludEFkZHJlc3MsXG4gICAgICAgIEFJUkZMT1dfRVhFQ1VUT1I6ICdDZWxlcnlFeGVjdXRvcicsXG4gICAgICAgIEFJUkZMT1dfV0VCU0VSVkVSX0hPU1Q6ICd3ZWJzZXJ2ZXIuYWlyZmxvdycsXG4gICAgICAgIEFJUkZMT1dfTE9BRF9FWEFNUExFUzogJ25vJyxcbiAgICAgICAgQUlSRkxPV19fU0NIRURVTEVSX19EQUdfRElSX0xJU1RfSU5URVJWQUw6ICczMCcsXG4gICAgICAgIFJFRElTX0hPU1Q6IHJlZGlzLmF0dHJSZWRpc0VuZHBvaW50QWRkcmVzcyxcbiAgICAgICAgQlVDS0VUX05BTUU6IGJ1Y2tldC5idWNrZXROYW1lLFxuICAgICAgfSxcbiAgICAgIHNlY3JldHM6IHtcbiAgICAgICAgQUlSRkxPV19EQVRBQkFTRV9VU0VSTkFNRTogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIoZGF0YWJhc2VTY2VyZXQsICd1c2VybmFtZScpLFxuICAgICAgICBBSVJGTE9XX0RBVEFCQVNFX1BBU1NXT1JEOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihkYXRhYmFzZVNjZXJldCwgJ3Bhc3N3b3JkJyksXG4gICAgICB9LFxuICAgICAgcG9ydE1hcHBpbmdzOiBbeyBjb250YWluZXJQb3J0OiA4NzkzIH1dLFxuICAgIH0pO1xuXG4gICAgLy9DcmVhdGUgQWlyZmxvd1dvcmtlclNlcnZpY2VcbiAgICBuZXcgZWNzLkZhcmdhdGVTZXJ2aWNlKHRoaXMsICdBaXJmbG93V29ya2VyU2VydmljZScsIHtcbiAgICAgIGNsdXN0ZXI6IGFpcmZsb3dDbHVzdGVyLFxuICAgICAgdGFza0RlZmluaXRpb246IHdvcmtlclRhc2ssXG4gICAgICBzZXJ2aWNlTmFtZTogJ0FpcmZsb3dXb3JrZXJTZXJ2aWNlTmFtZScsXG4gICAgICBzZWN1cml0eUdyb3VwczogW3RoaXMuYWlyZmxvd0VDU1NlcnZpY2VTR10sXG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIF9jcmVhdGVBaXJmbG93V2ViU2VydmljZURvY2tlckltYWdlKCk6IGFzc2V0cy5Eb2NrZXJJbWFnZUFzc2V0IHtcbiAgICByZXR1cm4gbmV3IGFzc2V0cy5Eb2NrZXJJbWFnZUFzc2V0KHRoaXMsICdhaXJmbG93LXdlYnNlcnZlcicsIHtcbiAgICAgIGRpcmVjdG9yeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy8uLi9kb2NrZXItaW1hZ2VzL2FpcmZsb3ctd2Vic2VydmVyJyksXG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIF9jcmVhdGVBaXJmbG93U2NoZWR1bGVyRG9ja2VySW1hZ2UoKTogYXNzZXRzLkRvY2tlckltYWdlQXNzZXQge1xuICAgIHJldHVybiBuZXcgYXNzZXRzLkRvY2tlckltYWdlQXNzZXQodGhpcywgJ2FpcmZsb3ctc2NoZWR1bGVyJywge1xuICAgICAgZGlyZWN0b3J5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLy4uL2RvY2tlci1pbWFnZXMvYWlyZmxvdy1zY2hlZHVsZXInKSxcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgX2NyZWF0ZUFpcmZsb3dXb3JrZXJEb2NrZXJJbWFnZSgpOiBhc3NldHMuRG9ja2VySW1hZ2VBc3NldCB7XG4gICAgcmV0dXJuIG5ldyBhc3NldHMuRG9ja2VySW1hZ2VBc3NldCh0aGlzLCAnYWlyZmxvdy13b3JrZXInLCB7XG4gICAgICBkaXJlY3Rvcnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcvLi4vZG9ja2VyLWltYWdlcy9haXJmbG93LXdvcmtlcicpLFxuICAgIH0pO1xuICB9XG59Il19