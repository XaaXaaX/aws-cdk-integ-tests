import { SQSEvent } from 'aws-lambda';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

const DDB_CLIENT = new DynamoDBClient({});

export const handler = async(event: SQSEvent): Promise<void> => {
  await Promise.all(event.Records.map(async (record) => {
    console.log('record : ', record);
    const eventMessage = JSON.parse(record.body ?? '{}');
    if(eventMessage.type === 'sp-item') {
      throw new Error(`item is a sp-item`);
    }

    const params = {
      TableName: process.env.ITEM_TABLE_NAME,
      Item: marshall(eventMessage),
    };

    try {
      await DDB_CLIENT.send(new PutItemCommand(params));

    } catch (err) {
        console.error('Error', err);
        throw err;
    }

  }));
}