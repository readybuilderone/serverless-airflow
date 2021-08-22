# API Reference <a name="API Reference"></a>

## Constructs <a name="Constructs"></a>

### Foo <a name="source.Foo"></a>

#### Initializer <a name="source.Foo.Initializer"></a>

```typescript
import { Foo } from 'source'

new Foo(scope: Construct, id: string, props?: FooProps)
```

##### `scope`<sup>Required</sup> <a name="source.Foo.parameter.scope"></a>

- *Type:* [`@aws-cdk/core.Construct`](#@aws-cdk/core.Construct)

---

##### `id`<sup>Required</sup> <a name="source.Foo.parameter.id"></a>

- *Type:* `string`

---

##### `props`<sup>Optional</sup> <a name="source.Foo.parameter.props"></a>

- *Type:* [`source.FooProps`](#source.FooProps)

---



#### Properties <a name="Properties"></a>

##### `endpoint`<sup>Required</sup> <a name="source.Foo.property.endpoint"></a>

- *Type:* `string`

---


## Structs <a name="Structs"></a>

### FooProps <a name="source.FooProps"></a>

#### Initializer <a name="[object Object].Initializer"></a>

```typescript
import { FooProps } from 'source'

const fooProps: FooProps = { ... }
```

##### `vpc`<sup>Optional</sup> <a name="source.FooProps.property.vpc"></a>

- *Type:* [`@aws-cdk/aws-ec2.IVpc`](#@aws-cdk/aws-ec2.IVpc)

---



