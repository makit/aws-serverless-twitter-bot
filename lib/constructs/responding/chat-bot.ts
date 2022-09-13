import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as lambdanode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface ChatBotConstructProps {
  botId: string,
  botAliasId: string,
  botLocaleId: string,
  plumbingEventBus: events.IEventBus,
}

/**
 * Construct for a lambda (and associated role) for interacting with Lex.
 */
export default class ChatBotConstruct extends Construct {

  public readonly lambda : lambda.IFunction;

  constructor(scope: Construct, id: string, props: ChatBotConstructProps) {
    super(scope, id);

    const role = new iam.Role(this, 'LambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"));
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonLexFullAccess"));
    role.addToPolicy(
      new iam.PolicyStatement({
        resources: [props.plumbingEventBus.eventBusArn],
        actions: ['events:PutEvents'],
      }),
    );

    this.lambda = new lambdanode.NodejsFunction(this, 'lambda', {
      runtime: lambda.Runtime.NODEJS_16_X,
      environment: {
        BotId: props.botId,
        BotAliasId: props.botAliasId,
        BotLocaleId: props.botLocaleId,
        EventBusName: props.plumbingEventBus.eventBusName,
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