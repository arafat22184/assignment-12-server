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
    const usersCollections = fitForge.collection("users");

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
          role: "member", // Optional default role
          createdAt: new Date(),
        };

        const result = await usersCollections.insertOne(userData);
        result.finalImageUrl = finalImageUrl;
        res.send(result);
      } catch (err) {
        res.status(500).json({ error: "User upload failed." });
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
