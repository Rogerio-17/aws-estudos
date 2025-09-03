import { Context, S3Event, S3EventRecord } from "aws-lambda";
import { ApiGatewayManagementApi, DynamoDB, S3 } from "aws-sdk";
import {
  InvoiceTransactionRepository,
  InvoiceTransactionStatus,
} from "/opt/nodejs/invoiceTransaction";
import { InvoiceWSService } from "/opt/nodejs/invoiceWSConnection";
import { InvoiceRepository, InvoiceFile } from "/opt/nodejs/invoiceRepository";

const invoiceDdb = process.env.INVOICE_DDB!;
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
const invoiceRepository = new InvoiceRepository(ddbClient, invoiceDdb);

export async function handler(event: S3Event, context: Context): Promise<void> {
  const promises: Promise<void>[] = [];

  event.Records.forEach((record) => {
    promises.push(processRecord(record, context));
  });

  await Promise.all(promises);
}

async function processRecord(
  record: S3EventRecord,
  context: Context
): Promise<void> {
  const key = record.s3.object.key;

  try {
    const invoiceTransaction =
      await invoiceTransactionRepository.getInvoiceTransaction(key);

    if (
      invoiceTransaction.transactionStatus ===
      InvoiceTransactionStatus.GENERATED
    ) {
      await Promise.all([
        invoiceWSService.sendInvoiceStatus(
          key,
          invoiceTransaction.connectionId,
          InvoiceTransactionStatus.RECEIVED
        ),

        invoiceTransactionRepository.updateInvoiceTransaction(
          key,
          InvoiceTransactionStatus.RECEIVED
        ),
      ]);
    } else {
      await invoiceWSService.sendInvoiceStatus(
        key,
        invoiceTransaction.connectionId,
        invoiceTransaction.transactionStatus
      );

      console.error(`Non valid transaction status`);
    }

    const object = await s3Client
      .getObject({
        Key: key,
        Bucket: record.s3.bucket.name,
      })
      .promise();

    const invoice = JSON.parse(object.Body!.toString("utf-8")) as InvoiceFile;

    if (invoice.invoiceNumber.length >= 5) {
      const createInvoicePromise = invoiceRepository.createInvoice({
        pk: `#invoice_${invoice.customerName}`,
        sk: invoice.invoiceNumber,
        ttl: 0,
        totalValue: invoice.totalValue,
        productId: invoice.productId,
        quantity: invoice.quantity,
        transactionId: key,
        createdAt: Date.now(),
      });

      const deleteObjectPromise = s3Client
        .deleteObject({
          Key: key,
          Bucket: record.s3.bucket.name,
        })
        .promise();

      const updateInvoicePromise =
        invoiceTransactionRepository.updateInvoiceTransaction(
          key,
          InvoiceTransactionStatus.PROCESSED
        );

      const sendStatusPromise = invoiceWSService.sendInvoiceStatus(
        key,
        invoiceTransaction.connectionId,
        InvoiceTransactionStatus.PROCESSED
      );

      await Promise.all([
        createInvoicePromise,
        deleteObjectPromise,
        updateInvoicePromise,
        sendStatusPromise,
      ]);
    } else {
      await Promise.all([
        invoiceWSService.sendInvoiceStatus(
          key,
          invoiceTransaction.connectionId,
          InvoiceTransactionStatus.NON_VALID_INVOICE_NUMBER
        ),

        invoiceTransactionRepository.updateInvoiceTransaction(
          key,
          InvoiceTransactionStatus.NON_VALID_INVOICE_NUMBER
        ),

        invoiceWSService.disconnectClient(invoiceTransaction.connectionId),
      ]);
    }
  } catch (error) {
    console.log((<Error>error).message);
  }
}
