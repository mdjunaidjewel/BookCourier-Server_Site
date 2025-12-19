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
    origin: ["http://localhost:5173"], // তোমার frontend URL
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

// USER SCHEMA
const userSchema = new mongoose.Schema({
  name: { type: String, default: "User" },
  email: { type: String, required: true, unique: true },
  role: { type: String, enum: ["user", "librarian", "admin"], default: "user" },
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
  paymentStatus: { type: String, enum: ["unpaid", "paid"], default: "unpaid" },
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

// -------- USERS --------

// Register / Add User
app.post("/api/users", async (req, res) => {
  const { name, email, role } = req.body;
  if (!email) return res.status(400).send({ error: "Email is required" });

  try {
    let existing = await User.findOne({ email });
    if (existing) return res.send(existing);

    const user = new User({
      name: name || "User",
      email,
      role: role || "user",
    });
    const result = await user.save();
    res.send(result);
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
  const { id } = req.params;
  const { role } = req.body;

  if (!["user", "librarian", "admin"].includes(role))
    return res.status(400).send({ error: "Invalid role" });

  try {
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { role },
      { new: true }
    );
    if (!updatedUser) return res.status(404).send({ error: "User not found" });
    res.send(updatedUser);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// -------- BOOKS --------
app.get("/api/books", async (req, res) => {
  try {
    const books = await Book.find({ status: "published" });
    res.send(books);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.get("/api/books/:id", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id))
    return res.status(400).send({ error: "Invalid Book ID" });
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).send({ error: "Book not found" });
    res.send(book);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Add Book
app.post("/api/books", async (req, res) => {
  try {
    const book = new Book(req.body);
    const result = await book.save();
    res.send(result);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Update Book
app.patch("/api/books/:id", async (req, res) => {
  try {
    const updatedBook = await Book.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    res.send(updatedBook);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Delete Book
app.delete("/api/books/:id", async (req, res) => {
  try {
    const deletedBook = await Book.findByIdAndDelete(req.params.id);
    if (deletedBook) await Order.deleteMany({ bookId: req.params.id });
    res.send({ message: "Book and related orders deleted" });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// -------- ORDERS --------
app.post("/api/orders", async (req, res) => {
  try {
    const order = new Order(req.body);
    const result = await order.save();
    res.send(result);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Get user orders
app.get("/api/orders/user/:email", async (req, res) => {
  try {
    const orders = await Order.find({ email: req.params.email });
    res.send(orders);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Update order (status / payment)
app.patch("/api/orders/:id", async (req, res) => {
  try {
    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (req.body.paymentStatus === "paid" && req.body.status === "completed") {
      await Book.findByIdAndUpdate(updatedOrder.bookId, {
        $inc: { quantity: -1 },
      });
    }

    res.send(updatedOrder);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// -------- STRIPE PAYMENT --------
app.post("/api/create-payment-intent", async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0)
    return res.status(400).send({ error: "Invalid amount" });

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
    });
    res.send({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// ---------------- START SERVER ----------------
connectDB().then(() => {
  app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
});
