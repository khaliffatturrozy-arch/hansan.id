import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Hansan OS database...\n");

  // ─── Clean existing data (safe order: items → orders → menuItems → categories) ───
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.category.deleteMany();

  // ─── CATEGORIES ──────────────────────────────────────────────────────────────────
  const [catCoffee, catNonCoffee, catMainCourse, catSnack, catPastry] =
    await Promise.all([
      prisma.category.create({
        data: { name: "Coffee", slug: "coffee", displayOrder: 1 },
      }),
      prisma.category.create({
        data: { name: "Non-Coffee", slug: "non-coffee", displayOrder: 2 },
      }),
      prisma.category.create({
        data: { name: "Main Course", slug: "main-course", displayOrder: 3 },
      }),
      prisma.category.create({
        data: { name: "Snacks & Sides", slug: "snack", displayOrder: 4 },
      }),
      prisma.category.create({
        data: { name: "Pastry & Bakery", slug: "pastry", displayOrder: 5 },
      }),
    ]);

  console.log("✅ Categories created: Coffee, Non-Coffee, Main Course, Snacks, Pastry");

  // ─── MENU ITEMS ──────────────────────────────────────────────────────────────────
  const menuItems = await prisma.menuItem.createMany({
    data: [
      // ── Coffee ──
      {
        name: "Hansan Aren Latte",
        description:
          "Espresso blend dengan palm sugar organik West Java dan susu segar pilihan",
        price: 28000,
        imageUrl:
          "https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=600&q=80",
        badge: "Signature",
        stockCount: 84,
        isAvailable: true,
        categoryId: catCoffee.id,
      },
      {
        name: "Spanish Sea Salt Latte",
        description:
          "Double ristretto, susu kental, foam beludru, Himalayan pink salt",
        price: 32000,
        imageUrl:
          "https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=600&q=80",
        badge: "Best Seller",
        stockCount: 45,
        isAvailable: true,
        categoryId: catCoffee.id,
      },
      {
        name: "Americano Black Velvet",
        description:
          "Arabica single origin washed dengan undertone cokelat bersih",
        price: 24000,
        imageUrl:
          "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80",
        badge: null,
        stockCount: 120,
        isAvailable: true,
        categoryId: catCoffee.id,
      },
      {
        name: "Yuzu Sparkling Americano",
        description:
          "Cold shot espresso di atas tonic sparkling dengan yuzu citrus kandis",
        price: 34000,
        imageUrl:
          "https://images.unsplash.com/photo-1517256064527-09c73fc73e38?auto=format&fit=crop&w=600&q=80",
        badge: "New",
        stockCount: 26,
        isAvailable: true,
        categoryId: catCoffee.id,
      },
      // ── Non-Coffee ──
      {
        name: "Matcha Uji Cloud",
        description:
          "Matcha ceremonial grade Kyoto dengan vanilla cold foam float",
        price: 35000,
        imageUrl:
          "https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=600&q=80",
        badge: "Best Seller",
        stockCount: 28,
        isAvailable: true,
        categoryId: catNonCoffee.id,
      },
      {
        name: "Earl Grey Artisan Milk Tea",
        description:
          "Teh bergamot citrus slow-brew, oat milk organik, brown jelly",
        price: 30000,
        imageUrl:
          "https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=600&q=80",
        badge: null,
        stockCount: 35,
        isAvailable: true,
        categoryId: catNonCoffee.id,
      },
      // ── Main Course ──
      {
        name: "Hansan Wagyu Rice Bowl",
        description:
          "Wagyu slice lembut, garlic butter rice, onsen tamago, daun bawang",
        price: 58000,
        imageUrl:
          "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80",
        badge: "Signature",
        stockCount: 22,
        isAvailable: true,
        categoryId: catMainCourse.id,
      },
      {
        name: "Crispy Dory Sambal Matah",
        description:
          "Dory fillet goreng golden dengan sambal matah Bali autentik",
        price: 45000,
        imageUrl:
          "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=600&q=80",
        badge: null,
        stockCount: 19,
        isAvailable: true,
        categoryId: catMainCourse.id,
      },
      // ── Snacks ──
      {
        name: "Truffle Parmesan Hand-Cut Fries",
        description:
          "Kentang shoestring crispy dengan truffle oil Italia & parmesan",
        price: 34000,
        imageUrl:
          "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=600&q=80",
        badge: "Best Seller",
        stockCount: 60,
        isAvailable: true,
        categoryId: catSnack.id,
      },
      {
        name: "Golden Salted Egg Chicken Wings",
        description:
          "6pcs sayap ayam crispy dilapisi saus telur asin creamy gurih",
        price: 38000,
        imageUrl:
          "https://images.unsplash.com/photo-1567620832903-9fc6debc209f?auto=format&fit=crop&w=600&q=80",
        badge: null,
        stockCount: 15,
        isAvailable: true,
        categoryId: catSnack.id,
      },
      // ── Pastry ──
      {
        name: "Butter Flaky Croissant",
        description:
          "Pastry laminasi cultured butter Perancis, dipanggang fresh setiap hari",
        price: 25000,
        imageUrl:
          "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=600&q=80",
        badge: "New",
        stockCount: 14,
        isAvailable: true,
        categoryId: catPastry.id,
      },
      {
        name: "Almond Frangipane Danishes",
        description:
          "Pastry berlapis dengan cream almond manis panggang dan keping almond toasted",
        price: 32000,
        imageUrl:
          "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80",
        badge: null,
        stockCount: 8,
        isAvailable: true,
        categoryId: catPastry.id,
      },
    ],
  });

  console.log(`✅ Menu Items created: ${menuItems.count} items`);

  // ─── SAMPLE ORDER (untuk testing query & KDS nanti) ─────────────────────────────
  const sampleOrder = await prisma.order.create({
    data: {
      orderNumber: "HN-20260919-0001",
      orderType: "DINE_IN",
      tableNumber: "Meja 05",
      customerName: "Dimas Pratama",
      cashierName: "Rozy (Shift 1)",
      subtotal: 90000,
      taxPb1: 9000,
      totalAmount: 99000,
      status: "COMPLETED",
      paymentMethod: "CASH",
      amountPaid: 100000,
      changeAmount: 1000,
    },
  });

  console.log(`✅ Sample order created: ${sampleOrder.orderNumber}`);

  console.log("\n🎉 Seeding complete. Database siap pakai!\n");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
