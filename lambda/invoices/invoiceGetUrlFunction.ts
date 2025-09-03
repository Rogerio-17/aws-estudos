import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import { ApiGatewayManagementApi, DynamoDB, S3 } from "aws-sdk";
import { v4 as uuid } from "uuid";
import {
  InvoiceTransactionRepository,
  InvoiceTransactionStatus,
} from "/opt/nodejs/invoiceTransaction";
import { InvoiceWSService } from "/opt/nodejs/invoiceWSConnection";

const invoiceDdb = process.env.INVOICE_DDB!;
const bucketName = process.env.BUCKET_NAME!;
const invoiceWsApiEndpoint = process.env.INVOICE_WSAPI_ENDPOINT!.substring(6);

const s3Client = new S3();
const ddbClient = new DynamoDB.DocumentClient();
const apigwManagementApi = new ApiGatewayManagementApi({
  endpoint: invoiceWsApiEndpoint,
});

const invoiceTransactionRepository = new InvoiceTransactionRepository(
  ddbClient,
  invoiceDdb
);

const invoiceWSService = new InvoiceWSService(apigwManagementApi);

export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  // - Remover depois
  console.log(event);

  const lambdaRequestId = context.awsRequestId;
  const connectionId = event.requestContext.connectionId!; // ID do cliente conectado

  console.log(
    `Conexão ID: ${connectionId} Lambda Request ID: ${lambdaRequestId}`
  );

  const key = uuid();
  const expires = 60 * 5; // 5 minutos

  const signedUrlPut = await s3Client.getSignedUrlPromise("putObject", {
    Bucket: bucketName,
    Key: key,
    Expires: expires,
  });

  // Create invoice transaction
  const timestamp = Date.now();
  const ttl = ~~(timestamp / 1000 + 60 * 2); // 2 minutos

  await invoiceTransactionRepository.createInvoiceTransaction({
    pk: `#transaction`,
    sk: key,
    ttl,
    requestId: lambdaRequestId,
    transactionStatus: InvoiceTransactionStatus.GENERATED,
    timestamp,
    expiresIn: expires,
    connectionId,
    endpoint: invoiceWsApiEndpoint,
  });

  // Send URL back to WS connected client
  const postData = JSON.stringify({
    url: signedUrlPut,
    expires: expires,
    transactionId: key,
  });

  await invoiceWSService.sendData(connectionId, postData);

  return {
    statusCode: 200,
    body: "OK",
  };
}
