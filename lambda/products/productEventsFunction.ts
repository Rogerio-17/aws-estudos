import { Callback, Context } from "aws-lambda";
import { ProductEvent } from "/opt/nodejs/productEventsLayer";
import { DynamoDB } from "aws-sdk";

const eventsDdb = process.env.EVENTS_DDB!;
const ddbClient = new DynamoDB.DocumentClient();

export async function handler(
  event: ProductEvent,
  context: Context,
  callback: Callback
): Promise<void> {
  // TODO - TO BE REMOVED
  console.log(event);

  console.log(`Lambda requestId: ${event.requestId}`);

  await createEvent(event);

  callback(
    null,
    JSON.stringify({
      productEventCreated: true,
      message: "OK",
    })
  );
}

function createEvent(event: ProductEvent) {
  const timestamp = Date.now();
  const ttl = ~~(timestamp / 1000 + 5 * 60); // 5 minutos

  return ddbClient
    .put({
      TableName: eventsDdb,
      Item: {
        pk: `#product_${event.productCode}`,
        sk: `${event.eventType}#${timestamp}`, // PRODUCT_CREATED#254255
        email: event.email,
        requestId: event.requestId,
        eventType: event.eventType,
        createdAt: timestamp,
        info: {
          productId: event.productId,
          price: event.productPrice,
        },
        ttl: ttl,
      },
    })
    .promise();
}
