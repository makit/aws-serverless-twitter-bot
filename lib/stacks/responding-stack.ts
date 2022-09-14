import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as events from 'aws-cdk-lib/aws-events';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lex from 'aws-cdk-lib/aws-lex';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import ChatBotConstruct from '../constructs/responding/chat-bot';
import ChatBotFulfillmentConstruct from '../constructs/responding/chat-bot-fulfillment';
import ProcessImagesConstruct from '../constructs/responding/process-images';

export interface RespondingStackProps extends cdk.StackProps {
  plumbingEventBus: events.IEventBus,
  analysisBucket: s3.IBucket
}

/**
 * Stack that subscribes to events from event bridge for generating responses from the messages.
 */
export class RespondingStack extends cdk.Stack {

  private readonly localeId = 'en_GB';
  public readonly _eventBus: events.IEventBus;

  constructor(scope: Construct, id: string, props: RespondingStackProps) {
    super(scope, id, props);

    this._eventBus = props.plumbingEventBus;

    const textLambda = this.createTextResponseResources();

    // Match on anything that has text which is more than the account username and which doesn't have images
    // Images will be dealt with my a different lambda
    const analyseIncomingMessageRule = new events.Rule(this, 'RespondTextRule', {
      eventPattern: {
        detailType: ['MESSAGE_ANALYSED'],
        detail: {
          Text: [{ 'anything-but': ['', '@makitdev']}],
          Analysis: {
            Images: {
              Key: [ { "exists": false  } ]
            }
          }
        }
      },
      eventBus: props.plumbingEventBus,
    });
    analyseIncomingMessageRule.addTarget(new targets.LambdaFunction(textLambda));

    
    const processImages = new ProcessImagesConstruct(this, 'ProcessImages', {
      plumbingEventBus: props.plumbingEventBus,
      bucket: props.analysisBucket,
    })

    // Match on anything that has at least one image
    const analyseImageRule = new events.Rule(this, 'RespondImageRule', {
      eventPattern: {
        detailType: ['MESSAGE_ANALYSED'],
        detail: {
          Analysis: {
            Images: {
              Key: [ { "exists": true  } ]
            }
          }
        }
      },
      eventBus: props.plumbingEventBus,
    });
    analyseImageRule.addTarget(new targets.LambdaFunction(processImages.lambda));
  }

  private createTextResponseResources(): lambda.IFunction {
    const role = new iam.Role(this, 'BotRole', {
      assumedBy: new iam.ServicePrincipal('lexv2.amazonaws.com'),
    });

    const chatBotFulfilmentConstruct = new ChatBotFulfillmentConstruct(this, 'ChatBotFulfilment');

    const jokeIntent: lex.CfnBot.IntentProperty = {
      name: 'Joke',
      sampleUtterances: [
        {
          utterance: 'please tell me a joke',
        },
        {
          utterance: 'I would like to hear a joke',
        },
        {
          utterance: 'make me laugh',
        },
        {
          utterance: 'have you got a good joke',
        },
      ],
      fulfillmentCodeHook: {
        enabled: true,
      }
    };

    const factIntent: lex.CfnBot.IntentProperty = {
      name: 'Fact',
      sampleUtterances: [
        {
          utterance: 'please tell me a fact',
        },
        {
          utterance: 'I would like to hear a fact',
        },
        {
          utterance: 'tell me something interesting',
        },
        {
          utterance: "I'd like to hear something interesting",
        },
      ],
      fulfillmentCodeHook: {
        enabled: true,
      }
    };

    const fallbackIntent: lex.CfnBot.IntentProperty = {
      name: 'FallbackIntent',
      parentIntentSignature: 'AMAZON.FallbackIntent',
      intentClosingSetting: {
        isActive: true,
        closingResponse: {
          messageGroupsList: [
            {
              message: {
                plainTextMessage: {
                  value: 'You can ask me for a joke, fact or send an image and I will identify the celebrities'
                }
              }
            }
          ]
        }
      }
    };

    const bot = new lex.CfnBot(this, 'RespondBot', {
      name: 'MessageResponderBot',
      idleSessionTtlInSeconds: 300,
      roleArn: role.roleArn,
      dataPrivacy: {
        ChildDirected: false,
      },
      autoBuildBotLocales: true,
      botLocales: [
        {
          localeId: this.localeId,
          nluConfidenceThreshold: 0.4,
          intents: [jokeIntent, factIntent, fallbackIntent],
        }
      ]
    });

    const botVersion = new lex.CfnBotVersion(this, 'RespondBotVers', {
      botId: bot.ref,
      botVersionLocaleSpecification: [{
          botVersionLocaleDetails: {
            sourceBotVersion: 'DRAFT',
          },
          localeId: this.localeId,
        },
      ],
    });

    const botAlias = new lex.CfnBotAlias(this, 'RespondBotAlias', {
      botAliasName: 'BiscuitCake',
      botVersion: botVersion.attrBotVersion,
      botId: bot.ref,
      botAliasLocaleSettings: [
        {
          localeId: this.localeId,
          botAliasLocaleSetting: {
            enabled: true,
            codeHookSpecification: {
              lambdaCodeHook: {
                codeHookInterfaceVersion: '1.0',
                lambdaArn: chatBotFulfilmentConstruct.lambda.functionArn,
              }
            }
          }
        }
      ]
    });

    const chatBotConstruct = new ChatBotConstruct(this, 'ChatBot', {
      botId: bot.ref,
      botAliasId: botAlias.attrBotAliasId,
      botLocaleId: this.localeId,
      plumbingEventBus: this._eventBus,
    });

    return chatBotConstruct.lambda;
  }
}
