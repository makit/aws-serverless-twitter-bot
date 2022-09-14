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
}

class Tweet {
  private readonly _secretArn: string;
  private readonly _secretsManager: aws.SecretsManager;
  
  // We will lazy load the client for efficiency across reused instances
  private _twitterClient: TwitterClient;

  constructor() {
    const { SecretArn } = process.env;

    if (!SecretArn) {
      throw new Error('Missing environment variables');
    }

    this._secretArn = SecretArn;
    this._secretsManager = new aws.SecretsManager();

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
  
      const response = await this._twitterClient.tweetsV2.createTweet({
        reply: {
          in_reply_to_tweet_id: event.detail.ReplyToTweetId.toString(),
        },
        text: event.detail.Text,
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