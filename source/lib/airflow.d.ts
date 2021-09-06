import * as cdk from '@aws-cdk/core';
export interface AirflowProps {
    readonly bucketName?: string;
    readonly vpcName?: string;
    readonly dbName?: string;
    readonly redisName?: string;
    readonly ecsclusterName?: string;
    readonly airflowFernetKey?: string;
}
export declare class Airflow extends cdk.Construct {
    private readonly fernetKey;
    private readonly airflowECSServiceSG;
    private readonly vpcendpointSG;
    private readonly redisSG;
    private readonly databaseSG;
    constructor(scope: cdk.Construct, id: string, props?: AirflowProps);
    /**
     * Create Security Group
     * @param vpc
     * @param securityGroupName
     * @returns
     */
    private _createSecurityGroup;
    /**
     * Setting rules for security groups
     */
    private _configSecurityGroup;
    /**
     * Create a S3 bucket for airflow to synch the DAG.
     * If the bucket name is provided in the props, it will use
     * @param props
     * @returns
     */
    private _getAirflowBucket;
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
    private _getAirflowVPC;
    /**
     * Create VPC Endpoints
     * @param vpc
     */
    private _createVPCEndpoints;
    private _getAirflowDBSecret;
    /**
     * Get Database for Airflow
     * @param props
     * @param vpc
     * @returns
     */
    private _getAirflowDB;
    private _getAirflowRedis;
    /**
     * Create the Ariflow ECS Cluster
     * @param props
     * @returns
     */
    private _getAirflowECSCluster;
    /**
     * Create log group for Airflow ECS Cluster
     */
    private _createAirflowLogGroup;
    private _createTaskExecutionRole;
    private _createTaskRole;
    /**
     * Create Airflow Webserver ECS Service
     */
    private _createAirflowWebserverService;
    /**
     * Create Airflow Scheduler ECS Service
     */
    private _createAirflowSchedulerService;
    /**
     *  Create Airflow Worker ECS Service
     */
    private _createAirflowWorkerService;
    private _createAirflowWebServiceDockerImage;
    private _createAirflowSchedulerDockerImage;
    private _createAirflowWorkerDockerImage;
}
