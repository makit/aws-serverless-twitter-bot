import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdanode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as events from 'aws-cdk-lib/aws-events';

export interface TweetConstructProps {
  twitterSecret: secretsmanager.ISecret
  plumbingEventBus: events.IEventBus,
}

/**
 * Construct for the Twitter Tweet Activity lambda and associated IAM role
 * @see {@link https://developer.twitter.com/en/docs/twitter-api/tweets/manage-tweets/api-reference/post-tweets}
 */
export default class TweetConstruct extends Construct {

  public readonly lambda : lambda.IFunction;

  constructor(scope: Construct, id: string, props: TweetConstructProps) {
    super(scope, id);

    const role = new iam.Role(this, 'LambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"));
    role.addToPolicy(
      new iam.PolicyStatement({
        resources: [`${props.twitterSecret.secretArn}-*`],
        actions: ['secretsmanager:GetSecretValue'],
      }),
    );

    this.lambda = new lambdanode.NodejsFunction(this, 'lambda', {
      runtime: lambda.Runtime.NODEJS_16_X,
      environment: {
        SecretArn: props.twitterSecret.secretArn,
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