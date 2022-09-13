import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambdanode from 'aws-cdk-lib/aws-lambda-nodejs';

/**
 * Construct for a lambda (and associated role) for fulfilment of topics with Lex.
 */
export default class ChatBotFulfillmentConstruct extends Construct {

  public readonly lambda : lambda.IFunction;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.lambda = new lambdanode.NodejsFunction(this, 'lambda', {
      runtime: lambda.Runtime.NODEJS_16_X,
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    // Allow the lambda to be executed by Lex
    this.lambda.addPermission('LexCanExecute', {
      principal: new iam.ServicePrincipal('lexv2.amazonaws.com'),
    });
  }
}