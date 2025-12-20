require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const Stripe = require("stripe");

const app = express();
const port = process.env.PORT || 3000;

// ---------------- MIDDLEWARES ----------------
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());

// ---------------- MONGODB CONNECTION ----------------
const uri = process.env.MONGODB_URI;

async function connectDB() {
  try {
    await mongoose.connect(uri);
    console.log("✅ MongoDB Connected Successfully");
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    process.exit(1);
  }
}

// ---------------- SCHEMAS ----------------

// USER SCHEMA (UPDATED)
const userSchema = new mongoose.Schema({
  name: { type: String, default: "User" },
  email: { type: String, required: true, unique: true },
  photoURL: String,
  provider: {
    type: String,
    enum: ["email", "google"],
    default: "email",
  },
  role: {
    type: String,
    enum: ["user", "librarian", "admin"],
    default: "user",
  },
  createdAt: { type: Date, default: Date.now },
});

// BOOK SCHEMA
const bookSchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: String,
  image: String,
  description: String,
  category: String,
  quantity: { type: Number, default: 1 },
  price: { type: Number, required: true },
  status: {
    type: String,
    enum: ["published", "unpublished"],
    default: "published",
  },
  addedByEmail: String,
  addedByName: String,
  createdAt: { type: Date, default: Date.now },
});

// ORDER SCHEMA
const orderSchema = new mongoose.Schema({
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
  bookTitle: { type: String, required: true },
  name: String,
  email: String,
  phone: String,
  address: String,
  price: Number,
  status: {
    type: String,
    enum: ["pending", "completed", "cancelled"],
    default: "pending",
  },
  paymentStatus: {
    type: String,
    enum: ["unpaid", "paid"],
    default: "unpaid",
  },
  createdAt: { type: Date, default: Date.now },
});

// ---------------- MODELS ----------------
const User = mongoose.model("User", userSchema);
const Book = mongoose.model("Book", bookSchema);
const Order = mongoose.model("Order", orderSchema);

// ---------------- STRIPE ----------------
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ---------------- ROUTES ----------------
app.get("/", (req, res) => res.send("📚 BookCourier Backend Running"));

// ================= USERS =================

// ✅ Google + Email User Save (Unified)
app.post("/api/users", async (req, res) => {
  const { name, email, photoURL, provider } = req.body;

  if (!email) return res.status(400).send({ error: "Email is required" });

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.send(existingUser);

    const user = new User({
      name: name || "User",
      email,
      photoURL,
      provider: provider || "email",
    });

    const result = await user.save();
    res.status(201).send(result);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Get user by email
app.get("/api/users/:email", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    res.send(user);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Get all users (Admin)
app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find();
    res.send(users);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Update user role
app.patch("/api/users/:id", async (req, res) => {
  const { role } = req.body;

  if (!["user", "librarian", "admin"].includes(role))
    return res.status(400).send({ error: "Invalid role" });

  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    );
    res.send(updatedUser);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// ================= BOOKS =================
app.get("/api/books", async (req, res) => {
  const books = await Book.find({ status: "published" });
  res.send(books);
});

app.get("/api/books/:id", async (req, res) => {
  const book = await Book.findById(req.params.id);
  res.send(book);
});

app.post("/api/books", async (req, res) => {
  const result = await new Book(req.body).save();
  res.send(result);
});

app.patch("/api/books/:id", async (req, res) => {
  const result = await Book.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
  });
  res.send(result);
});

app.delete("/api/books/:id", async (req, res) => {
  await Book.findByIdAndDelete(req.params.id);
  await Order.deleteMany({ bookId: req.params.id });
  res.send({ message: "Book & orders deleted" });
});

// ================= ORDERS =================
app.post("/api/orders", async (req, res) => {
  const result = await new Order(req.body).save();
  res.send(result);
});

app.get("/api/orders/user/:email", async (req, res) => {
  const orders = await Order.find({ email: req.params.email });
  res.send(orders);
});

app.patch("/api/orders/:id", async (req, res) => {
  const updatedOrder = await Order.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
  });

  if (req.body.paymentStatus === "paid") {
    await Book.findByIdAndUpdate(updatedOrder.bookId, {
      $inc: { quantity: -1 },
    });
  }

  res.send(updatedOrder);
});

// ================= STRIPE =================
app.post("/api/create-payment-intent", async (req, res) => {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: req.body.amount,
    currency: "usd",
    automatic_payment_methods: { enabled: true },
  });
  res.send({ clientSecret: paymentIntent.client_secret });
});

// ---------------- START SERVER ----------------
connectDB().then(() => {
  app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
});
