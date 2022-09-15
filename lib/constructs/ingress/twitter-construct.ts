import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdanode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as events from 'aws-cdk-lib/aws-events';

export interface TwitterConstructProps {
  twitterSecret: secretsmanager.ISecret
  plumbingEventBus: events.IEventBus,
  twitterIdOfAccount: number
}

/**
 * Construct for the Twitter Twitter Activity lambda and associated IAM role
 * @see {@link https://developer.twitter.com/en/docs/twitter-api/enterprise/account-activity-api/guides/account-activity-data-objects}
 */
export default class TwitterConstruct extends Construct {

  public readonly lambda : lambda.IFunction;

  constructor(scope: Construct, id: string, props: TwitterConstructProps) {
    super(scope, id);

    const role = new iam.Role(this, 'LambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'));
    role.addToPolicy(
      new iam.PolicyStatement({
        resources: [`${props.twitterSecret.secretArn}-*`],
        actions: ['secretsmanager:GetSecretValue'],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        resources: [props.plumbingEventBus.eventBusArn],
        actions: ['events:PutEvents'],
      }),
    );

    this.lambda = new lambdanode.NodejsFunction(this, 'lambda', {
      runtime: lambda.Runtime.NODEJS_16_X,
      environment: {
        SecretArn: props.twitterSecret.secretArn,
        EventBusName: props.plumbingEventBus.eventBusName,
        TwitterIdOfAccount: props.twitterIdOfAccount.toString(),
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