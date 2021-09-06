const { AwsCdkConstructLibrary } = require('projen');
const project = new AwsCdkConstructLibrary({
  author: 'readybuilderone',
  authorAddress: 'neohan2016@outlook.com',
  cdkVersion: '1.95.2',
  defaultReleaseBranch: 'main',
  name: 'source',
  repositoryUrl: 'https://github.com/readybuilderone/serverless-airflow.git',

  // cdkDependencies: undefined,        /* Which AWS CDK modules (those that start with "@aws-cdk/") does this library require when consumed? */
  // cdkTestDependencies: undefined,    /* AWS CDK modules required for testing. */
  // deps: [],                          /* Runtime dependencies of this module. */
  // description: undefined,            /* The description is just a string that helps people understand the purpose of the package. */
  // devDeps: [],                       /* Build dependencies for this module. */
  // packageName: undefined,            /* The "name" in package.json. */
  // projectType: ProjectType.UNKNOWN,  /* Which type of project this is (library/app). */
  // release: undefined,                /* Add release management to this project. */
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
});

const common_exclude = ['cdk.out', 'cdk.context.json', 'images', 'yarn-error.log', '.DS_Store', 'test/__snapshots__/integ.snapshot.test.ts.snap'];
project.npmignore.exclude(...common_exclude);
project.gitignore.exclude(...common_exclude);

project.synth();