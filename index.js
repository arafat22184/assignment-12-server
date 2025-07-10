const express = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");
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
    const newslettersCollections = fitForge.collection("newsletters");

    // Get Users
    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
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

    // NewsLetter post
    app.post("/newsletter", async (req, res) => {
      const { name, email } = req.body;
      const userData = {
        name,
        email,
        subscribedAt: new Date(),
      };

      const existingUser = await newslettersCollections.findOne({ email });

      if (existingUser) {
        return res.status(409).json({
          message: "User already subscribed",
        });
      }

      const result = await newslettersCollections.insertOne(userData);
      res.send(result);
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
