import { DynamoDB, SNS } from "aws-sdk";
import { OrderRepository, type Order } from "/opt/nodejs/ordersLayer";
import { ProductRepository, type Product } from "/opt/nodejs/productsLayer";
import {
  APIGatewayProxyEvent,
  Context,
  type APIGatewayProxyResult,
} from "aws-lambda";
import type {
  CarrierType,
  OrderProductResponse,
  OrderRequest,
  OrderResponse,
  PaymentType,
  ShippingType,
} from "./layers/ordersApiLayer/nodejs/orderApi";
import {
  OrderEvent,
  OrderEventType,
  Envelope,
} from "/opt/nodejs/orderEventsLayer";
import { v4 as uuid } from "uuid";

const ordersDdb = process.env.ORDERS_DDB!;
const productsDdb = process.env.PRODUCTS_DDB!;
const orderEventsTopicArn = process.env.ORDERS_EVENTS_TOPIC_ARN!;

const ddbClient = new DynamoDB.DocumentClient();
const snsClient = new SNS();

const ordersRepository = new OrderRepository(ddbClient, ordersDdb);
const productsRepository = new ProductRepository(ddbClient, productsDdb);

export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  const method = event.httpMethod;
  const apiRequestId = event.requestContext.requestId;
  const lambdaRequestId = context.awsRequestId;
  const params = event.queryStringParameters;

  console.log(
    `API gateway request ID: ${apiRequestId} - Lambda request ID: ${lambdaRequestId}`
  );

  if (method === "POST") {
    // Handle POST request
    console.log("POST /orders");
    const orderRequest = JSON.parse(event.body!) as OrderRequest;
    const products = await productsRepository.getProductsByIds(
      orderRequest.productIds
    );

    if (products.length === orderRequest.productIds.length) {
      const order = buildOrder(orderRequest, products);
      const orderCreatedPromise = ordersRepository.createOrder(order);

      const eventResultPromise = sendOrderEvent(
        order,
        OrderEventType.CREATED,
        lambdaRequestId
      );

      const results = await Promise.all([
        orderCreatedPromise,
        eventResultPromise,
      ]);

      console.log(`Order created event sent - OrderId: ${order.sk} 
        - MessageId: ${results[1].MessageId}
        `);

      return {
        statusCode: 201,
        body: JSON.stringify(convertToOrderResponse(order)),
      };
    } else {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Products not found" }),
      };
    }
  } else if (method === "GET") {
    if (params) {
      const email = params!.email;
      const orderId = params!.orderId;

      if (email) {
        if (orderId) {
          // pega um pedido de um usuario
          try {
            const order = await ordersRepository.getOrder(email, orderId);

            return {
              statusCode: 200,
              body: JSON.stringify(convertToOrderResponse(order)),
            };
          } catch (error) {
            console.log((<Error>error).message);
            return {
              statusCode: 404,
              body: JSON.stringify({ message: "New error", error }),
            };
          }
        } else {
          // pega todos os pedidos de um usuario
          const orders = await ordersRepository.getOrderByEmail(email);
          return {
            statusCode: 200,
            body: JSON.stringify(orders.map(convertToOrderResponse)),
          };
        }
      }
    } else {
      const orders = await ordersRepository.getAllOrders();

      return {
        statusCode: 200,
        body: JSON.stringify(orders.map(convertToOrderResponse)),
      };
    }
  } else if (method === "DELETE") {
    // Handle DELETE request
    console.log("DELETE /orders");

    const email = params!.email!;
    const orderId = params!.orderId!;

    try {
      const orderDeleted = await ordersRepository.deleteOrder(email, orderId);

      const eventResult = await sendOrderEvent(
        orderDeleted,
        OrderEventType.DELETED,
        lambdaRequestId
      );
      console.log(`Order deleted event sent - OrderId: ${orderDeleted.sk} 
        - MessageId: ${eventResult.MessageId}
        `);

      return {
        statusCode: 204,
        body: JSON.stringify(convertToOrderResponse(orderDeleted)),
      };
    } catch (error) {
      console.log((<Error>error).message);
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Order not found" }),
      };
    }
  }

  return {
    statusCode: 400,
    body: JSON.stringify({ message: "Bad Request" }),
  };
}

async function sendOrderEvent(
  order: Order,
  eventType: OrderEventType,
  lambdaRequestId: string
) {
  const productsCodes: string[] = [];

  order.products.forEach((product) => {
    productsCodes.push(product.code);
  });

  const orderEvent: OrderEvent = {
    email: order.pk,
    orderId: order.sk!,
    billing: order.billing,
    shipping: order.shipping,
    requestId: lambdaRequestId,
    productCodes: productsCodes,
  };

  const envelope: Envelope = {
    eventType: eventType,
    data: JSON.stringify(orderEvent),
  };

  return snsClient
    .publish({
      TopicArn: orderEventsTopicArn,
      Message: JSON.stringify(envelope),
      MessageAttributes: {
        eventType: {
          DataType: "String",
          StringValue: eventType,
        },
      },
    })
    .promise();
}

function convertToOrderResponse(order: Order): OrderResponse {
  const orderProductResponse: OrderProductResponse[] = [];
  order.products.forEach((product) => {
    orderProductResponse.push({
      code: product.code,
      price: product.price,
    });
  });

  const orderResponse: OrderResponse = {
    email: order.pk,
    id: order.sk!,
    products: orderProductResponse,
    createdAt: order.createdAt!,
    billing: {
      payment: order.billing.payment as PaymentType,
      totalPrice: order.billing.totalPrice,
    },
    shipping: {
      carrier: order.shipping.carrier as CarrierType,
      type: order.shipping.type as ShippingType,
    },
  };

  return orderResponse;
}

function buildOrder(orderRequest: OrderRequest, products: Product[]): Order {
  const orderProduct: OrderProductResponse[] = [];
  let totalPrice = 0;

  products.forEach((product) => {
    totalPrice += product.price;

    orderProduct.push({
      code: product.code,
      price: product.price,
    });
  });

  const order: Order = {
    pk: orderRequest.email,
    sk: uuid(),
    createdAt: Date.now(),
    billing: {
      payment: orderRequest.payment,
      totalPrice: totalPrice,
    },
    shipping: {
      carrier: orderRequest.shipping.carrier,
      type: orderRequest.shipping.type,
    },
    products: orderProduct,
  };

  return order;
}
