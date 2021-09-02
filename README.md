# Serverless Airflow on AWS
Apache Airflow 是一项由 Airbnb 在 2014 年 推出的开源项目，其目的是为了管理日益复杂的数据管理工具、脚本和分析工具，提供一个构建批处理工作流的方案。Airflow是一种可扩展的分布式工作流调度系统，允许将工作流建模为有向无环图（DAGs），通过这种方式简化数据管道中各个处理步骤的创建、编排和监控。

在Airflow中，开发者可以用Python创建DAGs(有向无环图)，创建可相互连接和以来的任务集，从而实现自动化的工作流。Airflow被广泛应于于机器学习、数据分析/处理以及各类需要流程化的场景。

Airflow由WebServer/Scheduler/Worker等组件构成，搭建和运维并不简单，为方便用户，AWS也推出了托管的Airflow服务[MWAA](https://aws.amazon.com/cn/managed-workflows-for-apache-airflow/),但这项服务目前在中国区的北京和宁夏两个Reigon并没有落地，中国区的客户需要在AWS上自行去搭建Airflow。

费良宏老师曾经写过一篇[博客](https://aws.amazon.com/cn/blogs/china/deploy-apache-airflow-to-the-cloud/) 来简要介绍如何通过Pip在单机上安装Airflow，也曾经坦言：“在AWS部署Airflow并不是一件简单的事情，需要考虑到很多的细节，尤其是要设计好扩展策略，以及与AWS 服务的整合。”。

这里提出了一个基于Fargate将Airflow高可用部署在AWS的解决方案，并封装成了CDK的Construct，可以只使用数行代码部署一个Airflow集群。

Serverless Airflow 简介；

## 架构图
![architecture](assets/01-serverless-airflow-on-aws-architecture.png)

架构说明
1. a
2. b
3. c


## 部署指南
### 说明
pass

### 例子
pass

### 常见问题
pass

### Licence
pass
