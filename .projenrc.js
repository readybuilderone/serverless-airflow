const { AwsCdkConstructLibrary } = require('projen');
const project = new AwsCdkConstructLibrary({
  author: 'readybuilderone',
  authorAddress: 'neohan2016@outlook.com',
  cdkVersion: '1.95.2',
  defaultReleaseBranch: 'main',
  name: 'cdk-serverless-airflow',
  repositoryUrl: 'https://github.com/readybuilderone/serverless-airflow.git',
  cdkDependencies: [
    '@aws-cdk/core',
    '@aws-cdk/aws-ec2',
    '@aws-cdk/aws-ecs',
    '@aws-cdk/aws-iam',
    '@aws-cdk/aws-s3',
    '@aws-cdk/aws-secretsmanager',
    '@aws-cdk/aws-rds',
    '@aws-cdk/aws-elasticache',
    '@aws-cdk/aws-ecr-assets',
    '@aws-cdk/aws-ecr',
    '@aws-cdk/aws-events',
    '@aws-cdk/aws-logs',
    '@aws-cdk/aws-ecs-patterns',
    '@aws-cdk/aws-servicediscovery',
  ],

  publishToPypi: {
    distName: 'cdk-serverless-airflow',
    module: 'cdk_serverless_airflow',
  },
  keywords: [
    'cdk',
    'airflow',
    'apache airflow',
    'aws',
    'aws-cdk',
  ],
});

const common_exclude = ['cdk.out', 'cdk.context.json', 'images', 'yarn-error.log', '.DS_Store', 'test/__snapshots__/integ.snapshot.test.ts.snap'];
project.npmignore.exclude(...common_exclude);
project.gitignore.exclude(...common_exclude);

project.synth();