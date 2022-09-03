import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

/**
 * Stack that handles the event bus that plumbs all the components together.
 */
export class PlumbingStack extends cdk.Stack {

  public readonly eventBus: events.IEventBus;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    this.eventBus = new events.EventBus(this, 'bus', {
      eventBusName: 'Plumbing'
    });

    this.addEventArchiveForReplayAbility();

    this.addCatchAllRuleToDebugLog();
  }

  /**
   * Archive all the events so we can do replay if needed.
   */
  private addEventArchiveForReplayAbility() {
    this.eventBus.archive('PlumbingArchive', {
      eventPattern: {
        account: [cdk.Aws.ACCOUNT_ID],
      },
      retention: cdk.Duration.days(7),
    });
  }

  /**
   * Debug logs - keep for a week and don't let them hang around if the stack is deleted.
   */
  private addCatchAllRuleToDebugLog() {
    const catchAllLogGroup = new logs.LogGroup(this, 'PlumbingEvents', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const catchAllRule = new events.Rule(this, 'CatchAllRule', {
      eventPattern: {
        account: [cdk.Aws.ACCOUNT_ID],
      },
      eventBus: this.eventBus,
    });
    catchAllRule.addTarget(new targets.CloudWatchLogGroup(catchAllLogGroup));
  }
}
