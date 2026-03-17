import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as apprunner from 'aws-cdk-lib/aws-apprunner';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export interface BankCallReportStackProps extends cdk.StackProps {
  dbName: string;
  frontendBuildPath: string;
}

export class BankCallReportStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BankCallReportStackProps) {
    super(scope, id, props);

    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'FrontendOAI');
    frontendBucket.grantRead(originAccessIdentity);

    const frontendDistribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: new origins.S3Origin(frontendBucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(1),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(1),
        },
      ],
    });

    new s3deploy.BucketDeployment(this, 'FrontendDeployment', {
      destinationBucket: frontendBucket,
      distribution: frontendDistribution,
      distributionPaths: ['/*'],
      sources: [s3deploy.Source.asset(props.frontendBuildPath)],
    });

    const vpc = new ec2.Vpc(this, 'AppVpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    const appRunnerVpcConnectorSg = new ec2.SecurityGroup(this, 'AppRunnerConnectorSg', {
      vpc,
      description: 'App Runner VPC connector security group',
      allowAllOutbound: true,
    });

    const dbSg = new ec2.SecurityGroup(this, 'DbSg', {
      vpc,
      description: 'RDS MySQL security group',
      allowAllOutbound: true,
    });
    dbSg.addIngressRule(appRunnerVpcConnectorSg, ec2.Port.tcp(3306), 'Allow App Runner');

    const dbCredentialsSecret = new secretsmanager.Secret(this, 'DbCredentialsSecret', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'app_user' }),
        generateStringKey: 'password',
        excludePunctuation: true,
      },
    });

    const dbInstance = new rds.DatabaseInstance(this, 'Database', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0_39,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      storageEncrypted: true,
      multiAz: false,
      publiclyAccessible: false,
      backupRetention: cdk.Duration.days(7),
      credentials: rds.Credentials.fromSecret(dbCredentialsSecret),
      databaseName: props.dbName,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      deletionProtection: false,
    });

    const apiImage = new ecrAssets.DockerImageAsset(this, 'ApiImageAsset', {
      directory: path.join(__dirname, '../../server'),
    });

    const appRunnerEcrAccessRole = new iam.Role(this, 'AppRunnerEcrAccessRole', {
      assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSAppRunnerServicePolicyForECRAccess'
        ),
      ],
    });
    apiImage.repository.grantPull(appRunnerEcrAccessRole);

    const appRunnerInstanceRole = new iam.Role(this, 'AppRunnerInstanceRole', {
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
    });
    dbCredentialsSecret.grantRead(appRunnerInstanceRole);

    const vpcConnector = new apprunner.CfnVpcConnector(this, 'ApiVpcConnector', {
      vpcConnectorName: `${cdk.Stack.of(this).stackName.toLowerCase()}-apivpc`,
      subnets: vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }).subnetIds,
      securityGroups: [appRunnerVpcConnectorSg.securityGroupId],
    });

    const secretArn = dbCredentialsSecret.secretArn;
    const apiService = new apprunner.CfnService(this, 'ApiService', {
      serviceName: 'bank-call-report-api',
      sourceConfiguration: {
        authenticationConfiguration: {
          accessRoleArn: appRunnerEcrAccessRole.roleArn,
        },
        autoDeploymentsEnabled: false,
        imageRepository: {
          imageIdentifier: apiImage.imageUri,
          imageRepositoryType: 'ECR',
          imageConfiguration: {
            port: '4000',
            runtimeEnvironmentVariables: [
              { name: 'DB_HOST', value: dbInstance.dbInstanceEndpointAddress },
              { name: 'DB_PORT', value: dbInstance.dbInstanceEndpointPort },
              { name: 'DB_NAME', value: props.dbName },
              {
                name: 'CORS_ORIGIN',
                value: `https://${frontendDistribution.distributionDomainName}`,
              },
            ],
            runtimeEnvironmentSecrets: [
              { name: 'DB_USER', value: `${secretArn}:username::` },
              { name: 'DB_PASSWORD', value: `${secretArn}:password::` },
            ],
          },
        },
      },
      healthCheckConfiguration: {
        protocol: 'HTTP',
        path: '/api/health',
        healthyThreshold: 1,
        unhealthyThreshold: 5,
        interval: 10,
        timeout: 5,
      },
      instanceConfiguration: {
        cpu: '1024',
        memory: '2048',
        instanceRoleArn: appRunnerInstanceRole.roleArn,
      },
      networkConfiguration: {
        ingressConfiguration: {
          isPubliclyAccessible: true,
        },
        egressConfiguration: {
          egressType: 'VPC',
          vpcConnectorArn: vpcConnector.attrVpcConnectorArn,
        },
      },
    });

    apiService.addDependency(vpcConnector);

    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `https://${frontendDistribution.distributionDomainName}`,
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: apiService.attrServiceUrl,
    });

    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: dbInstance.dbInstanceEndpointAddress,
    });

    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: dbCredentialsSecret.secretArn,
    });
  }
}
