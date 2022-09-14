import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdanode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as events from 'aws-cdk-lib/aws-events';

export interface ProcessImagesConstructProps {
  bucket: s3.IBucket,
  plumbingEventBus: events.IEventBus,
}

/**
 * Construct for a lambda (and associated role) to process an analysed image for responding.
 */
export default class ProcessImagesConstruct extends Construct {

  public readonly lambda : lambda.IFunction;

  constructor(scope: Construct, id: string, props: ProcessImagesConstructProps) {
    super(scope, id);

    const role = new iam.Role(this, 'LambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"));
    role.addToPolicy(
      new iam.PolicyStatement({
        resources: [`${props.bucket.bucketArn}/*`],
        actions: ['s3:GetObject', 's3:PutObject'],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        resources: [props.plumbingEventBus.eventBusArn],
        actions: ['events:PutEvents'],
      }),
    );

    // From https://github.com/rpidanny/gm-lambda-layer
    const layer = lambda.LayerVersion.fromLayerVersionArn(this, 'GMLayer', 'arn:aws:lambda:eu-west-1:175033217214:layer:graphicsmagick:2');

    this.lambda = new lambdanode.NodejsFunction(this, 'lambda', {
      runtime: lambda.Runtime.NODEJS_16_X,
      layers: [layer],
      environment: {
        Bucket: props.bucket.bucketName,
        EventBusName: props.plumbingEventBus.eventBusName,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
      timeout: cdk.Duration.seconds(5),
      memorySize: 256,
      role,
    });
  }
}