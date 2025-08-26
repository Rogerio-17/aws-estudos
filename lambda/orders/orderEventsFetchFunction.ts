import { DynamoDB } from "aws-sdk";
import {
  OrderEventRepository,
  OrderEventDdb,
} from "/opt/nodejs/orderEventsRepositoryLayer";
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";

const eventsDdb = process.env.EVENTS_DDB!;

const ddbClient = new DynamoDB.DocumentClient();
const orderEventsRepository = new OrderEventRepository(ddbClient, eventsDdb);

export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  const email = event.pathParameters!.email!;
  const eventType = event.pathParameters?.eventType;

  if (eventType) {
    const orderEvents =
      await orderEventsRepository.getOrderEventsByEmailAndEventType(
        email,
        eventType
      );

    return {
      statusCode: 200,
      body: JSON.stringify(convertOrdersEventsToResponse(orderEvents)),
    };
  } else {
    const orderEvents = await orderEventsRepository.getOrderEventsByEmail(
      email
    );

    return {
      statusCode: 200,
      body: JSON.stringify(convertOrdersEventsToResponse(orderEvents)),
    };
  }
}

function convertOrdersEventsToResponse(orderEvents: OrderEventDdb[]) {
  return orderEvents.map((orderEvent) => ({
    email: orderEvent.email,
    createdAt: orderEvent.createdAt,
    eventType: orderEvent.eventType,
    requestId: orderEvent.requestId,
    orderId: orderEvent.info.orderId,
    productsCode: orderEvent.info.productCodes,
  }));
}
