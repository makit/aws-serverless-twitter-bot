import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as events from 'aws-cdk-lib/aws-events';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';

export interface AnalysisStackProps extends cdk.StackProps {
  plumbingEventBus: events.IEventBus,
  twitterIdOfAccount: number
}

/**
 * Stack that handles analysing received messages.
 */
export class AnalysisStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props: AnalysisStackProps) {
    super(scope, id, props);

    // TODO: Step function

    const analyseBucket = new s3.Bucket(this, 'AnalysisMedia', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    const analyseTweetStateMachine = this.buildStepFunction(analyseBucket);

    // Match on all tweets that were not sent by the user that we are linked to
    const analyseIncomingTweetRule = new events.Rule(this, 'AnalyseIncomingTweetRule', {
      eventPattern: {
        detailType: ["TWITTER_TWEETED"],
        detail: {
          user: {
            id: [ { "anything-but": [props.twitterIdOfAccount]} ]
          }
        }
      },
      eventBus: props.plumbingEventBus,
    });
    analyseIncomingTweetRule.addTarget(new targets.SfnStateMachine(analyseTweetStateMachine));

    // Rule on event bus to listen for TWITTER_TWEETED but filter to not current id (param)
  }

  private buildStepFunction(analyseBucket: s3.IBucket) {

    // DetectEntities (PERSON | LOCATION | ORGANIZATION | COMMERCIAL_ITEM | EVENT | DATE | QUANTITY | TITLE | OTHER)
    // DetectSentiment (POSITIVE | NEGATIVE | NEUTRAL | MIXED)
    // DetectKeyPhrases - maybe later

    // for entities.media (array) where type = photo - download media_url_https and then run rekognition
    // DetectFaces - returns emotions, eyesopen, eyeglasses, gender, mustache, pose, smile, sunglasses
    // DetectLabels - returns list of things
    // DetectText - Image to text
    // RecognizeCelebrities

    // DetectModerationLabels - maybe later

    // Or just do LEX?

    const detectEntities = new tasks.CallAwsService(this, "Detect Entities", {
      service: "comprehend",
      action: "detectEntities",
      iamResources: ["*"],
      parameters: {
        "Text": stepfunctions.JsonPath.stringAt("$.text"), 
        "LanguageCode": "en",
      }
    });

    const detectSentiment = new tasks.CallAwsService(this, "Detect Sentiment", {
      service: "comprehend",
      action: "detectSentiment",
      iamResources: ["*"],
      parameters: {
        "Text": stepfunctions.JsonPath.stringAt("$.text"), 
        "LanguageCode": "en",
      }
    });

    const containImage = new stepfunctions.Choice(this, 'Contain Image(s)?');
    const containsImageCondition = stepfunctions.Condition.isPresent('$.entities.media');
    const noImage = new stepfunctions.Pass(this, 'No Images');

    // TODO: Lambda to download all images in event and output list of S3 keys
    const downloadImagesToS3 = new stepfunctions.Pass(this, 'Download Images to S3');

    const detectFaces = new tasks.CallAwsService(this, "Detect Faces", {
      service: "rekognition",
      action: "detectFaces",
      iamResources: ["*"],
      parameters: {
        "Image": {
          "S3Object": {
            "Bucket": analyseBucket.bucketName,
            "Name": stepfunctions.JsonPath.stringAt("$.key")
          }
        }
      }
    });

    const detectLabels = new tasks.CallAwsService(this, "Detect Labels", {
      service: "rekognition",
      action: "detectLabels",
      iamResources: ["*"],
      parameters: {
        "Image": {
          "S3Object": {
            "Bucket": analyseBucket.bucketName,
            "Name": stepfunctions.JsonPath.stringAt("$.key")
          }
        }
      }
    });

    const detectText = new tasks.CallAwsService(this, "Detect Text", {
      service: "rekognition",
      action: "detectText",
      iamResources: ["*"],
      parameters: {
        "Image": {
          "S3Object": {
            "Bucket": analyseBucket.bucketName,
            "Name": stepfunctions.JsonPath.stringAt("$.key")
          }
        }
      }
    });

    const recognizeCelebrities = new tasks.CallAwsService(this, "Recognize Celebrities", {
      service: "rekognition",
      action: "recognizeCelebrities",
      iamResources: ["*"],
      parameters: {
        "Image": {
          "S3Object": {
            "Bucket": analyseBucket.bucketName,
            "Name": stepfunctions.JsonPath.stringAt("$.key")
          }
        }
      }
    });

    const mapImage = new stepfunctions.Map(this, 'Map through Images', {
      itemsPath: stepfunctions.JsonPath.stringAt('$.images'),
    });

    const parallelImages = new stepfunctions.Parallel(this, 'Analyse Image');
    parallelImages.branch(detectFaces);
    parallelImages.branch(detectLabels);
    parallelImages.branch(detectText);
    parallelImages.branch(recognizeCelebrities);

    const pushResultingEvent = new stepfunctions.Pass(this, 'Push Result');

    const pushFailEvent = new stepfunctions.Pass(this, 'Push Fail Result');

    const parallelTextAndImages = new stepfunctions.Parallel(this, 'Analyse Text and Images', {
      inputPath: '$.detail',
    });
    parallelTextAndImages.branch(detectEntities)
    parallelTextAndImages.branch(detectSentiment)
    parallelTextAndImages.branch(containImage
      .when(containsImageCondition, downloadImagesToS3
        .next(mapImage
          .iterator(parallelImages)))
      .otherwise(noImage))

    const definition = parallelTextAndImages
      .addCatch(pushFailEvent)
      .next(pushResultingEvent);

    return new stepfunctions.StateMachine(this, 'AnalyseTweet', {
      definition,
    });
  }
}
