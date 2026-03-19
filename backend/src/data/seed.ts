import { hashSync } from "bcryptjs";
import { Offer, Restaurant } from "../types";

const now = () => new Date().toISOString();

export const seedRestaurants = (): Restaurant[] => {
  const passwordHash = hashSync("mittag123", 10);

  return [
    {
      id: "rest_1",
      name: "Bistro Marktplatz",
      email: "demo@mittagstisch.de",
      phone: "+49 751 123456",
      address: "Marienplatz 1, 88212 Ravensburg",
      postalCode: "88212",
      lat: 47.7811,
      lng: 9.6125,
      mealSlots: ["breakfast", "lunch"],
      approvalStatus: "approved",
      approvalRequestedAt: now(),
      approvalReviewedAt: now(),
      passwordHash,
      createdAt: now()
    },
    {
      id: "rest_2",
      name: "Vegane Stube",
      email: "vegan@mittagstisch.de",
      phone: "+49 751 654321",
      address: "Bachstrasse 12, 88212 Ravensburg",
      postalCode: "88212",
      lat: 47.7795,
      lng: 9.6082,
      mealSlots: ["lunch", "dinner"],
      approvalStatus: "approved",
      approvalRequestedAt: now(),
      approvalReviewedAt: now(),
      passwordHash,
      createdAt: now()
    },
    {
      id: "rest_3",
      name: "Pastahaus Weingarten",
      email: "pasta@mittagstisch.de",
      phone: "+49 751 777888",
      address: "Karlstrasse 5, 88213 Weingarten",
      postalCode: "88213",
      lat: 47.8102,
      lng: 9.6393,
      mealSlots: ["dinner"],
      approvalStatus: "approved",
      approvalRequestedAt: now(),
      approvalReviewedAt: now(),
      passwordHash,
      createdAt: now()
    }
  ];
};

export const seedOffers = (): Offer[] => {
  return [
    {
      id: "offer_1",
      restaurantId: "rest_1",
      title: "Fruehstuecks-Omelett",
      description: "Mit frischen Kraeutern und Bauernbrot.",
      price: 7.5,
      tags: ["vegetarian"],
      mealSlot: "breakfast",
      preorderEnabled: true,
      active: true,
      createdAt: now(),
      updatedAt: now()
    },
    {
      id: "offer_2",
      restaurantId: "rest_1",
      title: "Haehnchen Bowl",
      description: "Reis, Gemuese, Limetten-Dressing.",
      price: 9.5,
      tags: ["classic"],
      mealSlot: "lunch",
      preorderEnabled: true,
      active: true,
      createdAt: now(),
      updatedAt: now()
    },
    {
      id: "offer_3",
      restaurantId: "rest_2",
      title: "Veganer Linsen-Eintopf",
      description: "Herzhaft, mit Bio-Linsen und Gemuese.",
      price: 7.9,
      tags: ["vegan"],
      mealSlot: "lunch",
      preorderEnabled: true,
      active: true,
      createdAt: now(),
      updatedAt: now()
    },
    {
      id: "offer_4",
      restaurantId: "rest_3",
      title: "Pasta al Limone",
      description: "Frische Tagliatelle mit Zitronenrahm.",
      price: 10.2,
      tags: ["vegetarian"],
      mealSlot: "dinner",
      preorderEnabled: true,
      active: true,
      createdAt: now(),
      updatedAt: now()
    }
  ];
};
