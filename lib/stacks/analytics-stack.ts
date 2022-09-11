import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as events from 'aws-cdk-lib/aws-events';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as firehose from 'aws-cdk-lib/aws-kinesisfirehose';
import * as firehose_alpha from '@aws-cdk/aws-kinesisfirehose-alpha';
import * as firehosedestinations from '@aws-cdk/aws-kinesisfirehose-destinations-alpha';

export interface AnalyticsStackProps extends cdk.StackProps {
  plumbingEventBus: events.IEventBus
}

/**
 * Stack that allows analytics over the messages received and analysed.
 */
export class AnalyticsStack extends cdk.Stack {

  public readonly _eventBus: events.IEventBus;

  constructor(scope: Construct, id: string, props: AnalyticsStackProps) {
    super(scope, id, props);

    this._eventBus = props.plumbingEventBus;

    const dataLakeBucket = new s3.Bucket(this, 'DataLake');

    var kinesis = new firehose_alpha.DeliveryStream(this, 'DeliveryStream', {
      destinations: [new firehosedestinations.S3Bucket(dataLakeBucket, { bufferingInterval: cdk.Duration.seconds(60) })],    
    });

    const dataLakeRule = new events.Rule(this, 'DataLakeRule', {
      eventPattern: {
        account: [cdk.Aws.ACCOUNT_ID],
      },
      eventBus: this._eventBus,
    });

    dataLakeRule.addTarget(new targets.KinesisFirehoseStream(kinesis.node.defaultChild as firehose.CfnDeliveryStream, {
    }));
  }
}
