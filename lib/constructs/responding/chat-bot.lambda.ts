import * as aws from 'aws-sdk';
import { EventBridgeEvent } from 'aws-lambda';

type MessageAnalysedDetailType = "MESSAGE_ANALYSED";

interface MessageAnalysedDetail {
  Author: string,
  Text: string,
  Twitter: TwitterDetail,
}

interface TwitterDetail {
  UserId: number,
  TweetId: number,
}


class ChatBot {
  private readonly _eventBusName: string;
  private readonly _botId: string;
  private readonly _botAliasId: string;
  private readonly _botLocaleId: string;
  private readonly _lex: aws.LexRuntimeV2;
  private readonly _eventBridge: aws.EventBridge;

  constructor() {
    const { BotId, BotAliasId, BotLocaleId, EventBusName } = process.env;

    if (!BotId || !BotAliasId || !BotLocaleId || !EventBusName) {
      throw new Error('Missing environment variables');
    }

    this._botId = BotId;
    this._botAliasId = BotAliasId;
    this._botLocaleId = BotLocaleId;
    this._eventBusName = EventBusName;
    this._lex = new aws.LexRuntimeV2();
    this._eventBridge = new aws.EventBridge();

    console.info('Initialised');
  }

  handler = async (event: EventBridgeEvent<MessageAnalysedDetailType, MessageAnalysedDetail>): Promise<boolean> => {
    console.info('Received Event:', JSON.stringify(event, null, 2));

    // Can't handle if no text.
    if (!event.detail.Text) {
      return false;
    }

    const response = await this._lex.recognizeText({
      botId: this._botId,
      botAliasId: this._botAliasId,
      localeId: this._botLocaleId,
      sessionId: event.detail.Author,
      text: event.detail.Text,
    }).promise();

    console.info('Response:', JSON.stringify(response, null, 2));

    if (response && response.messages && response.messages.length > 0 && response.messages[0].content) {
      const respondEvent = this.generateEvent(`@${event.detail.Author} ${response.messages[0].content}`, event.detail.Twitter);

      console.info('Pushing to event bridge', JSON.stringify(respondEvent, null, 2));

      const putResponse = await this._eventBridge.putEvents({
        Entries: [respondEvent],
      }).promise();

      console.log('Pushed to EventBridge', JSON.stringify(putResponse, null, 2))
    }

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
const chatBot = new ChatBot();

// The handler simply executes the object handler
export const handler = async (event: EventBridgeEvent<MessageAnalysedDetailType, MessageAnalysedDetail>): Promise<boolean> => chatBot.handler(event);