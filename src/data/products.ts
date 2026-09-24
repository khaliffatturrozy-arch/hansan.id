export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: "coffee" | "non-coffee" | "main-course" | "snack" | "pastry";
  image?: string;
  imageUrl?: string;
  stockCount?: number;
  isAvailable?: boolean;
  badge?: "Signature" | "Best Seller" | "New" | "Promo";
}

export const CATEGORIES = ["Semua", "coffee", "non-coffee", "main-course", "snack", "pastry"] as const;

export const DUMMY_PRODUCTS: Product[] = [
  {
    id: "1",
    name: "Hansan Aren Latte",
    description: "Espresso blend with organic West Java palm sugar and fresh milk",
    price: 28000,
    category: "coffee",
    image: "https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=600&q=80",
    stockCount: 84,
    isAvailable: true,
    badge: "Signature",
  },
  {
    id: "2",
    name: "Spanish Sea Salt Latte",
    description: "Double ristretto, condensed milk, velvety foam, Himalayan pink salt",
    price: 32000,
    category: "coffee",
    image: "https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=600&q=80",
    stockCount: 45,
    isAvailable: true,
    badge: "Best Seller",
  },
  {
    id: "3",
    name: "Americano Black Velvet",
    description: "Bold washed Arabica single origin with clean chocolate undertones",
    price: 24000,
    category: "coffee",
    image: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80",
    stockCount: 120,
    isAvailable: true,
  },
  {
    id: "4",
    name: "Matcha Uji Cloud",
    description: "Ceremonial grade Kyoto matcha with vanilla cold foam float",
    price: 35000,
    category: "non-coffee",
    image: "https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=600&q=80",
    stockCount: 28,
    isAvailable: true,
    badge: "Best Seller",
  },
  {
    id: "5",
    name: "Earl Grey Artisan Milk Tea",
    description: "Slow-brewed citrus bergamot tea, organic oat milk, brown jelly",
    price: 30000,
    category: "non-coffee",
    image: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=600&q=80",
    stockCount: 35,
    isAvailable: true,
  },
  {
    id: "6",
    name: "Hansan Wagyu Rice Bowl",
    description: "Tender sliced wagyu beef, garlic butter rice, onsen tamago, scallions",
    price: 58000,
    category: "main-course",
    image: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80",
    stockCount: 22,
    isAvailable: true,
    badge: "Signature",
  },
  {
    id: "7",
    name: "Crispy Dory Sambal Matah",
    description: "Golden fried dory fillet with authentic Balinese fresh sambal matah",
    price: 45000,
    category: "main-course",
    image: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=600&q=80",
    stockCount: 19,
    isAvailable: true,
  },
  {
    id: "8",
    name: "Truffle Parmesan Hand-Cut Fries",
    description: "Crispy shoestring potatoes tossed in Italian white truffle oil & parmesan",
    price: 34000,
    category: "snack",
    image: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=600&q=80",
    stockCount: 60,
    isAvailable: true,
    badge: "Best Seller",
  },
  {
    id: "9",
    name: "Golden Salted Egg Chicken Wings",
    description: "6pcs crispy chicken wings glazed in creamy savory salted egg sauce",
    price: 38000,
    category: "snack",
    image: "https://images.unsplash.com/photo-1567620832903-9fc6debc209f?auto=format&fit=crop&w=600&q=80",
    stockCount: 15,
    isAvailable: true,
  },
  {
    id: "10",
    name: "Butter Flaky Croissant",
    description: "French cultured butter laminated pastry, baked golden fresh daily",
    price: 25000,
    category: "pastry",
    image: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=600&q=80",
    stockCount: 14,
    isAvailable: true,
    badge: "New",
  },
  {
    id: "11",
    name: "Almond Frangipane Danishes",
    description: "Flaky pastry pocket with sweet roasted almond cream & toasted flakes",
    price: 32000,
    category: "pastry",
    image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80",
    stockCount: 8,
    isAvailable: true,
  },
  {
    id: "12",
    name: "Yuzu Sparkling Americano",
    description: "Cold espresso shot poured over sparkling tonic and candied yuzu citrus",
    price: 34000,
    category: "coffee",
    image: "https://images.unsplash.com/photo-1517256064527-09c73fc73e38?auto=format&fit=crop&w=600&q=80",
    stockCount: 26,
    isAvailable: true,
    badge: "New",
  },
];
