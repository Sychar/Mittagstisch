export type Tag = "vegan" | "vegetarian" | "classic";
export type MealSlot = "breakfast" | "lunch" | "dinner";
export type RestaurantApprovalStatus = "pending" | "approved" | "rejected";
export type FulfillmentType = "pickup" | "dinein";
export type OrderStatus = "pending" | "confirmed" | "cancelled";

export type Restaurant = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  postalCode: string;
  lat: number;
  lng: number;
  mealSlots: MealSlot[];
  approvalStatus: RestaurantApprovalStatus;
  approvalRequestedAt: string;
  approvalReviewedAt?: string;
  approvalNote?: string;
  menuUrl?: string;
  menuMimeType?: string;
  passwordHash: string;
  createdAt: string;
};

export type RestaurantPublic = Omit<Restaurant, "passwordHash">;

export type Offer = {
  id: string;
  restaurantId: string;
  title: string;
  description: string;
  price: number;
  tags: Tag[];
  imageUrl?: string;
  mealSlot: MealSlot;
  active: boolean;
  preorderEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OfferWithRestaurant = Offer & {
  distanceKm: number;
  restaurant: Pick<
    Restaurant,
    "id" | "name" | "address" | "phone" | "postalCode" | "mealSlots" | "menuUrl" | "menuMimeType"
  >;
};

export type Order = {
  id: string;
  offerId: string;
  restaurantId: string;
  customerName: string;
  customerEmail: string;
  quantity: number;
  pickupTime: string;
  fulfillmentType: FulfillmentType;
  deviceId?: string;
  requestIp?: string;
  status: OrderStatus;
  createdAt: string;
};

export type OrderWithOffer = Order & {
  offer: Pick<Offer, "id" | "title" | "price">;
};

export type Session = {
  token: string;
  restaurantId: string;
  createdAt: string;
  lastSeenAt: string;
};

export type Coordinates = {
  lat: number;
  lng: number;
};
