import { DocumentClient } from "aws-sdk/clients/dynamodb";
import { v4 as uuid } from "uuid";

export interface Product {
  id: string;
  productName: string;
  code: string;
  price: number;
  model: string;
  productUrl: string;
}

export class ProductRepository {
  private ddbClient: DocumentClient;
  private productsDdb: string;

  constructor(ddbClient: DocumentClient, productsDdb: string) {
    this.ddbClient = ddbClient;
    this.productsDdb = productsDdb;
  }

  async getAllProducts(): Promise<Product[]> {
    const data = await this.ddbClient
      .scan({
        TableName: this.productsDdb,
      })
      .promise();

    return data.Items as Product[];
  }

  async getProductById(productId: string): Promise<Product> {
    const data = await this.ddbClient
      .get({
        TableName: this.productsDdb,
        Key: { id: productId },
      })
      .promise();

    if (data.Item) {
      return data.Item as Product;
    }

    throw new Error("Product not found");
  }

  async getProductsByIds(productIds: string[]): Promise<Product[]> {
    const keys: { id: string }[] = [];

    productIds.forEach((productId) => {
      keys.push({ id: productId });
    });

    const data = await this.ddbClient
      .batchGet({
        // Se eu quiser usar os mesmos parametos para fazer requisição em duas tableas diferentes eu consigo.
        RequestItems: {
          [this.productsDdb]: {
            Keys: keys,
          },
        },
      })
      .promise();

    return (data.Responses![this.productsDdb] as Product[]) || [];
  }

  async createProduct(product: Product): Promise<Product> {
    product.id = uuid();

    await this.ddbClient
      .put({
        TableName: this.productsDdb,
        Item: product,
      })
      .promise();

    return product;
  }

  async deleteProduct(productId: string): Promise<Product> {
    const data = await this.ddbClient
      .delete({
        TableName: this.productsDdb,
        Key: { id: productId },
        ReturnValues: "ALL_OLD",
      })
      .promise();

    if (data.Attributes) {
      return data.Attributes as Product;
    }

    throw new Error("Product not found");
  }

  async updateProduct(productId: string, product: Product): Promise<Product> {
    const data = await this.ddbClient
      .update({
        TableName: this.productsDdb,
        Key: {
          id: productId, // Id do produto
        },
        ConditionExpression: "attribute_exists(id)", // Garante que o produto existe
        ReturnValues: "UPDATED_NEW", // Retorna os novos valores atualizados
        UpdateExpression:
          "set productName = :n, code = :c, price = :p, model = :m", // Define os atributos a serem atualizados
        ExpressionAttributeValues: {
          // Define os novos valores dos atributos
          ":n": product.productName,
          ":c": product.code,
          ":p": product.price,
          ":m": product.model,
        },
      })
      .promise();

    console.log("Product:", product);
    console.log("Product updated:", data.Attributes);

    return data.Attributes as Product;
  }
}
