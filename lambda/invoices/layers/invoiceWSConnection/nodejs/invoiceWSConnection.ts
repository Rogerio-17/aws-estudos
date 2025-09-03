import { ApiGatewayManagementApi } from "aws-sdk";

export class InvoiceWSService {
  private apiGatewayManagementApi: ApiGatewayManagementApi;

  constructor(apiGatewayManagementApi: ApiGatewayManagementApi) {
    this.apiGatewayManagementApi = apiGatewayManagementApi;
  }

  sendInvoiceStatus(
    transactionId: string,
    connectionId: string,
    status: string
  ): Promise<boolean> {
    const postData = JSON.stringify({ transactionId, status });
    return this.sendData(connectionId, postData);
  }

  async disconnectClient(connectionId: string): Promise<boolean> {
    try {
      await this.apiGatewayManagementApi // verifica se esta conectado
        .getConnection({
          ConnectionId: connectionId,
        })
        .promise();

      await this.apiGatewayManagementApi
        .deleteConnection({
          ConnectionId: connectionId,
        })
        .promise();

      return true;
    } catch (error) {
      console.error(`Error getting connection ${connectionId}:`, error);
      return false;
    }
  }

  async sendData(connectionId: string, data: string): Promise<boolean> {
    try {
      await this.apiGatewayManagementApi // verifica se esta conectado
        .getConnection({
          ConnectionId: connectionId,
        })
        .promise();

      await this.apiGatewayManagementApi
        .postToConnection({
          ConnectionId: connectionId,
          Data: data,
        })
        .promise();

      return true;
    } catch (error) {
      console.error(`Error getting connection ${connectionId}:`, error);
      return false;
    }
  }
}
