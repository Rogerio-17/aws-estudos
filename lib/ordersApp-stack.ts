import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs";
import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambdaEventSource from "aws-cdk-lib/aws-lambda-event-sources";

import { Construct } from "constructs";

interface OrdersAppStackProps extends cdk.StackProps {
  productsDdb: dynamodb.Table;
  eventsDdb: dynamodb.Table;
}

export class OrdersAppStack extends cdk.Stack {
  readonly ordersHandler: lambdaNodeJS.NodejsFunction;
  readonly orderEventsFetchHandler: lambdaNodeJS.NodejsFunction;

  constructor(scope: Construct, id: string, props: OrdersAppStackProps) {
    super(scope, id, props);

    const ordersDdb = new dynamodb.Table(this, "OrdersDdb", {
      tableName: "orders",
      partitionKey: {
        name: "pk",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "sk",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
    });

    //Orders Layer
    const ordersLayerArn = ssm.StringParameter.valueForStringParameter(
      this,
      "OrdersLayerVersionArn"
    );
    const ordersLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "OrdersLayerVersionArn",
      ordersLayerArn
    );

    //Orders API Layer
    const ordersApiLayerArn = ssm.StringParameter.valueForStringParameter(
      this,
      "OrdersApiLayerVersionArn"
    );
    const ordersApiLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "OrdersApiLayerVersionArn",
      ordersApiLayerArn
    );

    //Order Events Layer
    const orderEventsLayerArn = ssm.StringParameter.valueForStringParameter(
      this,
      "OrderEventsLayerVersionArn"
    );
    const orderEventsLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "OrderEventsLayerVersionArn",
      orderEventsLayerArn
    );

    //Order Events Repository Layer
    const orderEventsRepositoryLayerArn =
      ssm.StringParameter.valueForStringParameter(
        this,
        "OrderEventsRepositoryLayerVersionArn"
      );
    const orderEventsRepositoryLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "OrderEventsRepositoryLayerVersionArn",
      orderEventsRepositoryLayerArn
    );

    //Products Layer
    const productsLayerArn = ssm.StringParameter.valueForStringParameter(
      this,
      "ProductsLayerVersionArn"
    );
    const productsLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "ProductsLayer",
      productsLayerArn
    );

    // SNS
    const ordersTopic = new sns.Topic(this, "OrdersTopic", {
      displayName: "Orders events topic",
      topicName: "orders-events",
    });

    this.ordersHandler = new lambdaNodeJS.NodejsFunction(
      this,
      "OrdersFunction",
      {
        functionName: "OrdersFunction",
        entry: "lambda/orders/ordersFunction.ts",
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        memorySize: 512,
        timeout: cdk.Duration.seconds(2),
        bundling: {
          minify: true,
          sourceMap: false,
        },
        environment: {
          PRODUCTS_DDB: props.productsDdb.tableName,
          ORDERS_DDB: ordersDdb.tableName,
          ORDERS_EVENTS_TOPIC_ARN: ordersTopic.topicArn,
        },
        layers: [ordersLayer, productsLayer, ordersApiLayer, orderEventsLayer],
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
      }
    );

    ordersDdb.grantReadWriteData(this.ordersHandler);
    props.productsDdb.grantReadData(this.ordersHandler); // Da a permissão somente de leitura a tabela de pedidos
    ordersTopic.grantPublish(this.ordersHandler); // Permite que a função publique mensagens no tópico SNS

    const orderEventsHandler = new lambdaNodeJS.NodejsFunction(
      this,
      "OrderEventsFunction",
      {
        functionName: "OrderEventsFunction",
        entry: "lambda/orders/orderEventsFunction.ts",
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        memorySize: 512,
        timeout: cdk.Duration.seconds(2),
        bundling: {
          minify: true,
          sourceMap: false,
        },
        environment: {
          EVENTS_DDB: props.eventsDdb.tableName,
        },
        layers: [orderEventsLayer, orderEventsRepositoryLayer],
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
      }
    );

    ordersTopic.addSubscription(
      new subs.LambdaSubscription(orderEventsHandler)
    ); //Inscreve a função lambda como uma assinatura do tópico SNS

    const eventsDdbPolicy = new iam.PolicyStatement({
      // Da permissão especifica para a tabela de eventos
      effect: iam.Effect.ALLOW,
      actions: ["dynamodb:PutItem"],
      resources: [props.eventsDdb.tableArn],
      conditions: {
        ["ForAllValues:StringLike"]: {
          "dynamodb:LeadingKeys": ["#order_*"],
        },
      },
    });

    orderEventsHandler.addToRolePolicy(eventsDdbPolicy);

    const billingHandler = new lambdaNodeJS.NodejsFunction(
      this,
      "BillingFunction",
      {
        functionName: "BillingFunction",
        entry: "lambda/orders/billingFunction.ts",
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        memorySize: 512,
        timeout: cdk.Duration.seconds(2),
        bundling: {
          minify: true,
          sourceMap: false,
        },
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
      }
    );

    // ADICIONA FILTRO PARA A FUNÇÃO SER ACIONADA APENAS QUANDO O FILTRO FOR ATIVADO
    ordersTopic.addSubscription(
      new subs.LambdaSubscription(billingHandler, {
        filterPolicy: {
          eventType: sns.SubscriptionFilter.stringFilter({
            allowlist: ["ORDER_CREATED"],
          }),
        },
      })
    ); //Inscreve a função lambda como uma assinatura do tópico SNS

    // DLQ
    const orderEventsDlq = new sqs.Queue(this, "OrderEventsDlq", {
      queueName: "order-events-dlq",
      enforceSSL: false,
      encryption: sqs.QueueEncryption.UNENCRYPTED,
      retentionPeriod: cdk.Duration.days(10),
    });

    // Cria a fila SQS para eventos de pedidos
    const orderEventsQueue = new sqs.Queue(this, "OrderEventsQueue", {
      queueName: "order-events",
      enforceSSL: false, //Remove criptografia
      encryption: sqs.QueueEncryption.UNENCRYPTED,
      deadLetterQueue: {
        maxReceiveCount: 3, //Numero maximo de tentativas
        queue: orderEventsDlq,
      },
    });

    ordersTopic.addSubscription(
      new subs.SqsSubscription(orderEventsQueue, {
        filterPolicy: {
          eventType: sns.SubscriptionFilter.stringFilter({
            allowlist: ["ORDER_CREATED"],
          }),
        },
      })
    );

    const orderEmailsHandler = new lambdaNodeJS.NodejsFunction(
      this,
      "OrderEmailsFunction",
      {
        functionName: "OrderEmailsFunction",
        entry: "lambda/orders/orderEmailsFunction.ts",
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        memorySize: 512,
        timeout: cdk.Duration.seconds(2),
        bundling: {
          minify: true,
          sourceMap: false,
        },
        layers: [orderEventsLayer],
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
      }
    );

    // Adiciona a fonte de eventos SQS
    orderEmailsHandler.addEventSource(
      new lambdaEventSource.SqsEventSource(orderEventsQueue, {
        batchSize: 5, // A função será acionada quando houver 5 mensagens na fila
        enabled: true,
        maxBatchingWindow: cdk.Duration.minutes(1),
      })
    );
    // Adiciona permissão para consumo de mensagem
    orderEventsQueue.grantConsumeMessages(orderEmailsHandler);

    const orderEmailsSesPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["ses:SendEmail", "ses:SendRawEmail"],
      resources: ["*"],
    });

    orderEmailsHandler.addToRolePolicy(orderEmailsSesPolicy);

    this.orderEventsFetchHandler = new lambdaNodeJS.NodejsFunction(
      this,
      "OrderEventsFetchFunction",
      {
        functionName: "OrderEventsFetchFunction",
        entry: "lambda/orders/orderEventsFetchFunction.ts",
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        memorySize: 512,
        timeout: cdk.Duration.seconds(2),
        bundling: {
          minify: true,
          sourceMap: false,
        },
        environment: {
          EVENTS_DDB: props.eventsDdb.tableName,
        },
        layers: [orderEventsRepositoryLayer],
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
      }
    );

    const eventsFetchDdbPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["dynamodb:Query"],
      resources: [`${props.eventsDdb.tableArn}/index/emailIndex`],
    });

    this.orderEventsFetchHandler.addToRolePolicy(eventsFetchDdbPolicy);
  }
}
