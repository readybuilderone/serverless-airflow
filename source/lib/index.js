"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Foo = void 0;
const JSII_RTTI_SYMBOL_1 = Symbol.for("jsii.rtti");
const ec2 = require("@aws-cdk/aws-ec2");
const ecs = require("@aws-cdk/aws-ecs");
const ecsPatterns = require("@aws-cdk/aws-ecs-patterns");
const cdk = require("@aws-cdk/core");
/**
 * @stability stable
 */
class Foo extends cdk.Construct {
    /**
     * @stability stable
     */
    constructor(scope, id, props = {}) {
        var _b;
        super(scope, id);
        const vpc = (_b = props.vpc) !== null && _b !== void 0 ? _b : new ec2.Vpc(this, 'Vpc', {
            natGateways: 1,
        });
        const svc = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'nginx-service', {
            vpc,
            taskImageOptions: {
                image: ecs.ContainerImage.fromRegistry('public.ecr.aws/k5r2e2q2/amazon-ecs-sample:latest'),
            },
            assignPublicIp: true,
        });
        this.endpoint = `http://${svc.loadBalancer.loadBalancerDnsName}`;
    }
}
exports.Foo = Foo;
_a = JSII_RTTI_SYMBOL_1;
Foo[_a] = { fqn: "source.Foo", version: "0.0.0" };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSx3Q0FBd0M7QUFDeEMsd0NBQXdDO0FBQ3hDLHlEQUF5RDtBQUN6RCxxQ0FBcUM7Ozs7QUFNckMsTUFBYSxHQUFJLFNBQVEsR0FBRyxDQUFDLFNBQVM7Ozs7SUFFcEMsWUFBWSxLQUFvQixFQUFFLEVBQVUsRUFBRSxRQUFpQixFQUFFOztRQUMvRCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sR0FBRyxTQUFHLEtBQUssQ0FBQyxHQUFHLG1DQUFJLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFO1lBQ2hELFdBQVcsRUFBRSxDQUFDO1NBQ2YsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxHQUFHLEdBQUcsSUFBSSxXQUFXLENBQUMscUNBQXFDLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUN2RixHQUFHO1lBQ0gsZ0JBQWdCLEVBQUU7Z0JBQ2hCLEtBQUssRUFBRSxHQUFHLENBQUMsY0FBYyxDQUFDLFlBQVksQ0FBQyxrREFBa0QsQ0FBQzthQUMzRjtZQUNELGNBQWMsRUFBRSxJQUFJO1NBQ3JCLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxRQUFRLEdBQUcsVUFBVSxHQUFHLENBQUMsWUFBWSxDQUFDLG1CQUFtQixFQUFFLENBQUM7SUFDbkUsQ0FBQzs7QUFqQkgsa0JBa0JDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgZWMyIGZyb20gJ0Bhd3MtY2RrL2F3cy1lYzInO1xuaW1wb3J0ICogYXMgZWNzIGZyb20gJ0Bhd3MtY2RrL2F3cy1lY3MnO1xuaW1wb3J0ICogYXMgZWNzUGF0dGVybnMgZnJvbSAnQGF3cy1jZGsvYXdzLWVjcy1wYXR0ZXJucyc7XG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnQGF3cy1jZGsvY29yZSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRm9vUHJvcHMge1xuICByZWFkb25seSB2cGM/OiBlYzIuSVZwYztcbn1cblxuZXhwb3J0IGNsYXNzIEZvbyBleHRlbmRzIGNkay5Db25zdHJ1Y3Qge1xuICByZWFkb25seSBlbmRwb2ludDogc3RyaW5nO1xuICBjb25zdHJ1Y3RvcihzY29wZTogY2RrLkNvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEZvb1Byb3BzID17fSkge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCB2cGMgPSBwcm9wcy52cGMgPz8gbmV3IGVjMi5WcGModGhpcywgJ1ZwYycsIHtcbiAgICAgIG5hdEdhdGV3YXlzOiAxLFxuICAgIH0pO1xuICAgIGNvbnN0IHN2YyA9IG5ldyBlY3NQYXR0ZXJucy5BcHBsaWNhdGlvbkxvYWRCYWxhbmNlZEZhcmdhdGVTZXJ2aWNlKHRoaXMsICduZ2lueC1zZXJ2aWNlJywge1xuICAgICAgdnBjLFxuICAgICAgdGFza0ltYWdlT3B0aW9uczoge1xuICAgICAgICBpbWFnZTogZWNzLkNvbnRhaW5lckltYWdlLmZyb21SZWdpc3RyeSgncHVibGljLmVjci5hd3MvazVyMmUycTIvYW1hem9uLWVjcy1zYW1wbGU6bGF0ZXN0JyksXG4gICAgICB9LFxuICAgICAgYXNzaWduUHVibGljSXA6IHRydWUsXG4gICAgfSk7XG5cbiAgICB0aGlzLmVuZHBvaW50ID0gYGh0dHA6Ly8ke3N2Yy5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZX1gO1xuICB9XG59Il19