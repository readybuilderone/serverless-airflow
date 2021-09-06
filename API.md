# API Reference <a name="API Reference"></a>

## Constructs <a name="Constructs"></a>

### Foo <a name="cdk-serverless-airflow.Foo"></a>

#### Initializer <a name="cdk-serverless-airflow.Foo.Initializer"></a>

```typescript
import { Foo } from 'cdk-serverless-airflow'

new Foo(scope: Construct, id: string, props?: FooProps)
```

##### `scope`<sup>Required</sup> <a name="cdk-serverless-airflow.Foo.parameter.scope"></a>

- *Type:* [`@aws-cdk/core.Construct`](#@aws-cdk/core.Construct)

---

##### `id`<sup>Required</sup> <a name="cdk-serverless-airflow.Foo.parameter.id"></a>

- *Type:* `string`

---

##### `props`<sup>Optional</sup> <a name="cdk-serverless-airflow.Foo.parameter.props"></a>

- *Type:* [`cdk-serverless-airflow.FooProps`](#cdk-serverless-airflow.FooProps)

---



#### Properties <a name="Properties"></a>

##### `endpoint`<sup>Required</sup> <a name="cdk-serverless-airflow.Foo.property.endpoint"></a>

- *Type:* `string`

---


## Structs <a name="Structs"></a>

### FooProps <a name="cdk-serverless-airflow.FooProps"></a>

#### Initializer <a name="[object Object].Initializer"></a>

```typescript
import { FooProps } from 'cdk-serverless-airflow'

const fooProps: FooProps = { ... }
```

##### `vpc`<sup>Optional</sup> <a name="cdk-serverless-airflow.FooProps.property.vpc"></a>

- *Type:* [`@aws-cdk/aws-ec2.IVpc`](#@aws-cdk/aws-ec2.IVpc)

---



