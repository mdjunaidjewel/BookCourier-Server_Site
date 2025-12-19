require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
const port = process.env.PORT || 3000;

// ---------------- MIDDLEWARES ----------------
app.use(cors());
app.use(express.json());

// ---------------- MONGODB CONNECTION ----------------
const uri = process.env.MONGODB_URI;

const clientOptions = {
  serverApi: {
    version: "1",
    strict: true,
    deprecationErrors: true,
  },
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

// Book Schema
const bookSchema = new mongoose.Schema({
  title: String,
  author: String,
  image: String,
  description: String,
  category: String,
  quantity: Number,
});

// Order Schema
const orderSchema = new mongoose.Schema({
  bookId: String,
  bookTitle: String,
  name: String,
  email: String,
  phone: String,
  address: String,
  status: {
    type: String,
    default: "pending",
  },
  paymentStatus: {
    type: String,
    default: "unpaid",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// ---------------- MODELS ----------------
const Book = mongoose.model("Book", bookSchema);
const Order = mongoose.model("Order", orderSchema);

// ---------------- ROUTES ----------------

// Test route
app.get("/", (req, res) => {
  res.send("📚 BookCourier Backend Running");
});

// 🔹 Get all books
app.get("/api/books", async (req, res) => {
  const books = await Book.find();
  res.send(books);
});

// 🔹 Get single book
app.get("/api/books/:id", async (req, res) => {
  const book = await Book.findById(req.params.id);
  res.send(book);
});

// 🔹 Add book (Librarian)
app.post("/api/books", async (req, res) => {
  const book = new Book(req.body);
  const result = await book.save();
  res.send(result);
});

// 🔹 Place order
app.post("/api/orders", async (req, res) => {
  const order = new Order(req.body);
  const result = await order.save();
  res.send(result);
});

// 🔹 Get all orders (Admin)
app.get("/api/orders", async (req, res) => {
  const orders = await Order.find();
  res.send(orders);
});

// 🔹 Get user orders by email
app.get("/api/orders/user/:email", async (req, res) => {
  const orders = await Order.find({ email: req.params.email });
  res.send(orders);
});

// ---------------- START SERVER ----------------
connectDB().then(() => {
  app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
  });
});
