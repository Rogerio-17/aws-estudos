import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs";
import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sqs from "aws-cdk-lib/aws-sqs";

import { Construct } from "constructs";

interface ProductsAppStackProps extends cdk.StackProps {
  eventsDdb: dynamodb.Table;
}

export class ProductsAppStack extends cdk.Stack {
  readonly productsFunctionHandler: lambdaNodeJS.NodejsFunction;
  readonly productsAdminHandler: lambdaNodeJS.NodejsFunction;
  readonly productsDdb: dynamodb.Table;

  constructor(scope: Construct, id: string, props: ProductsAppStackProps) {
    super(scope, id, props);

    // Define a DynamoDB table for products
    this.productsDdb = new dynamodb.Table(this, "ProductsDdb", {
      tableName: "products",
      removalPolicy: cdk.RemovalPolicy.DESTROY, // NOT recommended for production code
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
    });

    // Products Layer
    const productsLayerArn = ssm.StringParameter.valueForStringParameter(
      this,
      "ProductsLayerVersionArn"
    );
    const productsLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "ProductsLayer",
      productsLayerArn
    );

    // Product Events Layer
    const productEventsLayerArn = ssm.StringParameter.valueForStringParameter(
      this,
      "ProductEventsLayerVersionArn"
    );
    const productEventsLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "ProductEventsLayerVersionArn",
      productEventsLayerArn
    );

    //Cria fila do SQS
    const dlq = new sqs.Queue(this, "ProductsEventsDlq", {
      queueName: "products-events-dlq",
      retentionPeriod: cdk.Duration.days(10),
    });

    // Define uma lambda function criar eventos de produtos
    const productEventsHandler = new lambdaNodeJS.NodejsFunction(
      this,
      "ProductsEventsFunction",
      {
        functionName: "ProductsEventsFunction",
        entry: "lambda/products/ProductEventsFunction.ts",
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
        deadLetterQueueEnabled: true,
        deadLetterQueue: dlq,
        layers: [productEventsLayer],
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
      }
    );

    const eventsDdbPolicy = new iam.PolicyStatement({
      // Da permissão especifica para a tabela de eventos
      effect: iam.Effect.ALLOW,
      actions: ["dynamodb:PutItem"],
      resources: [props.eventsDdb.tableArn],
      conditions: {
        ["ForAllValues:StringLike"]: {
          "dynamodb:LeadingKeys": ["#product_*"],
        },
      },
    });

    productEventsHandler.addToRolePolicy(eventsDdbPolicy); // Define o tipo de permissão que a função vai ter dentro do DynamoDB

    // Define uma lambda function para buscar produtos
    this.productsFunctionHandler = new lambdaNodeJS.NodejsFunction(
      this,
      "ProductsFetchFunction",
      {
        functionName: "ProductsFetchFunction",
        entry: "lambda/products/productsFetchFunction.ts",
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        memorySize: 512,
        timeout: cdk.Duration.seconds(5),
        bundling: {
          minify: true,
          sourceMap: false,
        },
        environment: {
          PRODUCTS_DDB: this.productsDdb.tableName,
        },
        layers: [productsLayer],
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
      }
    );
    // Dar permissões necessárias para a função Lambda ler dados da tabela DynamoDB
    this.productsDdb.grantReadData(this.productsFunctionHandler);

    // Define uma outra função Lambda para tarefas administrativas em produtos
    this.productsAdminHandler = new lambdaNodeJS.NodejsFunction(
      this,
      "ProductsAdminFunction",
      {
        functionName: "ProductsAdminFunction",
        entry: "lambda/products/productsAdminFunction.ts",
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        memorySize: 512,
        timeout: cdk.Duration.seconds(5),
        bundling: {
          minify: true,
          sourceMap: false,
          //nodeModules: ["aws-xray-sdk-core"], // Verificar se ainda vai da error de build
        },
        environment: {
          PRODUCTS_DDB: this.productsDdb.tableName,
          PRODUCTS_EVENTS_FUNCTION_NAME: productEventsHandler.functionName,
        },
        layers: [productsLayer, productEventsLayer],
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
      }
    );
    // Dar permissões necessárias para a função Lambda escrever dados da tabela DynamoDB
    this.productsDdb.grantWriteData(this.productsAdminHandler);
    productEventsHandler.grantInvoke(this.productsAdminHandler); // Da permissão para a função de administração invocar a função de eventos
  }
}
