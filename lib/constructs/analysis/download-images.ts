import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdanode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';

export interface DownloadImagesConstructProps {
  bucket: s3.IBucket
}

/**
 * Construct for a lambda (and associated role) to download images from given URLs into S3 and return the list
 */
export default class DownloadImagesConstruct extends Construct {

  public readonly lambda : lambda.IFunction;

  constructor(scope: Construct, id: string, props: DownloadImagesConstructProps) {
    super(scope, id);

    const role = new iam.Role(this, 'LambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"));
    role.addToPolicy(
      new iam.PolicyStatement({
        resources: [`${props.bucket.bucketArn}/*`],
        actions: ['s3:PutObject'],
      }),
    );

    this.lambda = new lambdanode.NodejsFunction(this, 'lambda', {
      runtime: lambda.Runtime.NODEJS_16_X,
      environment: {
        Bucket: props.bucket.bucketName,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
      role,
    });
  }
}