import * as aws from 'aws-sdk';
import * as crypto from 'crypto';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export interface TwitterApiDetails {
  ConsumerSecret: string,
}

export interface TwitterActivityPayload {
  for_user_id: string,
  is_blocked_by: string,
  source: string,
  target: string,
  tweet_create_events: TwitterTweetCreated[],
  favorite_events: any[],
  follow_events: any[],
  unfollow_events: any[],
  block_events: any[],
  unblock_events: any[],
  mute_events: any[],
  unmute_events: any[],
  user_event: any[],
  direct_message_events: any[],
  direct_message_indicate_typing_events: any[],
  direct_message_mark_read_events: any[],
  tweet_delete_events: any[],
}

export interface TwitterUser {
  id: number,
  name: string,
  screen_name: string,
}

export interface TwitterExtendedTweet {
  full_text: string
}

export interface TwitterMedia {
  media_url_https: String
}

export interface TwitterEntities {
  media: TwitterMedia[]
}

export interface TwitterTweetCreated {
  user: TwitterUser,
  entities: TwitterEntities,
  text: string,
  truncated: boolean,
  extended_tweet: TwitterExtendedTweet
}

interface Dictionary<T> {
  [Key: string]: T;
}

class Twitter {
  private readonly _secretArn: string;
  private readonly _eventBusName: string;
  private readonly _twitterIdOfAccount: number;
  private readonly _eventBridge: aws.EventBridge;
  private readonly _secretsManager: aws.SecretsManager;
  
  // We will lazy load the secret for efficiency across reused instances
  private _secret: TwitterApiDetails;

  constructor() {
    const { SecretArn, EventBusName, TwitterIdOfAccount } = process.env;

    if (!SecretArn || !EventBusName || !TwitterIdOfAccount) {
      throw new Error('Missing environment variables');
    }

    this._secretArn = SecretArn;
    this._eventBusName = EventBusName;
    this._twitterIdOfAccount = parseInt(TwitterIdOfAccount);
    this._eventBridge = new aws.EventBridge();
    this._secretsManager = new aws.SecretsManager();

    console.info('Initialised');
  }

  handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.info('Received Event:', JSON.stringify(event, null, 2));

    try {
      if (!this._secret) {
        const secretValue = await this._secretsManager.getSecretValue({ SecretId: this._secretArn }).promise();
        this._secret = JSON.parse(secretValue.SecretString ?? '');
      }
  
      if (event.requestContext.httpMethod === "GET") {
        return await this.handleCrc(event);
      }
  
      if (event.requestContext.httpMethod === "POST") {
        return await this.handleActivity(event);
      }
  
      return {
        body: 'Invalid METHOD',
        statusCode: 400,
      };
    } catch (error) {
      console.log('ERROR', error);
      return {
        body: 'Error',
        statusCode: 500,
      };
    }
  };

  handleCrc = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const givenCrcToken = event?.queryStringParameters?.crc_token;
    if  (!givenCrcToken) {
      console.error('No crc_token given');
      return {
        body: 'No crc_token given',
        statusCode: 400,
      };
    }

    var bodyResponse = JSON.stringify({
      response_token: `sha256=${this.generateHmac(givenCrcToken)}`,
    });

    console.info('Generating HMAC for provided token', bodyResponse);

    return {
      body: bodyResponse,
      statusCode: 200,
    };
  }

  handleActivity = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {

    if (!event.body) {
      console.error('No body given');
      return {
        body: 'No body',
        statusCode: 400,
      };
    }
    
    const providedSignature = (event.headers['X-Twitter-Webhooks-Signature'] ?? '').substring(7);
    const generatedSignature = this.generateHmac(event?.body);
    if (!crypto.timingSafeEqual(Buffer.from(generatedSignature), Buffer.from(providedSignature))) {
      console.error('Provided signature does not match.');
      return {
        body: 'Invalid signature',
        statusCode: 401,
      };
    }

    const payload = JSON.parse(event?.body) as TwitterActivityPayload;
    const generatedEvents = this.generateEvents(payload);

    console.info('Pushing to event bridge', JSON.stringify(generatedEvents, null, 2));

    const putResponse = await this._eventBridge.putEvents({
      Entries: this.generateEvents(payload),
    }).promise();

    console.log('Pushed to EventBridge', JSON.stringify(putResponse, null, 2))

    return {
      body: 'Accepted',
      statusCode: 200,
    };
  }

  generateEvents = (payload: TwitterActivityPayload): aws.EventBridge.PutEventsRequestEntryList => {
    const events: aws.EventBridge.PutEventsRequestEntryList = [];

    const types: Dictionary<string> = {
      'tweet_create_events' : 'TWEETED',
      'favorite_events': 'FAVOURITED',
      'follow_events': 'FOLLOWED',
      'unfollow_events': 'UNFOLLOWED',
      'block_events': 'BLOCKED',
      'unblock_events': 'UNBLOCKED',
      'mute_events': 'MUTED',
      'unmute_events': 'UNMUTED',
      'user_event': 'PERMISSION_REVOKED',
      'direct_message_events': 'DM_RECEIVED',
      'direct_message_indicate_typing_events': 'DM_TYPING',
      'direct_message_mark_read_events': 'DM_MARKED_READ',
      'tweet_delete_events': 'DELETED',
    }

    for (const type in types) {
      const eventsOfType = (payload as any)[type];
      if (eventsOfType) {
        const typeName: string = types[type];
        (payload as any)[type].forEach((e: any) => events.push(this.generateSingleEvent(typeName, e)))
      }
    }

    // Generic Message Received Event
    if (payload.tweet_create_events) {
      payload.tweet_create_events.forEach((e) => {
        // If it wasn't sent by the twitter account we are receiving events for
        if (e.user.id !== this._twitterIdOfAccount) {
          events.push(this.generateMessageReceivedEvent(e)) 
        }
      });
    }
    
    return events;
  }

  generateSingleEvent = (type: string, detail: any): aws.EventBridge.PutEventsRequestEntry => {
    return {
      Detail: JSON.stringify(detail),
      DetailType: `TWITTER_${type}`, // Strip _events
      EventBusName: this._eventBusName,
      Source: 'TWITTER',
    };
  }

  /**
   * Generate an internal payload for all received messages, this is an Anti-corruption Layer Event so that downstream
   * aren't dependent on the JSON Twitter sends.
   * @param payload The raw payload for an individual tweet_create_events event
   * @returns an entry to be pushed to EventBridge
   */
  generateMessageReceivedEvent = (payload: TwitterTweetCreated): aws.EventBridge.PutEventsRequestEntry => {
    return {
      Detail: JSON.stringify({
        Text: payload.truncated ? payload.extended_tweet.full_text : payload.text,
        ImageUrls: payload.entities?.media ? payload.entities.media.map(e => e.media_url_https) : undefined,
        Author: `${payload.user.name} (${payload.user.screen_name})`,
      }),
      DetailType: `MESSAGE_RECEIVED`,
      EventBusName: this._eventBusName,
      Source: 'TWITTER',
    };
  }

  generateHmac = (payload: string): string => {
    return crypto.createHmac('sha256', this._secret.ConsumerSecret).update(payload).digest('base64');
  }
}

// Initialise class outside of the handler so context is reused.
const twitter = new Twitter();

// The handler simply executes the object handler
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => twitter.handler(event);