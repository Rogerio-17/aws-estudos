import { DynamoDB } from "aws-sdk";
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

const ordersDdb = process.env.ORDERS_DDB!;
const productsDdb = process.env.PRODUCTS_DDB!;

const ddbClient = new DynamoDB.DocumentClient();

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
      const orderCreated = await ordersRepository.createOrder(order);

      return {
        statusCode: 201,
        body: JSON.stringify(convertToOrderResponse(orderCreated)),
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
