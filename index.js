const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 3000;
require("dotenv").config();

// Stripe
const stripe = require("stripe")(process.env.STRIPE_SK);

// Cloudinary
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const { cloudinary } = require("./cloudinary");
const streamifier = require("streamifier");

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: ["https://fitforge-8d026.web.app", "http://localhost:5173"],
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

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
    const paymentsCollection = fitForge.collection("payments");
    const reviewsCollection = fitForge.collection("reviews");
    const forumsCollection = fitForge.collection("forums");

    // JWT token related api
    app.post("/jwt", async (req, res) => {
      const { email } = req.body;
      const user = { email };
      const token = jwt.sign(user, process.env.JWT_SECRET_KEY, {
        expiresIn: "2h",
      });
      res.send({ token, message: "JWT Created Successfully" });
    });

    const verifyJwtToken = (req, res, next) => {
      const token = req?.headers?.authorization?.split(" ")[1];

      if (!token) {
        return res.status(401).send({ message: "Unauthorized Access!" });
      }

      jwt.verify(token, process.env.JWT_SECRET_KEY, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Unauthorized Access!" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // Verify User Email
    const verifyEmail = async (req, res, next) => {
      if (req.headers.email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email };
      const user = await usersCollection.findOne(query);

      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    const verifyTrainer = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email };
      const user = await usersCollection.findOne(query);

      if (!user || user.role !== "trainer") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // Get Users
    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // get user by email
    app.get(
      "/users/activity",
      verifyJwtToken,
      verifyEmail,
      async (req, res) => {
        const { email } = req.query;
        const result = await usersCollection.findOne({ email: email });
        res.send(result);
      }
    );

    // Update Profile By member only updates name and profile picture
    app.patch(
      "/users/profileUpdate",
      upload.single("imageFile"),
      async (req, res) => {
        try {
          const { email } = req.query;
          let name = req.body.name; // Now optional
          let finalImageUrl = null;

          // Validate email
          if (!email) {
            return res.status(400).json({
              success: false,
              message: "Email is required",
            });
          }

          // Check if at least one field is being updated
          if (!name && !req.file) {
            return res.status(400).json({
              success: false,
              message:
                "At least one field (name or image) is required for update",
            });
          }

          // Handle image upload if file exists
          if (req.file) {
            try {
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
            } catch (error) {
              return res.status(500).json({
                success: false,
                message: "Image upload failed. Please try a different image.",
              });
            }
          }

          // Prepare update object - only name and photoURL
          const updateData = {};
          if (name) updateData.name = name;
          if (finalImageUrl) updateData.photoURL = finalImageUrl;

          // Update user in MongoDB - only name and photoURL
          const result = await usersCollection.updateOne(
            { email },
            { $set: updateData }
          );

          if (result.matchedCount === 0) {
            return res.status(404).json({
              success: false,
              message: "User not found",
            });
          }

          // Only return the updated fields in the response
          const responseData = {
            success: true,
            message: "Profile updated successfully",
          };

          // Add updated fields to response if they were updated
          if (name) responseData.updatedName = name;
          if (finalImageUrl) responseData.updatedPhotoURL = finalImageUrl;

          res.status(200).json(responseData);
        } catch (error) {
          res.status(500).json({
            success: false,
            message: "Internal server error. Please try again later.",
            error: error.message,
          });
        }
      }
    );

    // Get All Trainer users
    app.get("/users/trainers", async (req, res) => {
      const result = await usersCollection
        .find({ role: "trainer" })
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });

    // Top 3 trainers get method
    app.get("/users/top-trainers", async (req, res) => {
      result = await usersCollection
        .find({ role: "trainer" })
        .sort({ "trainerApplication.experience": -1 })
        .limit(3)
        .toArray();
      res.send(result);
    });

    // Get All Trainer Applications
    app.get(
      "/users/trainer-applications",
      verifyJwtToken,
      verifyEmail,
      verifyAdmin,
      async (req, res) => {
        try {
          const applications = await usersCollection
            .find({
              "trainerApplication.status": "pending",
            })
            .toArray();
          res.status(200).json(applications);
        } catch (error) {
          res.status(500).json({
            success: false,
            message: "Failed to fetch trainer applications",
            error: error.message,
          });
        }
      }
    );

    // Approved Trainer update
    app.patch("/users/approve-trainer/:id", async (req, res) => {
      try {
        const { id } = req.params;

        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id), "trainerApplication.status": "pending" },
          {
            $set: {
              role: "trainer",
              "trainerApplication.status": "approved",
              "trainerApplication.updatedAt": new Date(),
            },
          }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Application not found or already processed",
          });
        }

        res.status(200).json({
          success: true,
          message: "Trainer application approved successfully",
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Failed to approve trainer application",
          error: error.message,
        });
      }
    });

    // Rejected Trainer Update
    app.patch("/users/reject-trainer/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { feedback } = req.body;

        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id), "trainerApplication.status": "pending" },
          {
            $set: {
              "trainerApplication.status": "rejected",
              "trainerApplication.feedback": feedback,
              "trainerApplication.updatedAt": new Date(),
            },
          }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Application not found or already processed",
          });
        }

        res.status(200).json({
          success: true,
          message: "Trainer application rejected successfully",
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Failed to reject trainer application",
          error: error.message,
        });
      }
    });

    // Get Applied Trainer details
    app.get(
      "/users/trainer-application/:id",
      verifyJwtToken,
      verifyEmail,
      verifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;
          const application = await usersCollection.findOne({
            _id: new ObjectId(id),
            "trainerApplication.status": "pending",
          });

          if (!application) {
            return res.status(404).json({
              success: false,
              message: "Application not found",
            });
          }

          res.status(200).json(application);
        } catch (error) {
          res.status(500).json({
            success: false,
            message: "Failed to fetch application details",
            error: error.message,
          });
        }
      }
    );

    app.get("/trainer/:id", verifyJwtToken, verifyEmail, async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    // Get Trainers with skills matching a specific class
    app.get("/users/trainers/for-class/:classId", async (req, res) => {
      try {
        const { classId } = req.params;

        // 1. Get the class to find its skills
        const classItem = await classesCollection.findOne({
          _id: new ObjectId(classId),
          status: "active",
        });

        if (!classItem) {
          return res.status(404).send({ message: "Class not found" });
        }

        // 2. Find trainers whose skills match at least one of the class skills
        const trainers = await usersCollection
          .find({
            role: "trainer",
            "trainerApplication.skills": { $in: classItem.skills },
          })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(trainers);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch trainers" });
      }
    });

    //Delete trainer application
    app.patch("/users/delete-trainer-application/:email", async (req, res) => {
      try {
        const { email } = req.params;

        const result = await usersCollection.updateOne(
          { email },
          { $unset: { trainerApplication: "" } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "User not found or no application to delete",
          });
        }

        // Optionally return the updated user
        const updatedUser = await usersCollection.findOne({ email });
        res.status(200).json({
          success: true,
          message: "Trainer application deleted successfully",
          data: updatedUser,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Failed to delete trainer application",
          error: error.message,
        });
      }
    });

    // Demote API with application status update
    app.patch("/users/remove-trainer/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const feedback =
          "Your trainer status has been removed. You may reapply to become a trainer.";

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

        // 2. Update both the role and application status in a single operation
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              role: "member",
              "trainerApplication.status": "rejected",
              "trainerApplication.feedback": feedback,
              "trainerApplication.updatedAt": new Date(),
            },
          }
        );

        if (result.modifiedCount === 1) {
          res.status(200).json({
            success: true,
            message: `${trainer.name} has been demoted to member`,
            feedback: feedback,
          });
        } else {
          res.status(400).json({
            success: false,
            message: "Failed to demote trainer",
          });
        }
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Internal server error",
          error: error.message,
        });
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
          activityLog: {
            createdAt: new Date(),
            lastLogin: new Date(),
            paymentHistory: [],
          },
        };

        const result = await usersCollection.insertOne(userData);
        result.finalImageUrl = finalImageUrl;
        res.send(result);
      } catch (err) {
        res.status(500).json({ error: "User upload failed." });
      }
    });

    // GET: Get user role by email
    app.get(
      "/users/role/:email",
      verifyJwtToken,
      verifyEmail,
      async (req, res) => {
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
      }
    );

    // Update user to become a trainer
    app.patch(
      "/users/become-trainer",
      upload.single("imageFile"),
      async (req, res) => {
        try {
          const {
            email,
            name,
            age,
            experience,
            certifications,
            skills,
            slots,
            facebook,
            instagram,
            linkedin,
          } = req.body;

          // Validate required fields
          if (
            !email ||
            !name ||
            !age ||
            !experience ||
            !certifications ||
            !skills ||
            !slots
          ) {
            return res.status(400).json({
              success: false,
              message: "All required fields must be provided",
            });
          }

          let updateData = {
            trainerApplication: {
              name,
              age: parseInt(age),
              experience,
              certifications,
              skills: JSON.parse(skills),
              slots: JSON.parse(slots),
              status: "pending",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            role: "member",
          };

          // Add social media links if provided
          if (facebook) {
            updateData.trainerApplication.facebook = facebook;
          }
          if (instagram) {
            updateData.trainerApplication.instagram = instagram;
          }
          if (linkedin) {
            updateData.trainerApplication.linkedin = linkedin;
          }

          // Handle image upload if new image was provided
          if (req.file) {
            const streamUpload = () =>
              new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                  { folder: "fitForge/trainers" },
                  (error, result) => {
                    if (result) resolve(result);
                    else reject(error);
                  }
                );
                streamifier.createReadStream(req.file.buffer).pipe(stream);
              });

            const imageResult = await streamUpload();

            // Update both the user's photo and the application photo
            updateData.photoURL = imageResult.secure_url;
            updateData.photoPublicId = imageResult.public_id;
            updateData.trainerApplication.profileImage = imageResult.secure_url;
            updateData.trainerApplication.profileImageId =
              imageResult.public_id;
          }

          // Update user in database
          const result = await usersCollection.updateOne(
            { email },
            { $set: updateData }
          );

          if (result.modifiedCount === 0) {
            return res.status(404).json({
              success: false,
              message: "User not found or no changes made",
            });
          }

          res.status(200).json({
            success: true,
            message: "Trainer application submitted successfully",
          });
        } catch (error) {
          res.status(500).json({
            success: false,
            message: "Failed to submit trainer application",
            error: error.message,
          });
        }
      }
    );

    // get user by email
    app.get("/users/:email", verifyJwtToken, verifyEmail, async (req, res) => {
      const { email } = req.params;
      const query = { email };
      const result = await usersCollection.findOne(query);
      res.send(result);
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
            {
              $set: {
                "activityLog.lastLogin": new Date(),
              },
            }
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
          activityLog: {
            createdAt: new Date(),
            lastLogin: new Date(),
            paymentHistory: [],
          },
        };

        const result = await usersCollection.insertOne(userData);
        res.status(201).json({ message: "User created", result });
      } catch (err) {
        res.status(500).json({ error: "Failed to handle Google login." });
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
            "activityLog.lastLogin": new Date(lastLogin),
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
        res.status(500).json({ message: "Internal server error." });
      }
    });

    // NewsLetter Get
    app.get(
      "/newsletter",
      verifyJwtToken,
      verifyEmail,
      verifyAdmin,
      async (req, res) => {
        const result = await newslettersCollection.find().toArray();
        res.send(result);
      }
    );

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
        res.status(500).json({
          success: false,
          message: "Failed to fetch classes",
        });
      }
    });

    // Get featured classes (top 6 by enrollment)
    app.get("/classes/featured", async (req, res) => {
      try {
        // Find active classes, sort by membersEnrolled array length (descending), limit to 6
        const featuredClasses = await classesCollection
          .aggregate([
            { $match: { status: "active" } },
            {
              $addFields: {
                enrollmentCount: { $size: "$membersEnrolled" },
              },
            },
            { $sort: { enrollmentCount: -1 } },
            { $limit: 6 },
          ])
          .toArray();

        res.json({
          success: true,
          data: featuredClasses,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Failed to fetch featured classes",
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

    // Get Payment history
    app.get(
      "/users/paymentData/:id",
      verifyJwtToken,
      verifyEmail,
      async (req, res) => {
        const paymentId = req.params.id;

        try {
          const result = await usersCollection
            .aggregate([
              {
                $match: {
                  "activityLog.paymentHistory._id": new ObjectId(paymentId),
                },
              },
              {
                $project: {
                  _id: 0,
                  name: 1,
                  email: 1,
                  payment: {
                    $filter: {
                      input: "$activityLog.paymentHistory",
                      as: "item",
                      cond: { $eq: ["$$item._id", new ObjectId(paymentId)] },
                    },
                  },
                },
              },
            ])
            .toArray();

          if (result.length === 0 || result[0].payment.length === 0) {
            return res.status(404).json({ message: "Payment entry not found" });
          }

          res.json(result[0].payment[0]);
        } catch (error) {
          res.status(500).json({ message: "Server error" });
        }
      }
    );

    // Update user with trainer book
    app.patch("/users/activity/:email", async (req, res) => {
      const { email } = req.params;
      const paymentData = req.body;
      paymentData._id = new ObjectId();

      const filter = { email };
      const result = await usersCollection.updateOne(filter, {
        $push: {
          "activityLog.paymentHistory": paymentData,
        },
      });
      result.upsertedId = paymentData._id;
      res.send(result);
    });

    // Update payment status
    app.patch("/users/payment-status/:paymentId", async (req, res) => {
      const paymentId = req.params.paymentId;

      try {
        // 1. Update the payment status in the user document
        const updateResult = await usersCollection.updateOne(
          {
            "activityLog.paymentHistory._id": new ObjectId(paymentId),
          },
          {
            $set: {
              "activityLog.paymentHistory.$[entry].paymentStatus": "paid",
            },
          },
          {
            arrayFilters: [{ "entry._id": new ObjectId(paymentId) }],
          }
        );

        if (updateResult.modifiedCount !== 1) {
          return res
            .status(404)
            .json({ message: "Payment not found or already updated." });
        }

        // 2. Retrieve the user and extract the updated payment entry
        const user = await usersCollection.findOne({
          "activityLog.paymentHistory._id": new ObjectId(paymentId),
        });

        if (!user || !user.activityLog?.paymentHistory) {
          return res
            .status(404)
            .json({ message: "User or payment not found." });
        }

        const paymentEntry = user.activityLog.paymentHistory.find((p) =>
          p._id.equals(new ObjectId(paymentId))
        );

        if (!paymentEntry) {
          return res.status(404).json({ message: "Payment entry not found." });
        }

        // Add additional data
        const paymentData = {
          ...paymentEntry,
          userId: user._id,
          userEmail: user.email,
          userName: user.name,
          paidAt: new Date(),
        };

        // 3. Update trainer's booked slots
        const addPaymentDataInTrainer = await usersCollection.updateOne(
          { _id: new ObjectId(paymentEntry.trainerId) },
          {
            $push: {
              "activityLog.bookedSlots": paymentData,
            },
          }
        );

        // 4. Insert into paymentsCollection
        const insertResult = await paymentsCollection.insertOne(paymentData);

        // 5. Update classes collection if classId exists in payment entry
        if (paymentEntry.classId) {
          const classUpdateResult = await classesCollection.updateOne(
            {
              _id: new ObjectId(paymentEntry.classId),
              status: "active",
            },
            {
              $addToSet: { membersEnrolled: user._id },
            }
          );
        }

        res.status(200).json({
          message: "Payment status updated and saved to paymentsCollection.",
          insertId: insertResult.insertedId,
        });
      } catch (error) {
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // Only for admin payment summary
    app.get(
      "/admin/payment-summary",
      verifyJwtToken,
      verifyEmail,
      verifyAdmin,
      async (req, res) => {
        try {
          // 1. Total Paid Amount
          const totalResult = await paymentsCollection
            .aggregate([
              { $match: { paymentStatus: "paid" } },
              {
                $group: {
                  _id: null,
                  totalPaid: {
                    $sum: {
                      $toDouble: {
                        $substrBytes: ["$price", 1, -1],
                      },
                    },
                  },
                },
              },
            ])
            .toArray();

          const totalPaid = totalResult[0]?.totalPaid || 0;

          // 2. Last 6 Paid Transactions
          const last6Transactions = await paymentsCollection
            .find({ paymentStatus: "paid" })
            .sort({ paidAt: -1 })
            .limit(6)
            .toArray();

          res.status(200).json({
            totalPaid,
            last6Transactions,
          });
        } catch (err) {
          res.status(500).json({ message: "Internal server error" });
        }
      }
    );

    app.post("/create-payment-intent", async (req, res) => {
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: 1000, // amount in cents
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.json({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get classes by skills:
    app.get(
      "/classes/by-skills",
      verifyJwtToken,
      verifyEmail,
      async (req, res) => {
        try {
          const { skills } = req.query;

          // Convert to array (if single skill, wrap it)
          const skillArray = Array.isArray(skills)
            ? skills
            : skills?.split(",").map((s) => s.trim());

          if (!skillArray || skillArray.length === 0) {
            return res
              .status(400)
              .json({ success: false, message: "No skills provided" });
          }

          const result = await classesCollection
            .find({ skills: { $in: skillArray } })
            .toArray();

          res.send({
            success: true,
            data: result,
          });
        } catch (err) {
          res.status(500).json({ success: false, message: "Server error" });
        }

        // end
      }
    );

    // Get All reviews
    app.get("/reviews", async (req, res) => {
      const { email } = req.query;
      let query = {};

      if (email) {
        query.email = email;
      }

      try {
        const result = await reviewsCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // Post Reviews
    app.post("/reviews", async (req, res) => {
      const reviewData = req.body;
      const result = await reviewsCollection.insertOne(reviewData);
      res.send(result);
    });

    // Delete slot and Booking details by trainer.
    // DELETE /delete-slot endpoint
    app.delete("/delete-slot", async (req, res) => {
      try {
        const { trainerId, slot, deleteType, bookingId, userId } = req.body;

        // Validate required fields
        if (!trainerId || !slot || !deleteType) {
          return res.status(400).json({
            success: false,
            message: "Missing required fields",
          });
        }

        // Convert trainerId to ObjectId immediately
        let trainerObjectId;
        try {
          trainerObjectId = new ObjectId(trainerId);
        } catch (err) {
          return res.status(400).json({
            success: false,
            message: "Invalid trainer ID format",
          });
        }

        if (deleteType === "slot") {
          // Existing slot deletion logic remains the same
          const slotPullResult = await usersCollection.updateOne(
            { _id: trainerObjectId },
            { $pull: { "trainerApplication.slots": slot } }
          );

          const trainer = await usersCollection.findOne({
            _id: trainerObjectId,
          });

          const matchingBookings =
            trainer?.activityLog?.bookedSlots?.filter(
              (b) => b.slot.day === slot.day && b.slot.time === slot.time
            ) || [];

          for (const booking of matchingBookings) {
            await usersCollection.updateOne(
              { _id: new ObjectId(booking.userId) },
              { $pull: { "activityLog.paymentHistory": { _id: booking._id } } }
            );
          }

          await usersCollection.updateOne(
            { _id: trainerObjectId },
            {
              $pull: {
                "activityLog.bookedSlots": {
                  "slot.day": slot.day,
                  "slot.time": slot.time,
                },
              },
            }
          );

          return res.json({
            success: true,
            message: `Slot and ${matchingBookings.length} related bookings deleted`,
          });
        } else if (deleteType === "booking") {
          // Validate booking deletion params
          if (!bookingId || !userId) {
            return res.status(400).json({
              success: false,
              message: "Missing bookingId or userId for booking deletion",
            });
          }

          // Convert all IDs to ObjectIDs
          let userObjectId, bookingObjectId;
          try {
            userObjectId = new ObjectId(userId);
            bookingObjectId = new ObjectId(bookingId);
          } catch (err) {
            return res.status(400).json({
              success: false,
              message: "Invalid ID format: " + err.message,
            });
          }

          // 1. Remove booking from trainer using converted ObjectID
          const trainerUpdate = await usersCollection.updateOne(
            { _id: trainerObjectId },
            { $pull: { "activityLog.bookedSlots": { _id: bookingObjectId } } }
          );

          // 2. Remove payment from user using converted ObjectID
          const userUpdate = await usersCollection.updateOne(
            { _id: userObjectId },
            {
              $pull: { "activityLog.paymentHistory": { _id: bookingObjectId } },
            }
          );

          // Verify updates with detailed error messages
          let errorMsg = "";
          if (trainerUpdate.modifiedCount === 0) {
            errorMsg += "Booking not found in trainer's slots. ";
          }
          if (userUpdate.modifiedCount === 0) {
            errorMsg += "Payment record not found in user's history.";
          }

          if (errorMsg) {
            return res.status(404).json({
              success: false,
              message: "Failed to delete booking: " + errorMsg,
              details: {
                trainerId: trainerId,
                bookingId: bookingId,
                userId: userId,
              },
            });
          }

          return res.json({
            success: true,
            message: "Booking deleted successfully",
          });
        } else {
          return res.status(400).json({
            success: false,
            message: "Invalid deleteType",
          });
        }
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Internal server error",
          error: error.message,
          stack:
            process.env.NODE_ENV === "development" ? error.stack : undefined,
        });
      }
    });

    // Add Slot by Trainer:
    app.patch("/trainers/add-slots", async (req, res) => {
      try {
        const { trainerId, slots } = req.body;

        if (!trainerId || !slots || !Array.isArray(slots)) {
          return res.status(400).json({
            success: false,
            message: "Missing required fields",
          });
        }

        const trainerObjectId = new ObjectId(trainerId);
        const trainer = await usersCollection.findOne({ _id: trainerObjectId });

        if (!trainer) {
          return res.status(404).json({
            success: false,
            message: "Trainer not found",
          });
        }

        // Get existing slots for duplicate check
        const existingSlots = trainer.trainerApplication.slots || [];
        const existingSlotsSet = new Set(
          existingSlots.map((slot) => `${slot.day}-${slot.time}`)
        );

        // Filter out duplicates
        const newSlotsToAdd = slots.filter(
          (slot) => !existingSlotsSet.has(`${slot.day}-${slot.time}`)
        );

        if (newSlotsToAdd.length === 0) {
          return res.status(400).json({
            success: false,
            message: "All selected slots already exist",
          });
        }

        // Add the new slots
        const result = await usersCollection.updateOne(
          { _id: trainerObjectId },
          { $push: { "trainerApplication.slots": { $each: newSlotsToAdd } } }
        );

        if (result.modifiedCount === 0) {
          return res.status(400).json({
            success: false,
            message: "No slots were added",
          });
        }

        res.json({
          success: true,
          message: `${newSlotsToAdd.length} slot(s) added successfully`,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Internal server error",
          error: error.message,
        });
      }
    });

    // Get forums with pagination
    app.get("/forums", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 6;
        const skip = (page - 1) * pageSize;

        const total = await forumsCollection.countDocuments();
        const forums = await forumsCollection
          .find()
          .skip(skip)
          .limit(pageSize)
          .toArray();

        res.send({ forums, total });
      } catch (error) {
        res.status(500).send({ error: "Server error" });
      }
    });

    // Get 6 Forums for Homepage
    app.get("/forums-six", async (req, res) => {
      const result = await forumsCollection
        .find()
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    // Get single forum data
    app.get("/forums/:id", verifyJwtToken, verifyEmail, async (req, res) => {
      const { id } = req.params;

      const query = { _id: new ObjectId(id) };
      const result = await forumsCollection.findOne(query);
      res.send(result);
    });

    // Vote endpoint
    app.patch("/forum/vote/:id", async (req, res) => {
      try {
        const forumId = req.params.id;
        const { voteType, email } = req.body;

        if (!email || !["up", "down"].includes(voteType)) {
          return res.status(400).send({
            success: false,
            message: "Missing or invalid voteType/email",
          });
        }

        // 1) Fetch the current document
        const forum = await forumsCollection.findOne({
          _id: new ObjectId(forumId),
        });
        if (!forum) {
          return res
            .status(404)
            .send({ success: false, message: "Forum not found" });
        }

        const hasVoted =
          Array.isArray(forum.likes) && forum.likes.includes(email);
        let updateOp;

        if (voteType === "up") {
          if (hasVoted) {
            return res.status(400).send({
              success: false,
              message: "You have already up‑voted this forum.",
            });
          }
          updateOp = { $push: { likes: email } };
        } else {
          // voteType === "down"
          if (!hasVoted) {
            return res
              .status(400)
              .send({ success: false, message: "You haven't up‑voted yet." });
          }
          updateOp = { $pull: { likes: email } };
        }

        // 2) Apply the push/pull
        const result = await forumsCollection.updateOne(
          { _id: new ObjectId(forumId) },
          updateOp
        );

        if (result.modifiedCount === 0) {
          // should be rare, but handle it
          return res
            .status(500)
            .send({ success: false, message: "Failed to update votes." });
        }

        // 3) Return the new total (or full array) if you like:
        const updated = await forumsCollection.findOne(
          { _id: new ObjectId(forumId) },
          { projection: { likes: 1 } }
        );
        return res.send({
          success: true,
          likesCount: updated.likes.length,
          likes: updated.likes,
        });
      } catch (error) {
        console.error("Vote error:", error);
        return res
          .status(500)
          .send({ success: false, message: "Server error." });
      }
    });

    // Add Forums
    app.post("/forums", upload.single("image"), async (req, res) => {
      try {
        // 1. Validate required text fields
        const { userName, userPhotoURL, role, forumTitle, forumDescription } =
          req.body;

        const required = {
          userName,
          userPhotoURL,
          role,
          forumTitle,
          forumDescription,
        };
        for (const [field, value] of Object.entries(required)) {
          if (!value) {
            return res.status(400).json({
              success: false,
              message: `${field} is required`,
            });
          }
        }

        // 2. Ensure image was uploaded
        if (!req.file) {
          return res.status(400).json({
            success: false,
            message: "Forum image is required",
          });
        }

        // 3. Upload image to Cloudinary
        const streamUpload = () =>
          new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              {
                folder: "fitForge/forums",
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );
            streamifier.createReadStream(req.file.buffer).pipe(stream);
          });

        const uploadResult = await streamUpload();

        // 4. Build forum document
        const newForum = {
          userName,
          userPhotoURL,
          role,
          forumTitle,
          forumDescription,
          imageUrl: uploadResult.secure_url,
          imagePublicId: uploadResult.public_id,
          createdAt: new Date(),
          likes: [],
        };

        // 5. Insert into MongoDB
        const result = await forumsCollection.insertOne(newForum);

        res.status(201).json({
          success: true,
          message: "Forum post created successfully",
          data: {
            insertedId: result.insertedId,
          },
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Failed to create forum",
          error: error.message,
        });
      }
    });

    // end
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
  console.log(`FitForge running on port http://localhost:${port}`);
});
