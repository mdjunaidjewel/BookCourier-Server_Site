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
  title: { type: String, required: true },
  author: String,
  image: String,
  description: String,
  category: String,
  quantity: { type: Number, default: 1 },
  price: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

const orderSchema = new mongoose.Schema({
  bookId: { type: String, required: true },
  bookTitle: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  price: { type: Number, required: true },
  status: { type: String, default: "pending" },
  paymentStatus: { type: String, default: "unpaid" },
  createdAt: { type: Date, default: Date.now },
});

const Book = mongoose.model("Book", bookSchema);
const Order = mongoose.model("Order", orderSchema);

// ---------------- ROUTES ----------------
app.get("/", (req, res) => res.send("📚 BookCourier Backend Running"));

// --------- BOOK ROUTES ---------
app.get("/api/books", async (req, res) => {
  try {
    const books = await Book.find();
    res.send(books);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.get("/api/books/:id", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(400).send({ error: "Invalid Book ID" });

  try {
    const book = await Book.findById(id);
    if (!book) return res.status(404).send({ error: "Book not found" });
    res.send(book);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.post("/api/books", async (req, res) => {
  try {
    const book = new Book(req.body);
    const result = await book.save();
    res.send(result);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// --------- ORDER ROUTES ---------
app.post("/api/orders", async (req, res) => {
  try {
    const order = new Order(req.body);
    const result = await order.save();
    res.send(result);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.get("/api/orders/user/:email", async (req, res) => {
  try {
    const orders = await Order.find({ email: req.params.email });
    res.send(orders);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.get("/api/orders/:id", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(400).send({ error: "Invalid Order ID" });

  try {
    const order = await Order.findById(id);
    if (!order) return res.status(404).send({ error: "Order not found" });
    res.send(order);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.patch("/api/orders/:id", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(400).send({ error: "Invalid Order ID" });

  try {
    const updatedOrder = await Order.findByIdAndUpdate(id, req.body, {
      new: true,
    });
    if (!updatedOrder)
      return res.status(404).send({ error: "Order not found" });
    res.send(updatedOrder);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// --------- STRIPE PAYMENT ---------
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
connectDB().then(() =>
  app.listen(port, () => console.log(`🚀 Server running on port ${port}`))
);
