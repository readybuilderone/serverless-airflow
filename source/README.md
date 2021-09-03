# Serverless Airflow on AWS

[![Build](https://github.com/readybuilderone/serverless-airflow/actions/workflows/build.yml/badge.svg)](https://github.com/readybuilderone/serverless-airflow/actions/workflows/build.yml)


## Architecture

![architecture](assets/01-serverless-airflow-on-aws-architecture.svg)

## Sample Code

``` typescript
import * as cdk from '@aws-cdk/core';
import * as airflow from '@cdk-serverless-airflow';

const app = new cdk.App();
const env = {
  region: process.env.CDK_DEFAULT_REGION,
  account: process.env.CDK_DEFAULT_ACCOUNT,
};
const stack = new cdk.Stack(app, 'airflow-stack', {
  env,
});
new airflow.Airflow(stack, 'Airflow');
```

## Airflow Dashboard 
![airflow-dashboard](assets/04-airflow-dashboard.jpg)

