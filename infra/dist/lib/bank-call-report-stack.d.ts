import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
export interface BankCallReportStackProps extends cdk.StackProps {
    dbName: string;
    frontendBuildPath: string;
    existingDbName: string;
    existingDbHost: string;
    existingDbPort: string;
    existingDbUser: string;
    existingDbPassword: string;
}
export declare class BankCallReportStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: BankCallReportStackProps);
}
