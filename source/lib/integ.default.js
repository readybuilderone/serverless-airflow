"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegTesting = void 0;
const cdk = require("@aws-cdk/core");
const airflow = require("./airflow");
class IntegTesting {
    constructor() {
        const app = new cdk.App();
        const env = {
            region: process.env.CDK_DEFAULT_REGION,
            account: process.env.CDK_DEFAULT_ACCOUNT,
        };
        const stack = new cdk.Stack(app, 'airflow-stack', {
            env,
        });
        // const vpc = ec2.Vpc.fromLookup(stack, 'Vpc', { isDefault: true });
        new airflow.Airflow(stack, 'Airflow');
        this.stack = [stack];
    }
    ;
}
exports.IntegTesting = IntegTesting;
// run the integ testing
new IntegTesting();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZWcuZGVmYXVsdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9pbnRlZy5kZWZhdWx0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLHFDQUFxQztBQUNyQyxxQ0FBcUM7QUFFckMsTUFBYSxZQUFZO0lBR3ZCO1FBQ0UsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDMUIsTUFBTSxHQUFHLEdBQUc7WUFDVixNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0I7WUFDdEMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CO1NBQ3pDLENBQUM7UUFDRixNQUFNLEtBQUssR0FBRyxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLGVBQWUsRUFBRTtZQUNoRCxHQUFHO1NBQ0osQ0FBQyxDQUFDO1FBRUgscUVBQXFFO1FBQ3JFLElBQUksT0FBTyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDdEMsSUFBSSxDQUFDLEtBQUssR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3ZCLENBQUM7SUFBQSxDQUFDO0NBQ0g7QUFqQkQsb0NBaUJDO0FBRUQsd0JBQXdCO0FBQ3hCLElBQUksWUFBWSxFQUFFLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnQGF3cy1jZGsvY29yZSc7XG5pbXBvcnQgKiBhcyBhaXJmbG93IGZyb20gJy4vYWlyZmxvdyc7XG5cbmV4cG9ydCBjbGFzcyBJbnRlZ1Rlc3Rpbmcge1xuICByZWFkb25seSBzdGFjazogY2RrLlN0YWNrW107XG5cbiAgY29uc3RydWN0b3IoKSB7XG4gICAgY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcbiAgICBjb25zdCBlbnYgPSB7XG4gICAgICByZWdpb246IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTixcbiAgICAgIGFjY291bnQ6IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQsXG4gICAgfTtcbiAgICBjb25zdCBzdGFjayA9IG5ldyBjZGsuU3RhY2soYXBwLCAnYWlyZmxvdy1zdGFjaycsIHtcbiAgICAgIGVudixcbiAgICB9KTtcblxuICAgIC8vIGNvbnN0IHZwYyA9IGVjMi5WcGMuZnJvbUxvb2t1cChzdGFjaywgJ1ZwYycsIHsgaXNEZWZhdWx0OiB0cnVlIH0pO1xuICAgIG5ldyBhaXJmbG93LkFpcmZsb3coc3RhY2ssICdBaXJmbG93Jyk7XG4gICAgdGhpcy5zdGFjayA9IFtzdGFja107XG4gIH07XG59XG5cbi8vIHJ1biB0aGUgaW50ZWcgdGVzdGluZ1xubmV3IEludGVnVGVzdGluZygpOyJdfQ==