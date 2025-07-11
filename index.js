const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const cors = require("cors");
const port = process.env.PORT || 3000;
require("dotenv").config();

// Cloudinary
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const { cloudinary } = require("./cloudinary");
const streamifier = require("streamifier");

// Middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ydu4ilk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)

    const fitForge = client.db("fitForge");
    const usersCollection = fitForge.collection("users");
    const newslettersCollection = fitForge.collection("newsletters");
    const classesCollection = fitForge.collection("classes");

    // Get Users
    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // Get All Trainer users
    app.get("/users/trainers", async (req, res) => {
      const result = await usersCollection
        .find({ role: "trainer" })
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });

    // Demote trainer to member
    app.patch("/users/remove-trainer/:id", async (req, res) => {
      try {
        const { id } = req.params;

        // 1. Verify the user exists and is a trainer
        const trainer = await usersCollection.findOne({
          _id: new ObjectId(id),
          role: "trainer",
        });

        if (!trainer) {
          return res.status(404).json({
            success: false,
            message: "Trainer not found or already demoted",
          });
        }

        // 2. Update the user's role to 'member'
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role: "member" } }
        );

        if (result.modifiedCount === 1) {
          res.status(200).json({
            success: true,
            message: `${trainer.name} has been demoted to member`,
          });
        } else {
          res.status(400).json({
            success: false,
            message: "Failed to demote trainer",
          });
        }
      } catch (error) {
        console.error("Error demoting trainer:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
          error: error.message,
        });
      }
    });

    // GET: Get user role by email
    app.get("/users/:email/role", async (req, res) => {
      try {
        const email = req.params.email;

        if (!email) {
          return res.status(400).send({ message: "Email is required" });
        }

        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send({ role: user.role || "member" });
      } catch (error) {
        res.status(500).send({ message: "Failed to get role" });
      }
    });

    // Email Register User store
    app.post("/users", upload.single("imageFile"), async (req, res) => {
      try {
        let finalImageUrl = "";

        if (req.file) {
          const streamUpload = () =>
            new Promise((resolve, reject) => {
              const stream = cloudinary.uploader.upload_stream(
                {
                  folder: "fitForge",
                },
                (error, result) => {
                  if (result) resolve(result);
                  else reject(error);
                }
              );
              streamifier.createReadStream(req.file.buffer).pipe(stream);
            });

          const result = await streamUpload();
          finalImageUrl = result.secure_url;
        } else {
          return res.status(400).json({ error: "No image file provided" });
        }

        const { email, name } = req.body;

        const userData = {
          name,
          email,
          photoURL: finalImageUrl,
          role: "member",
          createdAt: new Date(),
          lastLogin: new Date(),
        };

        const result = await usersCollection.insertOne(userData);
        result.finalImageUrl = finalImageUrl;
        res.send(result);
      } catch (err) {
        res.status(500).json({ error: "User upload failed." });
      }
    });

    // Email Login User Login Time Update
    app.patch("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const { lastLogin } = req.body;

        if (!email || !lastLogin) {
          return res
            .status(400)
            .json({ message: "Email and lastLogin are required." });
        }

        const filter = { email: email };
        const updateDoc = {
          $set: {
            lastLogin: new Date(lastLogin),
          },
        };

        const result = await usersCollection.updateOne(filter, updateDoc);

        if (result.modifiedCount === 1) {
          res
            .status(200)
            .json({ message: "Last login time updated successfully." });
        } else {
          res
            .status(404)
            .json({ message: "User not found or already up to date." });
        }
      } catch (error) {
        console.error("Error updating lastLogin:", error);
        res.status(500).json({ message: "Internal server error." });
      }
    });

    // Google Github user data store
    app.post("/users/social", async (req, res) => {
      try {
        const { email, name, photoURL } = req.body;

        const existingUser = await usersCollection.findOne({ email });

        if (existingUser) {
          // Update the lastLogin timestamp
          const updateResult = await usersCollection.updateOne(
            { email },
            { $set: { lastLogin: new Date() } }
          );

          return res.status(200).json({
            message: "User already exists, login time updated",
            updateResult,
          });
        }

        const userData = {
          name,
          email,
          photoURL,
          role: "member",
          createdAt: new Date(),
          lastLogin: new Date(),
        };

        const result = await usersCollection.insertOne(userData);
        res.status(201).json({ message: "User created", result });
      } catch (err) {
        console.error("Google User insert error:", err);
        res.status(500).json({ error: "Failed to handle Google login." });
      }
    });

    // NewsLetter Get
    app.get("/newsletter", async (req, res) => {
      const result = await newslettersCollection.find().toArray();
      res.send(result);
    });

    // NewsLetter post
    app.post("/newsletter", async (req, res) => {
      const { name, email } = req.body;
      const userData = {
        name,
        email,
        subscribedAt: new Date(),
      };

      const existingUser = await newslettersCollection.findOne({ email });

      if (existingUser) {
        return res.status(409).json({
          message: "User already subscribed",
        });
      }

      const result = await newslettersCollection.insertOne(userData);
      res.send(result);
    });

    // GET: Get all classes (for filter options)
    app.get("/classes/all", async (req, res) => {
      try {
        const classes = await classesCollection
          .find({ status: "active" })
          .toArray();
        res.status(200).json(classes);
      } catch (error) {
        console.error("Error fetching all classes:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch classes",
        });
      }
    });

    // GET: 6 class and Search Functionalities implemented
    app.get("/classes", async (req, res) => {
      try {
        const { search, page = 1, limit = 6, difficulty, skill } = req.query;
        const skip = (page - 1) * limit;

        // Build query object
        const query = {
          status: "active",
        };

        // Add search filter
        if (search) {
          query.className = { $regex: search, $options: "i" };
        }

        // Add difficulty filter
        if (difficulty) {
          query.difficultyLevel = difficulty;
        }

        // Add skill filter
        if (skill) {
          query.skills = skill;
        }

        const [classes, total] = await Promise.all([
          classesCollection
            .find(query)
            .skip(skip)
            .limit(parseInt(limit))
            .toArray(),
          classesCollection.countDocuments(query),
        ]);

        res.status(200).json({
          success: true,
          data: classes,
          pagination: {
            total,
            page: parseInt(page),
            pages: Math.ceil(total / limit),
          },
        });
      } catch (error) {
        console.error("Error fetching classes:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch classes",
        });
      }
    });

    // POST: Create a new fitness class with image upload
    app.post("/classes", upload.single("image"), async (req, res) => {
      try {
        // Validate required fields
        const requiredFields = [
          "className",
          "description",
          "difficultyLevel",
          "createdBy",
          "createdByName",
        ];

        for (const field of requiredFields) {
          if (!req.body[field]) {
            return res.status(400).json({
              success: false,
              message: `${field} is required`,
            });
          }
        }

        // Check if image was uploaded
        if (!req.file) {
          return res.status(400).json({
            success: false,
            message: "Class image is required",
          });
        }

        // Parse skills data
        let skills = [];
        if (req.body.skills) {
          try {
            skills = JSON.parse(req.body.skills);
            if (!Array.isArray(skills) || skills.length === 0) {
              throw new Error("At least one skill must be selected");
            }
          } catch (err) {
            return res.status(400).json({
              success: false,
              message: "Invalid skills data or no skills selected",
            });
          }
        } else {
          return res.status(400).json({
            success: false,
            message: "Skills are required",
          });
        }

        // Upload image to Cloudinary
        const streamUpload = () =>
          new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              {
                folder: "fitForge/classes",
                transformation: { width: 800, height: 600, crop: "limit" },
              },
              (error, result) => {
                if (result) resolve(result);
                else reject(error);
              }
            );
            streamifier.createReadStream(req.file.buffer).pipe(stream);
          });

        const cloudinaryResult = await streamUpload();

        // Create class document
        const newClass = {
          className: req.body.className,
          skills: skills,
          description: req.body.description,
          difficultyLevel: req.body.difficultyLevel,
          equipmentNeeded: req.body.equipmentNeeded || null,
          imageUrl: cloudinaryResult.secure_url,
          imagePublicId: cloudinaryResult.public_id,
          createdBy: req.body.createdBy,
          createdByName: req.body.createdByName,
          createdAt: new Date(),
          status: "active",
          membersEnrolled: [],
          averageRating: 0,
          totalReviews: 0,
        };

        // Insert into MongoDB
        const result = await classesCollection.insertOne(newClass);

        res.status(201).json({
          success: true,
          message: "Class created successfully",
          data: {
            insertedId: result.insertedId,
            imageUrl: newClass.imageUrl,
          },
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Failed to create class",
          error: error.message,
        });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Blogify Running");
});

app.listen(port, () => {
  console.log(`Blogify running on port http://localhost:${port}`);
});
