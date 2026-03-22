#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("node:path"));
const cdk = __importStar(require("aws-cdk-lib"));
const bank_call_report_stack_1 = require("../lib/bank-call-report-stack");
const app = new cdk.App();
new bank_call_report_stack_1.BankCallReportStack(app, 'BankCallReportStack', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
    },
    dbName: app.node.tryGetContext('dbName') || 'bank_call_report',
    frontendBuildPath: app.node.tryGetContext('frontendBuildPath') || path.join(__dirname, '../../client/out'),
    existingDbName: process.env.EXISTING_DB_NAME || 'usbanks',
    existingDbHost: process.env.EXISTING_DB_HOST || '',
    existingDbPort: process.env.EXISTING_DB_PORT || '3306',
    existingDbUser: process.env.EXISTING_DB_USER || '',
    existingDbPassword: process.env.EXISTING_DB_PASSWORD || '',
});
