import * as aws from 'aws-sdk';
import { TwitterClient } from 'twitter-api-client';
import { EventBridgeEvent } from 'aws-lambda';

type MessageAnalysedDetailType = "SEND_TWEET";

export interface TwitterApiDetails {
  ApiSecret: string,
  ApiKey: string,
  AccessToken: string,
  AccessTokenSecret: string,
}

interface MessageAnalysedDetail {
  Text: string,
  ReplyToUserId: string,
  ReplyToTweetId: string,
  ImageKey: string,
}

class Tweet {
  private readonly _secretArn: string;
  private readonly _bucket: string;
  private readonly _secretsManager: aws.SecretsManager;
  private readonly _s3: aws.S3;
  
  // We will lazy load the client for efficiency across reused instances
  private _twitterClient: TwitterClient;

  constructor() {
    const { SecretArn, Bucket } = process.env;

    if (!SecretArn || !Bucket) {
      throw new Error('Missing environment variables');
    }

    this._secretArn = SecretArn;
    this._bucket = Bucket;
    this._secretsManager = new aws.SecretsManager();
    this._s3 = new aws.S3();

    console.info('Initialised');
  }

  handler = async (event: EventBridgeEvent<MessageAnalysedDetailType, MessageAnalysedDetail>): Promise<boolean> => {
    console.info('Received Event:', JSON.stringify(event, null, 2));

    try {
      if (!this._twitterClient) {
        const secretValue = await this._secretsManager.getSecretValue({ SecretId: this._secretArn }).promise();
        const secret = JSON.parse(secretValue.SecretString ?? '') as TwitterApiDetails;
  
        this._twitterClient = new TwitterClient({
          apiKey: secret.ApiKey,
          apiSecret: secret.ApiSecret,
          accessToken: secret.AccessToken,
          accessTokenSecret: secret.AccessTokenSecret,
        });
      }
  
      let mediaId = undefined;

      if (event.detail.ImageKey) {

        const response = await this._s3.getObject({
          Bucket: this._bucket,
          Key: event.detail.ImageKey,
        }).promise();

        const uploadedMedia = await this._twitterClient.media.mediaUpload({
          media_data: response.Body?.toString('base64'),
        });

        mediaId = uploadedMedia.media_id_string;
      }

      const response = await this._twitterClient.tweetsV2.createTweet({
        reply: {
          in_reply_to_tweet_id: event.detail.ReplyToTweetId.toString(),
        },
        text: event.detail.Text,
        media: mediaId === undefined ? undefined : {
          media_ids: [mediaId],
        }
      });
  
      console.info('Tweet Response:', JSON.stringify(response, null, 2));
    } catch (error) {
      console.error(JSON.stringify(error, null, 2))
      throw error;
    }

    return true;
  };
}

// Initialise class outside of the handler so context is reused.
const tweet = new Tweet();

// The handler simply executes the object handler
export const handler = async (event: EventBridgeEvent<MessageAnalysedDetailType, MessageAnalysedDetail>): Promise<boolean> => tweet.handler(event);