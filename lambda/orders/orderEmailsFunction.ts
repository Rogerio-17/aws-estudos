import { Context, SQSEvent } from "aws-lambda";

export async function handler(
  event: SQSEvent,
  context: Context
): Promise<void> {
  event.Records.forEach((record) => {
    console.log("Record: ", record);
    const body = JSON.parse(record.body);
    console.log("Body: ", body);
  });
}
