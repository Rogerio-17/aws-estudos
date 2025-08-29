import {
  APIGatewayProxyEvent,
  Context,
  APIGatewayProxyResult,
} from "aws-lambda";

export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  console.log("Invoice Disconnection function - event: ", event);

  return {
    statusCode: 200,
    body: "OK",
  };
}
