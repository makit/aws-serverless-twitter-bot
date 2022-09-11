import * as firehose from 'aws-lambda/trigger/kinesis-firehose-transformation';

class TransformRecords {
  handler = async (event: firehose.FirehoseTransformationEvent): Promise<firehose.FirehoseTransformationResult> => {
    console.info('Received Event:', JSON.stringify(event, null, 2));

    let records: firehose.FirehoseTransformationResultRecord[] = [];

    for (const record of event.records) {
      const transformed = this.transformRecord(record);
      records.push(transformed);
    }
    
    return { records };
  };

  transformRecord = (record: firehose.FirehoseTransformationEventRecord): firehose.FirehoseTransformationResultRecord => {
    try {
      const payloadStr = Buffer.from(record.data, 'base64').toString();
      return {
        recordId: record.recordId,
        result: 'Ok',
        // Ensure that '\n' is appended to the record's JSON string so Kinesis puts JSON on different lines for Athena
        data: Buffer.from(payloadStr + '\n').toString('base64'),
      };
    } catch (error) {
      console.error('Error processing record', record, error);
      return {
        recordId: record.recordId,
        result: 'Dropped',
        data: Buffer.from('').toString('base64'),
      };
    }
  };
}

// Initialise class outside of the handler so context is reused.
const transformRecords = new TransformRecords();

// The handler simply executes the object handler
export const handler = async (event: firehose.FirehoseTransformationEvent): Promise<firehose.FirehoseTransformationResult> => transformRecords.handler(event);