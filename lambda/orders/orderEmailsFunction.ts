import { Context, SQSEvent, SNSMessage } from "aws-lambda";
import { SES, AWSError } from "aws-sdk";
import type { Envelope, OrderEvent } from "/opt/nodejs/orderEventsLayer";
import type { PromiseResult } from "aws-sdk/lib/request";

const sesClient = new SES();

export async function handler(
  event: SQSEvent,
  context: Context
): Promise<void> {
  const promises: Promise<PromiseResult<SES.SendEmailResponse, AWSError>>[] =
    [];

  event.Records.forEach((record) => {
    const body = JSON.parse(record.body) as SNSMessage;
    promises.push(sendOrderEmail(body));
  });

  await Promise.all(promises);

  return;
}

async function sendOrderEmail(body: SNSMessage) {
  const envelope = JSON.parse(body.Message) as Envelope;
  const event = JSON.parse(envelope.data) as OrderEvent;

  return sesClient
    .sendEmail({
      Destination: {
        ToAddresses: [event.email],
      },
      Message: {
        Subject: {
          Charset: "UTF-8",
          Data: `Recebemos seu pedido!`,
        },
        Body: {
          Text: {
            Charset: "UTF-8",
            Data: `Recebemos seu pedido com o ID #${event.orderId}, no valor de R$${event.billing.totalPrice}.`,
          },
        },
      },
      Source: "rogeriojmf10@gmail.com",
      ReplyToAddresses: ["rogeriojmf10@gmail.com"],
    })
    .promise();
}
