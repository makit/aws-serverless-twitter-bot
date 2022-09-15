import * as aws from 'aws-sdk';
import * as crypto from 'crypto';
import * as https from 'https';
import * as stream from 'stream';
import * as path from 'path';

interface DownloadImagesEvent {
  imageUrls: string[]
}

interface DownloadImagesResponse {
  Images: DownloadImagesImage[]
}

interface DownloadImagesImage {
  Key: string
}

class DownloadImages {
  private readonly _bucket: string;

  private readonly _s3: aws.S3;

  constructor() {
    const { Bucket } = process.env;

    if (!Bucket) {
      throw new Error('Missing environment variables');
    }

    this._bucket = Bucket;
    this._s3 = new aws.S3();

    console.info('Initialised');
  }

  handler = async (event: DownloadImagesEvent): Promise<DownloadImagesResponse> => {
    console.info('Received Event:', JSON.stringify(event, null, 2));

    const promises = event.imageUrls.map(e => this.handleSingleImage(e));
    
    console.info('Waiting for all promises to complete');
    const results = await Promise.allSettled(promises);
    console.info('All promises completed', JSON.stringify(results, null, 2));

    const fulfilledResults = (results.filter(c=>c.status === 'fulfilled') as PromiseFulfilledResult<string>[]);
    return {
      Images: fulfilledResults.map(k => { return { Key: k.value }; }),
    };
  };

  handleSingleImage = async (url: string): Promise<string> => {
    
    const passthroughStream = new stream.PassThrough();
    https.get(url, resp => resp.pipe(passthroughStream));

    const date = new Date();
    const key = `${date.getFullYear()}/${date.getMonth()}/${date.getDay()}/${crypto.randomUUID()}${path.extname(url)}`;

    console.info('Putting image into bucket', url, key);

    const result = await this._s3.upload({
      Bucket: this._bucket,
      Key: key,
      Body: passthroughStream,
    }).promise();

    console.info('Image put into bucket', url, key, result);

    return key;
  };
}

// Initialise class outside of the handler so context is reused.
const downloadImages = new DownloadImages();

// The handler simply executes the object handler
export const handler = async (event: DownloadImagesEvent): Promise<DownloadImagesResponse> => downloadImages.handler(event);