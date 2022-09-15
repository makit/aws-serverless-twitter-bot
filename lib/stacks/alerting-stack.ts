import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sns from 'aws-cdk-lib/aws-sns';

export interface AlertingStackProps extends cdk.StackProps {
  plumbingEventBus: events.IEventBus
}

/**
 * Stack that subscribes to events from event bridge for sending alerts about things that need to be seen.
 */
export class AlertingStack extends cdk.Stack {

  public readonly _eventBus: events.IEventBus;

  constructor(scope: Construct, id: string, props: AlertingStackProps) {
    super(scope, id, props);

    this._eventBus = props.plumbingEventBus;

    // People can subscribe phone numbers and emails to this to get alerts
    const alertTopic = new sns.Topic(this, 'MessageAlert');

    this.createNegativeMessagesRule(alertTopic);
  }

  /**
   * Add a rule to catch all negative sentiment messages and send an alert to the Alert topic for subscribers.
   * @param alertTopic - Topic to send the events to
   */
  private createNegativeMessagesRule(alertTopic: cdk.aws_sns.Topic) {
    const negativeMessagesRule = new events.Rule(this, 'NegativeMessages', {
      eventPattern: {
        detailType: ['MESSAGE_ANALYSED'],
        detail: {
          Analysis: {
            TextSentiment: ['NEGATIVE'],
          },
        },
      },
      eventBus: this._eventBus,
    });

    negativeMessagesRule.addTarget(new targets.SnsTopic(alertTopic, {
      message: events.RuleTargetInput.fromText(
        `You have received a Negative Message: ${events.EventField.fromPath('$.detail.Text')} - ${events.EventField.fromPath('$.detail.Author')}`),
    }));
  }
}
