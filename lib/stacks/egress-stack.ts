import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import TweetConstruct from '../constructs/egress/tweet-construct';

export interface EgressStackProps extends cdk.StackProps {
  plumbingEventBus: events.IEventBus,
}

/**
 * Stack that subscribes to events from event bridge for sending messages back to the source, such as a Twitter reply.
 */
export class EgressStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EgressStackProps) {
    super(scope, id, props);

    // The secret is manually added, see README for more details, but this is the AWS Recommended way to
    // ensure it is not stored in Git or shared around as environment variables/parameters.
    const twitterSecret = secretsmanager.Secret.fromSecretAttributes(this, 'TwitterSecret', {
      secretPartialArn: `arn:aws:secretsmanager:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:secret:TwitterSecret`
    });

    const tweetConstruct = new TweetConstruct(this, 'TweetConstruct', {
      twitterSecret,
      plumbingEventBus: props.plumbingEventBus,
    });

    const sendTweetRule = new events.Rule(this, 'SendTweetRule', {
      eventPattern: {
        detailType: ['SEND_TWEET'],
      },
      eventBus: props.plumbingEventBus,
    });
    sendTweetRule.addTarget(new targets.LambdaFunction(tweetConstruct.lambda));
  }
}
