import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as events from 'aws-cdk-lib/aws-events';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as firehose from 'aws-cdk-lib/aws-kinesisfirehose';
import * as glue from '@aws-cdk/aws-glue-alpha';
import * as firehose_alpha from '@aws-cdk/aws-kinesisfirehose-alpha';
import * as firehosedestinations from '@aws-cdk/aws-kinesisfirehose-destinations-alpha';
import TransformRecordsConstruct from '../constructs/analytics/transform-records';

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

    // Used to transform each record with a newline so stored in S3 for querying ok
    const transformRecords = new TransformRecordsConstruct(this, 'TransformRecords');

    const processor = new firehose_alpha.LambdaFunctionProcessor(transformRecords.lambda, {
      bufferInterval: cdk.Duration.seconds(60),
      bufferSize: cdk.Size.mebibytes(1),
      retries: 1,
    });

    var kinesis = new firehose_alpha.DeliveryStream(this, 'DeliveryStream', {
      destinations: [new firehosedestinations.S3Bucket(dataLakeBucket, { 
        bufferingInterval: cdk.Duration.seconds(60),
        processor,
      })],
    });

    const dataLakeRule = new events.Rule(this, 'DataLakeRule', {
      eventPattern: {
        account: [cdk.Aws.ACCOUNT_ID],
      },
      eventBus: this._eventBus,
    });

    dataLakeRule.addTarget(new targets.KinesisFirehoseStream(kinesis.node.defaultChild as firehose.CfnDeliveryStream, {
    }));

    const database = new glue.Database(this, "MessagesDataLake", {
      databaseName: "messages-data-lake",
    });
 
    this.createGlueTableForAnalysedMessage(database, dataLakeBucket);
  }

  /**
   * Create a Glue table for the Analysed Message type, could also use a crawler to find the schema automatically but we
   * know the schema so this is safer. If we want to search all the different types of TWITTER event schemas then a crawler
   * probably makes more sense.
   * @param database The Glue DB to add the table to.
   * @param dataLakeBucket The Bucket containing the data, to create the table for.
   */
  private createGlueTableForAnalysedMessage(database: glue.Database, dataLakeBucket: cdk.aws_s3.Bucket) {
    new glue.Table(this, "AnalysedMessagesTable", {
      database,
      storedAsSubDirectories: true, // Kinesis stores the data in sub-directories
      tableName: "analysed-messages-table",
      bucket: dataLakeBucket,
      columns: [
        {
          name: "detail-type",
          type: glue.Schema.STRING,
        },
        {
          name: "source",
          type: glue.Schema.STRING,
        },
        {
          name: "time",
          type: glue.Schema.TIMESTAMP,
        },
        {
          name: "detail",
          type: glue.Schema.struct([
            {
              name: "Author",
              type: glue.Schema.STRING,
            },
            {
              name: "Text",
              type: glue.Schema.STRING,
            },
            {
              name: "Analysis",
              type: glue.Schema.struct([
                {
                  name: "TextSentiment",
                  type: glue.Schema.STRING,
                },
                {
                  name: "Images",
                  type: glue.Schema.array(glue.Schema.struct([
                    {
                      name: "Analysis",
                      type: glue.Schema.struct([
                        {
                          name: "CelebrityFaces",
                          type: glue.Schema.array(glue.Schema.struct([
                            {
                              name: "Name",
                              type: glue.Schema.STRING,
                            },
                            {
                              name: "Face",
                              type: glue.Schema.struct([
                                {
                                  name: "Emotions",
                                  type: glue.Schema.array(glue.Schema.struct([
                                    {
                                      name: "Confidence",
                                      type: glue.Schema.DOUBLE,
                                    },
                                    {
                                      name: "Type",
                                      type: glue.Schema.STRING,
                                    },
                                  ])),
                                },
                              ])
                            }
                          ])),
                        },
                        {
                          name: "UnrecognizedFaces",
                          type: glue.Schema.array(glue.Schema.struct([
                            {
                              name: "Emotions",
                              type: glue.Schema.array(glue.Schema.struct([
                                {
                                  name: "Confidence",
                                  type: glue.Schema.DOUBLE,
                                },
                                {
                                  name: "Type",
                                  type: glue.Schema.STRING,
                                },
                              ])),
                            },
                          ])),
                        },
                        {
                          name: "Labels",
                          type: glue.Schema.array(glue.Schema.struct([
                            {
                              name: "Confidence",
                              type: glue.Schema.DOUBLE,
                            },
                            {
                              name: "Name",
                              type: glue.Schema.STRING,
                            },
                          ])),
                        },
                      ])
                    }
                  ])),
                },
              ]),
            },
          ]),
        },
      ],
      dataFormat: glue.DataFormat.JSON,
    });
  }
}
