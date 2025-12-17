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

// ---------------- ROUTES ----------------
app.get("/", (req, res) => {
  res.send("Hello World!");
});

// ---------------- START SERVER ----------------
connectDB().then(() => {
  app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
  });
});
