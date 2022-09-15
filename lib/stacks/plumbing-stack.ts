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
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.createMetricFilter(catchAllLogGroup, 'MESSAGE_RECEIVED');
    this.createMetricFilter(catchAllLogGroup, 'MESSAGE_ANALYSED');
    this.createMetricFilter(catchAllLogGroup, 'TWITTER_FAVOURITED');
    this.createMetricFilter(catchAllLogGroup, 'TWITTER_FOLLOWED');
    this.createMetricFilter(catchAllLogGroup, 'TWITTER_UNFOLLOWED');
    this.createMetricFilter(catchAllLogGroup, 'TWITTER_DM_RECEIVED');
    this.createMetricFilter(catchAllLogGroup, 'TWITTER_DELETED');
    this.createMetricFilter(catchAllLogGroup, 'SEND_TWEET');

    const catchAllRule = new events.Rule(this, 'CatchAllRule', {
      eventPattern: {
        account: [cdk.Aws.ACCOUNT_ID],
      },
      eventBus: this.eventBus,
    });
    catchAllRule.addTarget(new targets.CloudWatchLogGroup(catchAllLogGroup));
  }

  /**
   * Creates a single metric filter for the given detail type..
   * @param catchAllLogGroup The log group that is capturing all messages through the application.
   * @param metricName The name of the detail-type and therefore metric to create.
   */
  private createMetricFilter(catchAllLogGroup: cdk.aws_logs.LogGroup, metricName: string) {
    new logs.MetricFilter(this, `MetricFilter${metricName}`, {
      logGroup: catchAllLogGroup,
      metricNamespace: 'ServerlessMessageAnalyser',
      metricName,
      filterPattern: logs.FilterPattern.stringValue('$.detail-type', '=', metricName),
    });
  }
}
