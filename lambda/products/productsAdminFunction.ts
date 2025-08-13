import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import { DynamoDB } from "aws-sdk";
import { ProductRepository, type Product } from "/opt/nodejs/productsLayer";
//import * as AWS from "aws-sdk";
//import * as AWSXRay from "aws-xray-sdk";

//AWSXRay.captureAWS(AWS);

const productDdb = process.env.PRODUCTS_DDB!;
const ddbClient = new DynamoDB.DocumentClient();

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
