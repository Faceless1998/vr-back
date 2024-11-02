// server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const path = require("path");
const helmet = require("helmet");
const morgan = require("morgan");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(helmet());
app.use(morgan("combined"));
app.use("/uploads", express.static("uploads"));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`); // Fixed template literal
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(
      "Error: File upload only supports the following filetypes - " + filetypes
    );
  },
});

// MongoDB connection
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Define schema and model for categories
const categorySchema = new mongoose.Schema({
  name: String,
});

const Category = mongoose.model("Category", categorySchema);

// Define schema and model for games
const gameSchema = new mongoose.Schema({
  id: Number,
  name: String,
  imageUrl: String,
  categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
});

const Game = mongoose.model("Game", gameSchema);

// Define schema and model for reservations
const reservationSchema = new mongoose.Schema({
  adultName: String,
  KidName: String,
  phone: String,
  AdultAge: Number,
  KidAge: Number,
  bookingDate: String,
  bookingHour: String,
  duration: Number,
  games: [String],
  status: {
    type: String,
    enum: ["Pending", "Cancelled", "Completed"],
    default: "Pending",
  },
  review: String,
  userStatus: {
    type: String,
    enum: ["Good", "Bad"],  // Specify possible values for userStatus
    default: "Good",       // Set default value to "Good"
  },
  price: Number,
});

const Reservation = mongoose.model("Reservation", reservationSchema);

// Routes

// Add a new category
app.post("/api/categories", async (req, res, next) => {
  const newCategory = new Category({
    name: req.body.name,
  });

  try {
    await newCategory.save();
    res.status(201).json(newCategory);
  } catch (error) {
    console.error("Error adding category:", error);
    next(error);
  }
});

// Get existing categories
app.get("/api/categories", async (req, res) => {
  try {
    const categories = await Category.find();
    res.json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/games/category/:categoryId", async (req, res) => {
  const categoryId = req.params.categoryId;
  try {
    const games = await Game.find({ categoryIds: categoryId });
    if (games.length === 0) {
      return res
        .status(404)
        .json({ message: "No games found for this category." });
    }
    res.json(games);
  } catch (error) {
    console.error("Error fetching games:", error);
    res.status(500).json({ message: "Error fetching games." });
  }
});

// Add a new game with image upload and category assignment
app.post("/api/games", upload.single("image"), async (req, res, next) => {
  const newGame = new Game({
    name: req.body.name,
    imageUrl: req.file.path,
    categoryIds: JSON.parse(req.body.categoryIds),
  });

  try {
    await newGame.save();
    res.status(201).json(newGame);
  } catch (error) {
    console.error("Error adding game:", error);
    next(error);
  }
});

// Get existing games with category details
app.get("/api/games", async (req, res) => {
  try {
    const games = await Game.find().populate("categoryIds", "name");
    res.json(games);
  } catch (error) {
    console.error("Error fetching games:", error);
    res.status(500).json({ message: error.message });
  }
});

// Add a new reservation
app.post("/api/reservations", async (req, res, next) => {
  const newReservation = new Reservation({
    ...req.body,
    userStatus: "Good", // Explicitly set userStatus to "Good"
  });
  try {
    await newReservation.save();
    res.status(201).json(newReservation);
  } catch (error) {
    console.error("Error saving reservation:", error);
    next(error);
  }
});

// Get existing reservations
app.get("/api/reservations", async (req, res) => {
  try {
    const reservations = await Reservation.find();
    res.json(reservations);
  } catch (error) {
    console.error("Error fetching reservations:", error);
    res.status(500).json({ message: error.message });
  }
});

// Example Express route for updating user status
app.patch('/api/reservations/:id/userstatus', async (req, res) => {
  const { id } = req.params;
  const { userStatus } = req.body;

  try {
    const updatedReservation = await Reservation.findByIdAndUpdate(
      id,
      { userStatus },
      { new: true }
    );

    if (!updatedReservation) {
      return res.status(404).send("Reservation not found");
    }

    res.json(updatedReservation);
  } catch (error) {
    console.error("Error updating reservation:", error);
    res.status(500).send("Server error");
  }
});

// Update reservation status
app.patch('/api/reservations/:id/status', async (req, res) => {
  const { status, price } = req.body;
  const { id } = req.params;

  try {
    const updatedReservation = await Reservation.findByIdAndUpdate(
      id,
      { status, price }, // Update status and price
      { new: true } // Return the updated document
    );
    
    if (!updatedReservation) {
      return res.status(404).json({ message: 'Reservation not found' });
    }

    res.json(updatedReservation); // Send back the updated reservation
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get last game ID
app.get("/api/games/last-id", async (req, res) => {
  try {
    const lastGame = await Game.findOne({}, {}, { sort: { id: -1 } });
    const lastId = lastGame ? lastGame.id : 0;
    res.json({ lastId });
  } catch (error) {
    console.error("Error fetching last game ID:", error);
    res.status(500).json({ message: "Error fetching last game ID" });
  }
});

// Update reservation review
app.patch("/api/reservations/:id/review", async (req, res) => {
  const { id } = req.params;
  const { review } = req.body;

  try {
    const updatedReservation = await Reservation.findByIdAndUpdate(
      id,
      { review: review },
      { new: true }
    );

    if (!updatedReservation) {
      return res.status(404).json({ message: "Reservation not found" });
    }

    res.json(updatedReservation);
  } catch (error) {
    console.error("Error updating reservation review:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "An unexpected error occurred!" });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
