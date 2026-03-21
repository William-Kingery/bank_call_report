#!/usr/bin/env node
import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import { BankCallReportStack } from '../lib/bank-call-report-stack';

const app = new cdk.App();

new BankCallReportStack(app, 'BankCallReportStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  dbName: app.node.tryGetContext('dbName') || 'bank_call_report',
  frontendBuildPath:
    app.node.tryGetContext('frontendBuildPath') || path.join(__dirname, '../../client/out'),
  existingDbName: process.env.EXISTING_DB_NAME || 'usbanks',
  existingDbHost: process.env.EXISTING_DB_HOST || '',
  existingDbPort: process.env.EXISTING_DB_PORT || '3306',
  existingDbUser: process.env.EXISTING_DB_USER || '',
  existingDbPassword: process.env.EXISTING_DB_PASSWORD || '',
});
