import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as events from 'aws-cdk-lib/aws-events';
import TwitterConstruct from '../constructs/ingress/twitter-construct';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export interface IngressStackProps extends cdk.StackProps {
  plumbingEventBus: events.IEventBus
}

/**
 * Stack that handles the ingress of data and outputs into the plumbling event bus.
 */
export class IngressStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: IngressStackProps) {
    super(scope, id, props);

    // The secret is manually added, see README for more details, but this is the AWS Recommended way to
    // ensure it is not stored in Git or shared around as environment variables/parameters.
    const twitterSecret = secretsmanager.Secret.fromSecretAttributes(this, 'TwitterSecret', {
      secretPartialArn: `arn:aws:secretsmanager:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:secret:TwitterSecret`
    });

    // This contains the lambda that we will proxy to from API Gateway
    const construct = new TwitterConstruct(this, 'TwitterActivity', {
      twitterSecret,
      plumbingEventBus: props.plumbingEventBus,
    });

    // Proxy to false so we can define the API model
    const api = new apigateway.LambdaRestApi(this, 'ingress-api', {
      handler: construct.lambda,
      proxy: false,
    });

    const twitterEndpoint = api.root.addResource('twitter');
    twitterEndpoint.addMethod('GET');
    twitterEndpoint.addMethod('POST');
  }
}
