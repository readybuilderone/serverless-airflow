import * as ecr from '@aws-cdk/aws-ecr';
import * as s3 from '@aws-cdk/aws-s3';
import * as cdk from '@aws-cdk/core';

export interface AirflowProps{
  readonly bucketName?: string;
}

export class Airflow extends cdk.Construct {
  readonly airflowWebserverEcrRepo: ecr.Repository;
  readonly airflowSchedulerEcrRepo: ecr.Repository;
  readonly airflowWorkerEcrRepo: ecr.Repository;

  constructor(scope: cdk.Construct, id:string, props: AirflowProps= {}) {
    super(scope, id);

    //initialize ECR repository
    this.airflowWebserverEcrRepo = new ecr.Repository(this, 'AirflowWebserverRepo', {
      repositoryName: 'airflow-webserver-repo',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.airflowSchedulerEcrRepo = new ecr.Repository(this, 'AirflowSchedulerRepo', {
      repositoryName: 'airflow-scheduler-repo',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.airflowWorkerEcrRepo = new ecr.Repository(this, 'AirflowWorkerRepo', {
      repositoryName: 'airflow-worke-repo',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

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
    });

    console.log(airflowBucket.bucketName);
  }
}