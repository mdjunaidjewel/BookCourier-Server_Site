require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const Stripe = require("stripe");
const admin = require("firebase-admin");

const app = express();
const port = process.env.PORT || 3000;

/* ================= MIDDLEWARE ================= */
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());

/* ================= MONGODB ================= */
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

/* ================= FIREBASE ADMIN ================= */
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

/* ================= STRIPE ================= */
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/* ================= SCHEMAS ================= */
const wishlistSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // Firebase UID
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
  createdAt: { type: Date, default: Date.now },
});

const Wishlist = mongoose.model("Wishlist", wishlistSchema);

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  role: {
    type: String,
    enum: ["user", "librarian", "admin"],
    default: "user",
  },
});

const bookSchema = new mongoose.Schema({
  title: String,
  author: String,
  description: String,
  image: String,
  price: Number,
  category: String,
  status: {
    type: String,
    enum: ["published", "unpublished"],
    default: "published",
  },
  addedByEmail: String,
  addedByName: String,
  reviews: [
    {
      userEmail: String, // review দিলে কোন user submit করল
      rating: Number, // star rating
      createdAt: { type: Date, default: Date.now },
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

const orderSchema = new mongoose.Schema({
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: "Book" },
  bookTitle: String,
  email: String,
  name: String,
  phone: String,
  address: String,
  status: {
    type: String,
    enum: ["pending", "cancelled", "shipped", "delivered"],
    default: "pending",
  },
  paymentStatus: {
    type: String,
    enum: ["unpaid", "paid"],
    default: "unpaid",
  },
  price: Number,
  createdAt: { type: Date, default: Date.now },
});

/* ================= MODELS ================= */
const User = mongoose.model("User", userSchema);
const Book = mongoose.model("Book", bookSchema);
const Order = mongoose.model("Order", orderSchema);

/* ================= AUTH MIDDLEWARE ================= */
const verifyFirebaseToken = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).send({ error: "No token provided" });

  try {
    const token = auth.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded = decoded;
    next();
  } catch (err) {
    console.error(err);
    res.status(403).send({ error: "Invalid token" });
  }
};

const verifyRole =
  (roles = []) =>
  async (req, res, next) => {
    const user = await User.findOne({ email: req.decoded.email });
    if (!user || !roles.includes(user.role)) {
      return res.status(403).send({ error: "Forbidden" });
    }
    next();
  };

/* ================= ROUTES ================= */
app.get("/", (req, res) => {
  res.send("📚 BookCourier Backend Running");
});

/* ================= USERS ================= */
app.post("/api/users", async (req, res) => {
  const { email, name, role } = req.body;
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({ email, name, role: role || "user" });
  }
  res.send(user);
});

app.get("/api/users/:email", verifyFirebaseToken, async (req, res) => {
  const user = await User.findOne({ email: req.params.email });
  res.send(user);
});

app.patch(
  "/api/users/:id",
  verifyFirebaseToken,
  verifyRole(["admin"]),
  async (req, res) => {
    const { role } = req.body;
    if (!["user", "librarian", "admin"].includes(role)) {
      return res.status(400).send({ error: "Invalid role" });
    }
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    );
    res.send(updatedUser);
  }
);

/* ================= BOOKS ================= */

// Librarian/Admin books
app.get(
  "/api/books/librarian",
  verifyFirebaseToken,
  verifyRole(["librarian", "admin"]),
  async (req, res) => {
    const books = await Book.find({
      addedByEmail: req.decoded.email,
    });
    res.send(books);
  }
);
// GET all books for librarian/admin
app.get(
  "/api/books/all",
  verifyFirebaseToken,
  verifyRole(["librarian", "admin"]),
  async (req, res) => {
    try {
      const books = await Book.find({}); // filter নাই, সব books
      res.send(books);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to fetch books" });
    }
  }
);

// Public books
app.get("/api/books", async (req, res) => {
  const books = await Book.find({ status: "published" });
  res.send(books);
});

// Single book
app.get("/api/books/:id", async (req, res) => {
  const book = await Book.findById(req.params.id);
  if (!book) return res.status(404).send({ error: "Book not found" });
  res.send(book);
});

// Add book
app.post(
  "/api/books",
  verifyFirebaseToken,
  verifyRole(["librarian", "admin"]),
  async (req, res) => {
    const book = await Book.create({
      ...req.body,
      addedByEmail: req.decoded.email,
    });
    res.send(book);
  }
);

// Update book
app.patch(
  "/api/books/:id",
  verifyFirebaseToken,
  verifyRole(["librarian", "admin"]),
  async (req, res) => {
    const updatedBook = await Book.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    res.send(updatedBook);
  }
);

// Submit a review
app.post("/api/books/:id/reviews", verifyFirebaseToken, verifyRole(["user"]), async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).send({ error: "Book not found" });

    const review = {
      userEmail: req.decoded.email,
      rating,
      comment,
    };

    book.reviews.push(review);
    await book.save();

    res.status(201).send(review);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to submit review" });
  }
});


/* ================= ORDERS ================= */


// User orders
app.get(
  "/api/orders/user/:email",
  verifyFirebaseToken,
  verifyRole(["user"]),
  async (req, res) => {
    if (req.decoded.email !== req.params.email) {
      return res.status(403).send({ error: "Forbidden" });
    }
    const orders = await Order.find({ email: req.params.email }).populate(
      "bookId"
    );
    res.send(orders);
  }
);

// DELETE a book (Admin only)
app.delete(
  "/api/books/:id",
  verifyFirebaseToken,
  verifyRole(["admin"]),
  async (req, res) => {
    try {
      const book = await Book.findById(req.params.id);
      if (!book) return res.status(404).send({ error: "Book not found" });

      // 1️⃣ Delete all orders of this book
      await Order.deleteMany({ bookId: book._id });

      // 2️⃣ Delete the book itself
      await book.deleteOne();

      res.send({ message: "Book and its orders deleted successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to delete book" });
    }
  }
);

// GET all users - Admin only
app.get(
  "/api/users",
  verifyFirebaseToken,
  verifyRole(["admin"]),
  async (req, res) => {
    try {
      const users = await User.find();
      res.send(users);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to fetch users" });
    }
  }
);

// Librarian orders
app.get(
  "/api/orders/librarian",
  verifyFirebaseToken,
  verifyRole(["librarian", "admin"]),
  async (req, res) => {
    const orders = await Order.find({}).populate("bookId");
    const myOrders = orders.filter(
      (o) => o.bookId && o.bookId.addedByEmail === req.decoded.email
    );
    res.send(myOrders);
  }
);

// Admin orders
app.get(
  "/api/orders/admin",
  verifyFirebaseToken,
  verifyRole(["admin"]),
  async (req, res) => {
    const orders = await Order.find({}).populate("bookId");
    res.send(orders);
  }
);

// POST /api/books
app.post(
  "/api/books",
  verifyFirebaseToken,
  verifyRole(["librarian", "admin"]),
  async (req, res) => {
    try {
      const { title, author, description, price, image } = req.body;

      // Fetch the user who is adding the book
      const librarian = await User.findOne({ email: req.decoded.email });

      const book = await Book.create({
        title,
        author,
        description,
        image,
        price,
        category,
        addedByName: addedByName || "Unknown",
        addedByEmail: req.decoded.email,
      });

      res.send(book);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to add book" });
    }
  }
);

// ✅ GET single order by ID (ADDED – for Payment page)
app.get("/api/orders/:id", verifyFirebaseToken, async (req, res) => {
  const order = await Order.findById(req.params.id).populate("bookId");
  if (!order) return res.status(404).send({ error: "Order not found" });

  if (order.email !== req.decoded.email) {
    return res.status(403).send({ error: "Forbidden" });
  }

  res.send(order);
});

// Create order
app.post(
  "/api/orders",
  verifyFirebaseToken,
  verifyRole(["user"]),
  async (req, res) => {
    const order = await Order.create({
      ...req.body,
      email: req.decoded.email,
    });
    res.send(order);
  }
);

// Update order
app.patch("/api/orders/:id", verifyFirebaseToken, async (req, res) => {
  const updatedOrder = await Order.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
  });
  res.send(updatedOrder);
});

/* ================= WISHLIST ================= */

// Add to wishlist
app.post(
  "/api/wishlist",
  verifyFirebaseToken,
  verifyRole(["user"]),
  async (req, res) => {
    try {
      const { bookId } = req.body;
      const existing = await Wishlist.findOne({
        userId: req.decoded.uid,
        bookId,
      });
      if (existing)
        return res.status(400).send({ error: "Book already in wishlist" });

      const wishlistItem = await Wishlist.create({
        userId: req.decoded.uid,
        bookId,
      });

      res.send(wishlistItem);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to add to wishlist" });
    }
  }
);

// Get user's wishlist
app.get(
  "/api/wishlist",
  verifyFirebaseToken,
  verifyRole(["user"]),
  async (req, res) => {
    try {
      const wishlist = await Wishlist.find({
        userId: req.decoded.uid,
      }).populate("bookId");
      res.send(wishlist);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to fetch wishlist" });
    }
  }
);

// Remove from wishlist
app.delete(
  "/api/wishlist/:id",
  verifyFirebaseToken,
  verifyRole(["user"]),
  async (req, res) => {
    try {
      const wishlistItem = await Wishlist.findById(req.params.id);
      if (!wishlistItem)
        return res.status(404).send({ error: "Wishlist item not found" });

      if (wishlistItem.userId !== req.decoded.uid)
        return res.status(403).send({ error: "Forbidden" });

      await wishlistItem.deleteOne();
      res.send({ message: "Removed from wishlist" });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to remove wishlist item" });
    }
  }
);

/* ================= STRIPE ================= */
app.post(
  "/api/create-payment-intent",
  verifyFirebaseToken,
  async (req, res) => {
    const { amount } = req.body;
    const intent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
    });
    res.send({ clientSecret: intent.client_secret });
  }
);

/* ================= START SERVER ================= */
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
