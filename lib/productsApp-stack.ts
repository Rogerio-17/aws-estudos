import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs";
import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ssm from "aws-cdk-lib/aws-ssm";

import { Construct } from "constructs";

export class ProductsAppStack extends cdk.Stack {
  readonly productsFunctionHandler: lambdaNodeJS.NodejsFunction;
  readonly productsAdminHandler: lambdaNodeJS.NodejsFunction;
  readonly productsDdb: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
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
          //nodeModules: ["aws-xray-sdk-core"],
          //forceDockerBundling: false,
        },
        environment: {
          PRODUCTS_DDB: this.productsDdb.tableName,
        },
        layers: [productsLayer],
        //tracing: lambda.Tracing.ACTIVE, // Serve para fazer o mapeamento do recursos que as funções Lambda estão utilizando (gera custo adicional)
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
          //nodeModules: ["aws-xray-sdk-core"],
        },
        environment: {
          PRODUCTS_DDB: this.productsDdb.tableName,
        },
        layers: [productsLayer],
        //tracing: lambda.Tracing.ACTIVE, // Serve para fazer o mapeamento do recursos que as funções Lambda estão utilizando (gera custo adicional)
      }
    );
    // Dar permissões necessárias para a função Lambda escrever dados da tabela DynamoDB
    this.productsDdb.grantWriteData(this.productsAdminHandler);
  }
}
