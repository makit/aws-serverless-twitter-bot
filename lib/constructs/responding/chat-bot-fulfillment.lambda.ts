import { LexV2Event, LexV2Result } from 'aws-lambda';

class ChatBot {
  handler = async (event: LexV2Event): Promise<LexV2Result> => {
    console.info('Received Event:', JSON.stringify(event, null, 2));

    // TODO

    return {
      sessionState: {
        intent: {
          name: event.sessionState.intent.name,
          state: 'Fulfilled',
        },
        dialogAction: {
          type: 'Close',
        }
      },
      messages: [
        {
          contentType: 'PlainText',
          content: 'Hello there',
        }
      ] 
    }
  };
}

// Initialise class outside of the handler so context is reused.
const chatBot = new ChatBot();

// The handler simply executes the object handler
export const handler = async (event: LexV2Event): Promise<LexV2Result> => chatBot.handler(event);