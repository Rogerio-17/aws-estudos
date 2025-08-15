export enum PaymentType {
  CASH = "CASH",
  CREDIT_CARD = "CREDIT_CARD",
  DEBIT_CARD = "DEBIT_CARD",
}

export enum CarrierType {
  CORREIOS = "CORREIOS",
  FEDEX = "FEDEX",
}

export enum ShippingType {
  ECONOMIC = "ECONOMIC",
  URGENT = "URGENT",
}

export interface OrderRequest {
  email: string;
  productIds: string[];
  payment: PaymentType;
  shipping: {
    carrier: CarrierType;
    type: ShippingType;
  };
}

export interface OrderProductResponse {
  code: string;
  price: number;
}

export interface OrderResponse {
  id: string;
  email: string;
  billing: {
    payment: PaymentType;
    totalPrice: number;
  };
  shipping: {
    carrier: CarrierType;
    type: ShippingType;
  };
  products: OrderProductResponse[];
  createdAt: number;
}
