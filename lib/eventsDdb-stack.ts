import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

export class EventsDdbStack extends cdk.Stack {
  readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.table = new dynamodb.Table(this, "EventsDdb", {
      tableName: "events",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      partitionKey: {
        name: "pk",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "sk",
        type: dynamodb.AttributeType.STRING,
      },
      timeToLiveAttribute: "ttl", // atributo opcional usado para apagar itens automaticamente de acordo com a data de expiração em segundos
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // Modo On-Demand
      // readCapacity: 1, --- Modo Provisionado
      // writeCapacity: 1, --- Modo Provisionado
    });

    this.table.addGlobalSecondaryIndex({
      indexName: "emailIndex", // Nome do índice
      partitionKey: {
        name: "email", // Nome do campo que vai ser atrelado ao indexName
        type: dynamodb.AttributeType.STRING, //Tipo
      },
      sortKey: {
        name: "sk",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // // ------ Modo Provisionado ------
    // // ---- Configuração de autoScale na tabela de eventos ----

    // //Aumenta a capacidade de leitura para 2 RCU caso se a capacidade de leitura ultrapassar 50%
    // const readScale = this.table.autoScaleReadCapacity({
    //   minCapacity: 1,
    //   maxCapacity: 2,
    // });
    // readScale.scaleOnUtilization({
    //   targetUtilizationPercent: 50, // 50%
    //   scaleInCooldown: cdk.Duration.seconds(60), // Tempo para voltar para a capacidade anterior
    //   scaleOutCooldown: cdk.Duration.seconds(60), // Tempo para aumentar a capacidade
    // });

    // //Aumenta a capacidade de gravação para até 4 WCU caso se a capacidade de gravação por segundo ultrapassar 30%
    // const writeCapacity = this.table.autoScaleWriteCapacity({
    //   minCapacity: 1,
    //   maxCapacity: 4,
    // });
    // writeCapacity.scaleOnUtilization({
    //   targetUtilizationPercent: 30, // 30%
    //   scaleInCooldown: cdk.Duration.seconds(60), // Tempo para voltar para a capacidade anterior
    //   scaleOutCooldown: cdk.Duration.seconds(60), // Tempo para aumentar a capacidade
    // });
  }
}
