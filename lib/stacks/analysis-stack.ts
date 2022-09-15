import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as events from 'aws-cdk-lib/aws-events';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import DownloadImagesConstruct from '../constructs/analysis/download-images';
import { JsonPath } from 'aws-cdk-lib/aws-stepfunctions';

export interface AnalysisStackProps extends cdk.StackProps {
  plumbingEventBus: events.IEventBus
}

/**
 * Stack that handles analysing received messages.
 */
export class AnalysisStack extends cdk.Stack {

  public readonly analyseBucket: s3.Bucket;

  private readonly _downloadImagesConstruct: DownloadImagesConstruct;

  private readonly _plumbingEventBus: events.IEventBus;

  constructor(scope: Construct, id: string, props: AnalysisStackProps) {
    super(scope, id, props);

    this._plumbingEventBus = props.plumbingEventBus;
    
    // Stores images that are downloaded for analysis - don't need persistence here so expire items after 1 day.
    this.analyseBucket = new s3.Bucket(this, 'AnalysisMedia', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [{
        expiration: cdk.Duration.days(1),        
      }],
    });

    this._downloadImagesConstruct = new DownloadImagesConstruct(this, 'Download Images', {
      bucket: this.analyseBucket,
    });

    const analyseMessageStateMachine = this.buildStepFunction();

    const analyseIncomingMessageRule = new events.Rule(this, 'AnalyseIncomingMessageRule', {
      eventPattern: {
        detailType: ['MESSAGE_RECEIVED'],
      },
      eventBus: props.plumbingEventBus,
    });
    analyseIncomingMessageRule.addTarget(new targets.SfnStateMachine(analyseMessageStateMachine));
  }

  /**
   * Will build the main analysis stepfunction that will orchestrate the calls to the different AI services.
   * @returns The build State Machine.
   */
  private buildStepFunction(): stepfunctions.StateMachine {
    const detectEntities = new tasks.CallAwsService(this, 'Detect Entities', {
      service: 'comprehend',
      action: 'detectEntities',
      iamResources: ['*'],
      parameters: {
        'Text': stepfunctions.JsonPath.stringAt('$.Text'), 
        'LanguageCode': 'en',
      },
    });

    const detectSentiment = new tasks.CallAwsService(this, 'Detect Sentiment', {
      service: 'comprehend',
      action: 'detectSentiment',
      iamResources: ['*'],
      parameters: {
        'Text': stepfunctions.JsonPath.stringAt('$.Text'), 
        'LanguageCode': 'en',
      },
    });

    const analyseText = new stepfunctions.Parallel(this, 'Analyse Text', {
      resultSelector: {
        Entities: stepfunctions.JsonPath.stringAt('$[0].Entities'),
        Sentiment: stepfunctions.JsonPath.stringAt('$[1].Sentiment'),
      },
    });
    analyseText.branch(detectEntities);
    analyseText.branch(detectSentiment);

    const containImage = new stepfunctions.Choice(this, 'Contain Image(s)?');
    const containsImageCondition = stepfunctions.Condition.isPresent('$.ImageUrls');
    const noImage = new stepfunctions.Pass(this, 'No Images', {
      outputPath: JsonPath.DISCARD,
    });

    const downloadImagesToS3 = new tasks.LambdaInvoke(this, 'Download Images to S3', {
      lambdaFunction: this._downloadImagesConstruct.lambda,
      payload: stepfunctions.TaskInput.fromObject({
        imageUrls: stepfunctions.JsonPath.listAt('$.ImageUrls'),
      }),
      outputPath: '$.Payload',
    });

    const detectLabels = new tasks.CallAwsService(this, 'Detect Labels', {
      service: 'rekognition',
      action: 'detectLabels',
      iamResources: ['*'],
      parameters: {
        'Image': {
          'S3Object': {
            'Bucket': this.analyseBucket.bucketName,
            'Name': stepfunctions.JsonPath.stringAt('$.Key'),
          },
        },
      },
      resultSelector: {
        Labels: stepfunctions.JsonPath.stringAt('$.Labels'),
      },
    });

    const detectText = new tasks.CallAwsService(this, 'Detect Text', {
      service: 'rekognition',
      action: 'detectText',
      iamResources: ['*'],
      parameters: {
        'Image': {
          'S3Object': {
            'Bucket': this.analyseBucket.bucketName,
            'Name': stepfunctions.JsonPath.stringAt('$.Key'),
          },
        },
      },
      resultSelector: {
        TextDetections: stepfunctions.JsonPath.stringAt('$.TextDetections'),
      },
    });

    const recognizeCelebrities = new tasks.CallAwsService(this, 'Recognize Celebrities', {
      service: 'rekognition',
      action: 'recognizeCelebrities',
      iamResources: ['*'],
      parameters: {
        'Image': {
          'S3Object': {
            'Bucket': this.analyseBucket.bucketName,
            'Name': stepfunctions.JsonPath.stringAt('$.Key'),
          },
        },
      },
    });

    const mapImage = new stepfunctions.Map(this, 'Map through Images', {
      itemsPath: stepfunctions.JsonPath.stringAt('$.Images'),
    });

    const parallelImages = new stepfunctions.Parallel(this, 'Analyse Image', {
      resultSelector: {
        Labels: stepfunctions.JsonPath.stringAt('$[0].Labels'),
        TextDetections: stepfunctions.JsonPath.stringAt('$[1].TextDetections'),
        CelebrityFaces: stepfunctions.JsonPath.stringAt('$[2].CelebrityFaces'),
        UnrecognizedFaces: stepfunctions.JsonPath.stringAt('$[2].UnrecognizedFaces'),
      },
      resultPath: '$.Analysis',
    });
    parallelImages.branch(detectLabels);
    parallelImages.branch(detectText);
    parallelImages.branch(recognizeCelebrities);

    const pushResultingEvent = new tasks.CallAwsService(this, 'Push Result', {
      service: 'eventbridge',
      action: 'putEvents',
      iamResources: ['*'],
      parameters: {
        'Entries': [
          {
            'Detail': {
              'Text': stepfunctions.JsonPath.stringAt('$$.Execution.Input.detail.Text'),
              'Author': stepfunctions.JsonPath.stringAt('$$.Execution.Input.detail.Author'),
              'Analysis': stepfunctions.JsonPath.objectAt('$'),
              'Twitter': {
                'TweetId': stepfunctions.JsonPath.stringAt('$$.Execution.Input.detail.Twitter.TweetId'),
                'UserId': stepfunctions.JsonPath.stringAt('$$.Execution.Input.detail.Twitter.UserId'),
              },
            },
            'DetailType': 'MESSAGE_ANALYSED',
            'EventBusName': this._plumbingEventBus.eventBusName,
            'Source': stepfunctions.JsonPath.stringAt('$$.Execution.Input.source'),
          },
        ],
      },
    });

    const pushFailEvent = new stepfunctions.Pass(this, 'Push Fail Result');

    const parallelTextAndImages = new stepfunctions.Parallel(this, 'Analyse Text and Images', {
      inputPath: '$.detail',
      resultSelector: {
        TextEntities: stepfunctions.JsonPath.stringAt('$[0].Entities'),
        TextSentiment: stepfunctions.JsonPath.stringAt('$[0].Sentiment'),
        Images: stepfunctions.JsonPath.stringAt('$[1]'),
      },
    });
    parallelTextAndImages.branch(analyseText);
    parallelTextAndImages.branch(containImage
      .when(containsImageCondition, downloadImagesToS3
        .next(mapImage
          .iterator(parallelImages)))
      .otherwise(noImage));

    const definition = parallelTextAndImages
      .addCatch(pushFailEvent)
      .next(pushResultingEvent);

    const sf = new stepfunctions.StateMachine(this, 'AnalyseTweet', {
      definition,

    });

    // Allow rekognition to get the images - running via the Step Function role
    sf.addToRolePolicy(new iam.PolicyStatement({
      resources: [`${this.analyseBucket.bucketArn}/*`],
      actions: ['s3:GetObject'],
    }));

    // CDK doesn't do the permissions correctly...
    sf.addToRolePolicy(new iam.PolicyStatement({
      resources: [this._plumbingEventBus.eventBusArn],
      actions: ['events:PutEvents'],
    }));

    return sf;
  }
}
