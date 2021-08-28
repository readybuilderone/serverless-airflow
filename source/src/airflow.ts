// import * as path from 'path';
import * as s3 from '@aws-cdk/aws-s3';
import * as cdk from '@aws-cdk/core';
import * as ecs from '@aws-cdk/aws-ecs';
// import * as assets from '@aws-cdk/aws-ecr-assets';

export interface AirflowProps{
  readonly bucketName?: string;
}

export class Airflow extends cdk.Construct {

  constructor(scope: cdk.Construct, id:string, props: AirflowProps= {}) {
    super(scope, id);

    const airflowBucket = this._getAirflowBucket(props);
    console.log(airflowBucket.bucketName);

    this._getAirflowECSCluster(props);

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