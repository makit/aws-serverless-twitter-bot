import { LexV2Event, LexV2Result } from 'aws-lambda';

class ChatBot {
  handler = async (event: LexV2Event): Promise<LexV2Result> => {
    console.info('Received Event:', JSON.stringify(event, null, 2));

    const content = event.sessionState.intent.name === 'Fact' ? this.getFact() : this.getDadJoke();
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
          content,
        }
      ] 
    }
  };

  getDadJoke = (): string => {
    // From https://icanhazdadjoke.com/ - They have an API but I wanted something quick and reliable
    const jokes = [
      "Some people say that comedians who tell one too many light bulb jokes soon burn out, but they don't know watt they are talking about. They're not that bright.",
      "Why was the big cat disqualified from the race? Because it was a cheetah.",
      "You know what they say about cliffhangers...",
      "Why does Superman get invited to dinners? Because he is a Supperhero.",
      "I've just been reading a book about anti-gravity, it's impossible to put down!",
      "I started a new business making yachts in my attic this year...the sails are going through the roof",
      "What happens to a frog's car when it breaks down? It gets toad.",
      "The Swiss must've been pretty confident in their chances of victory if they included a corkscrew in their army knife.",
    ];
    return jokes[Math.floor(Math.random()*jokes.length)];
  }

  getFact = (): string => {
    const jokes = [
      "The dot over the small letter 'i' is called a tittle.",
      "The plastic tips of shoelaces are called aglets.",
    ];
    return jokes[Math.floor(Math.random()*jokes.length)];
  }
}

// Initialise class outside of the handler so context is reused.
const chatBot = new ChatBot();

// The handler simply executes the object handler
export const handler = async (event: LexV2Event): Promise<LexV2Result> => chatBot.handler(event);