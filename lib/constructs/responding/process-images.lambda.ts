import * as aws from 'aws-sdk';
import { EventBridgeEvent } from 'aws-lambda';
import gm from 'gm';

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
  UnrecognizedFaces: TwitterFace[],
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
    this._eventBusName = EventBusName;
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

    // We will only process the first one for simplicity
    const imageToAnalyse = event.detail.Analysis.Images[0];

    const manipulatedImage = await this.processImage(imageToAnalyse);
   
    console.log('Image has been manipulated');

    // Overwrite the image
    const response = await this._s3.putObject({
      Bucket: this._bucket,
      Key: imageToAnalyse.Key,
      Body: manipulatedImage,
    }).promise();

    console.log('Overwritten image', response);

    const celebList = imageToAnalyse.Analysis.CelebrityFaces.map(f => f.Name);
    const celebs = celebList.length > 0 ? `I recognised: ${celebList.join(",")}` : 'Sorry I recognised no celebrities!';

    if (response) {
      const respondEvent = this.generateEvent(`@${event.detail.Author} ${celebs}`, event.detail.Twitter, imageToAnalyse.Key);

      console.info('Pushing to event bridge', JSON.stringify(respondEvent, null, 2));

      const putResponse = await this._eventBridge.putEvents({
        Entries: [respondEvent],
      }).promise();

      console.log('Pushed to EventBridge', JSON.stringify(putResponse, null, 2))
    }

    return true;
  };

  processImage = async (imageSpec: TwitterImage) : Promise<any> => {
    console.info('Downloading', imageSpec.Key);
    
    const response = await this._s3.getObject({
      Bucket: this._bucket,
      Key: imageSpec.Key,
    }).promise();

    return await new Promise( function(resolve, reject) {
      try {

        let img = gm(response.Body);

        img.size(function(err: any, value: any){
          if (err) {
            reject(err);
          } else {
            console.info('Processing celebrity faces', imageSpec.Key);
            for(const celebFace of imageSpec.Analysis.CelebrityFaces) {

              const x = (celebFace.Face.BoundingBox.Left * value.width)+((celebFace.Face.BoundingBox.Width * value.width)/2);
              const y = celebFace.Face.BoundingBox.Top* value.height;

              console.log('Drawing text', x, y);

              img.stroke("red", 1).fontSize(18).drawText(x, y, celebFace.Name);
            }

            // One option is to blur the unknowns
            // console.info('Processing Unrecognized faces', imageSpec.Key);
            // for(const unknownFace of imageSpec.Analysis.UnrecognizedFaces) {
            //   img.region(
            //     unknownFace.BoundingBox.Width * value.width, 
            //     unknownFace.BoundingBox.Height * value.height, 
            //     unknownFace.BoundingBox.Left * value.width, 
            //     unknownFace.BoundingBox.Top * value.height).blur(20);
            // }
  
            img.toBuffer('JPG', function(err: any, buffer: any) {
              if(err) {
                reject(err);
              } else {
                resolve(buffer);
              }
            });
          }
        });
      } catch (error) {
        console.error('Failed doing image', error);
        reject(error);
      }
    });
  }

  generateEvent = (message: string, detail: TwitterDetail, imageKey: string): aws.EventBridge.PutEventsRequestEntry => {
    return {
      Detail: JSON.stringify({
        Text: message,
        ReplyToUserId: detail.UserId,
        ReplyToTweetId: detail.TweetId,
        ImageKey: imageKey,
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