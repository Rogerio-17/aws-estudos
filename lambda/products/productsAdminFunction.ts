import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import { DynamoDB, Lambda } from "aws-sdk";
import { ProductRepository, type Product } from "/opt/nodejs/productsLayer";
import { ProductEvent, ProductEventType } from "/opt/nodejs/productEventsLayer";

const productDdb = process.env.PRODUCTS_DDB!;
const ProductEventsFunctionName = process.env.PRODUCTS_EVENTS_FUNCTION_NAME!;

const ddbClient = new DynamoDB.DocumentClient();
const lambdaClient = new Lambda();

const productRepository = new ProductRepository(ddbClient, productDdb);

export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  const lambdaRequestId = context.awsRequestId;
  const apiRequestId = event.requestContext?.requestId;

  console.log(
    `Lambda Request ID: ${lambdaRequestId} - API Request ID: ${apiRequestId}`
  );

  const method = event.httpMethod;

  if (event.resource === "/products") {
    const product = JSON.parse(event.body!) as Product;
    const productCreated = await productRepository.createProduct(product);

    const response = await sendProductEvent(
      productCreated,
      ProductEventType.CREATED,
      "jhondow@mail.com",
      lambdaRequestId
    );

    console.log(response);

    return {
      statusCode: 201,
      body: JSON.stringify({
        product: productCreated,
      }),
    };
  } else if (event.resource === "/products/{id}") {
    const productId = event.pathParameters!.id as string;

    if (method === "PUT") {
      console.log(`PUT /products/${productId}`);
      const product = JSON.parse(event.body!) as Product;

      try {
        const productUpdated = await productRepository.updateProduct(
          productId,
          product
        );

        const response = await sendProductEvent(
          productUpdated,
          ProductEventType.UPDATED,
          "jhondoe1@mail.com",
          lambdaRequestId
        );

        console.log(response);

        return {
          statusCode: 200,
          body: JSON.stringify({
            product: productUpdated,
          }),
        };
      } catch (ConditionalCheckFailedException) {
        return {
          statusCode: 404,
          body: JSON.stringify({
            message: `Product not found`,
          }),
        };
      }
    } else if (method === "DELETE") {
      console.log(`DELETE /products/${productId}`);

      try {
        const productDeleted = await productRepository.deleteProduct(productId);

        const response = await sendProductEvent(
          productDeleted,
          ProductEventType.DELETED,
          "jhondoe2@mail.com",
          lambdaRequestId
        );

        console.log(response);

        return {
          statusCode: 200,
          body: JSON.stringify({
            message: productDeleted,
          }),
        };
      } catch (error) {
        console.error((<Error>error).message);
        return {
          statusCode: 404,
          body: JSON.stringify({
            message: (<Error>error).message,
          }),
        };
      }
    }
  }

  return {
    statusCode: 400,
    body: JSON.stringify({
      message: "Bad Request",
    }),
  };
}

function sendProductEvent(
  product: Product,
  eventType: ProductEventType,
  email: string,
  lambdaRequestId: string
) {
  const event: ProductEvent = {
    requestId: lambdaRequestId,
    eventType: eventType,
    productId: product.id,
    productCode: product.code,
    productPrice: product.price,
    email: email,
  };

  return lambdaClient
    .invoke({
      FunctionName: ProductEventsFunctionName,
      Payload: JSON.stringify(event),
      InvocationType: "Event", //InvocationType: "RequestResponse" -> função síncrona | InvocationType: "Event" -> função assíncrona
    })
    .promise();
}
