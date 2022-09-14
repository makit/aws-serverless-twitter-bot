import * as aws from 'aws-sdk';
import { EventBridgeEvent } from 'aws-lambda';

type MessageAnalysedDetailType = "MESSAGE_ANALYSED";

interface MessageAnalysedDetail {
  Author: string,
  Text: string,
  Twitter: TwitterDetail,
  Analysis: TwitterAnalysis,
}

interface TwitterDetail {
  UserId: string,
  TweetId: string,
}

interface TwitterAnalysis {
  Images: TwitterImage[],
}

interface TwitterImage {
  Key: string,
  Analysis: TwitterImageAnalysis,
}

interface TwitterImageAnalysis {
  CelebrityFaces: TwitterFaceDetection[],
  UnrecognizedFaces: any[],
  Labels: any[],
  TextDetections: any[]
}

interface TwitterFaceDetection {
  Face: TwitterFace,
  Name: string,
  Urls: string[],
}

interface TwitterFace {
  BoundingBox: BoundingBox,
  Confidence: number,
}

interface BoundingBox {
  Height: number,
  Left: number,
  Top: number,
  Width: number,
}

class ProcessImages {
  private readonly _eventBusName: string;
  private readonly _bucket: string;
  private readonly _s3: aws.S3;
  private readonly _eventBridge: aws.EventBridge;

  constructor() {
    const { Bucket, EventBusName } = process.env;

    if (!Bucket || !EventBusName) {
      throw new Error('Missing environment variables');
    }

    this._bucket = Bucket;
    this._s3 = new aws.S3();
    this._eventBridge = new aws.EventBridge();

    console.info('Initialised');
  }

  handler = async (event: EventBridgeEvent<MessageAnalysedDetailType, MessageAnalysedDetail>): Promise<boolean> => {
    console.info('Received Event:', JSON.stringify(event, null, 2));

    // Can't handle if no images
    if (event.detail.Analysis.Images.length <= 0) {
      return false;
    }

    
   
    // console.info('Response:', JSON.stringify(response, null, 2));

    // if (response && response.messages && response.messages.length > 0 && response.messages[0].content) {
    //   const respondEvent = this.generateEvent(`@${event.detail.Author} ${response.messages[0].content}`, event.detail.Twitter);

    //   console.info('Pushing to event bridge', JSON.stringify(respondEvent, null, 2));

    //   const putResponse = await this._eventBridge.putEvents({
    //     Entries: [respondEvent],
    //   }).promise();

    //   console.log('Pushed to EventBridge', JSON.stringify(putResponse, null, 2))
    // }

    return true;
  };

   generateEvent = (message: string, detail: TwitterDetail): aws.EventBridge.PutEventsRequestEntry => {
    return {
      Detail: JSON.stringify({
        Text: message,
        ReplyToUserId: detail.UserId,
        ReplyToTweetId: detail.TweetId,
      }),
      DetailType: `SEND_TWEET`,
      EventBusName: this._eventBusName,
      Source: 'BOT',
    };
  }
}

// Initialise class outside of the handler so context is reused.
const processImages = new ProcessImages();

// The handler simply executes the object handler
export const handler = async (event: EventBridgeEvent<MessageAnalysedDetailType, MessageAnalysedDetail>): Promise<boolean> => processImages.handler(event);