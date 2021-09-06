# API Reference <a name="API Reference"></a>

## Constructs <a name="Constructs"></a>

### Airflow <a name="cdk-serverless-airflow.Airflow"></a>

#### Initializer <a name="cdk-serverless-airflow.Airflow.Initializer"></a>

```typescript
import { Airflow } from 'cdk-serverless-airflow'

new Airflow(scope: Construct, id: string, props?: AirflowProps)
```

##### `scope`<sup>Required</sup> <a name="cdk-serverless-airflow.Airflow.parameter.scope"></a>

- *Type:* [`@aws-cdk/core.Construct`](#@aws-cdk/core.Construct)

---

##### `id`<sup>Required</sup> <a name="cdk-serverless-airflow.Airflow.parameter.id"></a>

- *Type:* `string`

---

##### `props`<sup>Optional</sup> <a name="cdk-serverless-airflow.Airflow.parameter.props"></a>

- *Type:* [`cdk-serverless-airflow.AirflowProps`](#cdk-serverless-airflow.AirflowProps)

---





## Structs <a name="Structs"></a>

### AirflowProps <a name="cdk-serverless-airflow.AirflowProps"></a>

#### Initializer <a name="[object Object].Initializer"></a>

```typescript
import { AirflowProps } from 'cdk-serverless-airflow'

const airflowProps: AirflowProps = { ... }
```

##### `airflowFernetKey`<sup>Optional</sup> <a name="cdk-serverless-airflow.AirflowProps.property.airflowFernetKey"></a>

- *Type:* `string`

---

##### `bucketName`<sup>Optional</sup> <a name="cdk-serverless-airflow.AirflowProps.property.bucketName"></a>

- *Type:* `string`

---

##### `dbName`<sup>Optional</sup> <a name="cdk-serverless-airflow.AirflowProps.property.dbName"></a>

- *Type:* `string`

---

##### `ecsclusterName`<sup>Optional</sup> <a name="cdk-serverless-airflow.AirflowProps.property.ecsclusterName"></a>

- *Type:* `string`

---

##### `redisName`<sup>Optional</sup> <a name="cdk-serverless-airflow.AirflowProps.property.redisName"></a>

- *Type:* `string`

---

##### `vpcName`<sup>Optional</sup> <a name="cdk-serverless-airflow.AirflowProps.property.vpcName"></a>

- *Type:* `string`

---



