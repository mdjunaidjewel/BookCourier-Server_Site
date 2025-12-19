require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const Stripe = require("stripe");

const app = express();
const port = process.env.PORT || 3000;

// ---------------- MIDDLEWARES ----------------
app.use(cors());
app.use(express.json());

// ---------------- MONGODB CONNECTION ----------------
const uri = process.env.MONGODB_URI;
const clientOptions = {
  serverApi: { version: "1", strict: true, deprecationErrors: true },
};

async function connectDB() {
  try {
    await mongoose.connect(uri, clientOptions);
    console.log("✅ MongoDB Connected Successfully");
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    process.exit(1);
  }
}

// ---------------- SCHEMAS ----------------
const bookSchema = new mongoose.Schema({
  title: String,
  author: String,
  image: String,
  description: String,
  category: String,
  quantity: Number,
});

const orderSchema = new mongoose.Schema({
  bookId: String,
  bookTitle: String,
  name: String,
  email: String,
  phone: String,
  address: String,
  status: { type: String, default: "pending" },
  paymentStatus: { type: String, default: "unpaid" },
  createdAt: { type: Date, default: Date.now },
});

const Book = mongoose.model("Book", bookSchema);
const Order = mongoose.model("Order", orderSchema);

// ---------------- ROUTES ----------------
app.get("/", (req, res) => res.send("📚 BookCourier Backend Running"));

// Books
app.get("/api/books", async (req, res) => {
  const books = await Book.find();
  res.send(books);
});
app.get("/api/books/:id", async (req, res) => {
  const book = await Book.findById(req.params.id);
  res.send(book);
});
app.post("/api/books", async (req, res) => {
  const book = new Book(req.body);
  const result = await book.save();
  res.send(result);
});

// Orders
app.post("/api/orders", async (req, res) => {
  const order = new Order(req.body);
  const result = await order.save();
  res.send(result);
});
app.get("/api/orders", async (req, res) => {
  const orders = await Order.find();
  res.send(orders);
});
app.get("/api/orders/user/:email", async (req, res) => {
  const orders = await Order.find({ email: req.params.email });
  res.send(orders);
});
app.get("/api/orders/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).send({ message: "Order not found" });
    res.send(order);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// ---------------- Stripe ----------------
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create Payment Intent
app.post("/api/create-payment-intent", async (req, res) => {
  const { amount } = req.body; // amount in cents
  try {
    if (!amount || amount <= 0) {
      return res.status(400).send({ error: "Invalid amount" });
    }

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

// Update order after payment
app.patch("/api/orders/:id", async (req, res) => {
  try {
    const { paymentStatus, status } = req.body;
    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      { paymentStatus, status },
      { new: true }
    );
    if (!updatedOrder)
      return res.status(404).send({ message: "Order not found" });
    res.send(updatedOrder);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// ---------------- START SERVER ----------------
connectDB().then(() =>
  app.listen(port, () => console.log(`🚀 Server running on port ${port}`))
);
