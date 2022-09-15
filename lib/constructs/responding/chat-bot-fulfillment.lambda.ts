import { LexV2Event, LexV2Result } from 'aws-lambda';
import axios from 'axios';

class ChatBot {
  handler = async (event: LexV2Event): Promise<LexV2Result> => {
    console.info('Received Event:', JSON.stringify(event, null, 2));

    const content = await (event.sessionState.intent.name === 'Fact' ? this.getFact() : this.getDadJoke());
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

  getDadJoke = async (): Promise<string> => {
    try {
      const response = await axios.get("https://icanhazdadjoke.com/", {
        headers: {
          Accept: "application/json",
          "User-Agent": "axios 0.21.1"
        },
        timeout: 700,
      });
      console.info('Received dad joke: ', response.data);
      return response.data.joke;
    } catch (err) {
      console.error("Error getting joke: ", err);

      // Backup with random joke from list
      const jokes = [
        "Some people say that comedians who tell one too many light bulb jokes soon burn out, but they don't know watt they are talking about. They're not that bright.",
        "Why was the big cat disqualified from the race? Because it was a cheetah.",
        "You know what they say about cliffhangers...",
        "Why does Superman get invited to dinners? Because he is a Supperhero.",
        "I've just been reading a book about anti-gravity, it's impossible to put down!",
        "I started a new business making yachts in my attic this year...the sails are going through the roof",
        "What happens to a frog's car when it breaks down? It gets toad.",
        "The Swiss must've been pretty confident in their chances of victory if they included a corkscrew in their army knife.",
        "My wife told me to rub the herbs on the meat for better flavor. That's sage advice.",
      ];
      return jokes[Math.floor(Math.random()*jokes.length)];
    }
  }

  getFact = async (): Promise<string> => {
    try {
      const response = await axios.get("https://uselessfacts.jsph.pl/random.json?language=en", {
        headers: {
          Accept: "application/json",
          "User-Agent": "axios 0.21.1"
        },
        timeout: 700,
      });
      console.info('Received fact: ', response.data);
      return response.data.text;
    } catch (err) {
      console.error("Error getting fact: ", err);
      const facts = [
        "The dot over the small letter 'i' is called a tittle.",
        "The plastic tips of shoelaces are called aglets.",
        "Arnold Schonberg suffered from triskaidecaphobia, the fear of the number 13.  He died at 13 minutes from midnight on Friday the 13th.",
        "Giraffes have no vocal cords.",
        "70% of all boats sold are used for fishing.",
        "It is illegal to hunt camels in the state of Arizona",
        "More human twins are being born now than ever before.",
        "A narwhal's tusk reveals its past living conditions.",
        "The first person convicted of speeding was going eight mph.",
        "The world wastes about 1 billion metric tons of food each year.",
      ];
      return facts[Math.floor(Math.random()*facts.length)];
    }
  }
}

// Initialise class outside of the handler so context is reused.
const chatBot = new ChatBot();

// The handler simply executes the object handler
export const handler = async (event: LexV2Event): Promise<LexV2Result> => chatBot.handler(event);