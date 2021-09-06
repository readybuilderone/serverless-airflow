import * as ec2 from '@aws-cdk/aws-ec2';
import * as cdk from '@aws-cdk/core';
/**
 * @stability stable
 */
export interface FooProps {
    /**
     * @stability stable
     */
    readonly vpc?: ec2.IVpc;
}
/**
 * @stability stable
 */
export declare class Foo extends cdk.Construct {
    /**
     * @stability stable
     */
    readonly endpoint: string;
    /**
     * @stability stable
     */
    constructor(scope: cdk.Construct, id: string, props?: FooProps);
}
