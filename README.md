# FitForge Backend Server

![Node.js](https://img.shields.io/badge/Node.js-18.x-green)
![Express](https://img.shields.io/badge/Express-5.x-lightgrey)
![MongoDB](https://img.shields.io/badge/MongoDB-6.x-green)
![JWT](https://img.shields.io/badge/JWT-Auth-blue)
![Stripe](https://img.shields.io/badge/Stripe-Payments-blueviolet)

The backend server for **FitForge** — a fitness platform connecting trainers with members. This server handles user management, class bookings, payments, trainer applications, and community forums.

---

## 🚀 Features

### 🔐 User Management

- Google/GitHub OAuth login
- Trainer application system
- Role-based access (Admin/Trainer/Member)
- Profile management with image uploads

### 🏋️ Fitness Classes

- Class creation with image uploads
- Skill-based class filtering
- Enrollment tracking
- Featured classes
- Reviews and ratings

### 💳 Payments

- Stripe integration
- Payment history tracking
- Admin revenue dashboard
- Booking management

### 👨‍🏫 Trainer System

- Slot management and booking system
- Application approval workflow
- Top trainers selection
- Schedule management

### 💬 Community

- Forum posts with voting
- User reviews
- Newsletter subscriptions
- Discussion threads

---

## 🛠 Technologies Used

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB Atlas
- **Cloud Storage**: Cloudinary
- **Authentication**: JWT
- **Payments**: Stripe

**Other Dependencies**:

- `cors`
- `dotenv`
- `jsonwebtoken`
- `multer`
- `cloudinary`
- `stripe`
- `mongodb`

---

## 📁 Environment Variables

Create a `.env` file in the root directory with:

```env
PORT=3000
DB_USER=your_mongodb_username
DB_PASS=your_mongodb_password
JWT_SECRET_KEY=your_jwt_secret_key
STRIPE_SK=your_stripe_secret_key
CLOUDINARY_CLOUD_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_key
CLOUDINARY_API_SECRET=your_cloudinary_secret
```

---

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/arafat22184/assignment-12-server
cd assignment-12-server

# Install dependencies
npm install

# Start the development server
npm start
```

The server will run at: [http://localhost:3000](http://localhost:3000)

---

## 📡 API Endpoints

### 🔐 Authentication

| Method | Endpoint | Description        |
| ------ | -------- | ------------------ |
| POST   | `/jwt`   | Generate JWT token |

> **Middlewares**: `verifyJwtToken`, `verifyAdmin`, `verifyTrainer`

---

### 👥 Users

| Method | Endpoint                      | Description                      | Access        |
| ------ | ----------------------------- | -------------------------------- | ------------- |
| GET    | `/users`                      | Get all users                    | Admin         |
| GET    | `/users/:email`               | Get user by email                | Authenticated |
| POST   | `/users`                      | Register new user                | Public        |
| POST   | `/users/social`               | Social login                     | Public        |
| PATCH  | `/users/become-trainer`       | Submit trainer application       | Member        |
| GET    | `/users/top-trainers`         | Get top 3 trainers               | Public        |
| PATCH  | `/users/approve-trainer/:id`  | Approve trainer                  | Admin         |
| GET    | `/users/trainer-applications` | Get pending trainer applications | Admin         |

---

### 📚 Classes

| Method | Endpoint             | Description                           | Access        |
| ------ | -------------------- | ------------------------------------- | ------------- |
| GET    | `/classes`           | Get classes with pagination/filtering | Public        |
| GET    | `/classes/featured`  | Get featured classes                  | Public        |
| POST   | `/classes`           | Create new class                      | Trainer/Admin |
| GET    | `/classes/by-skills` | Get classes by skills                 | Authenticated |
| GET    | `/classes/all`       | Get all active classes                | Public        |

---

### 💰 Payments

| Method | Endpoint                           | Description                  | Access        |
| ------ | ---------------------------------- | ---------------------------- | ------------- |
| POST   | `/create-payment-intent`           | Create Stripe payment intent | Authenticated |
| PATCH  | `/users/payment-status/:paymentId` | Update payment status        | Authenticated |
| GET    | `/admin/payment-summary`           | Payment summary              | Admin         |

---

### 🗨 Forums

| Method | Endpoint          | Description          | Access        |
| ------ | ----------------- | -------------------- | ------------- |
| GET    | `/forums`         | Get paginated forums | Public        |
| GET    | `/forums-six`     | Get latest 6 forums  | Public        |
| POST   | `/forums`         | Create forum post    | Authenticated |
| PATCH  | `/forum/vote/:id` | Upvote/downvote      | Authenticated |
| GET    | `/forums/:id`     | Get single forum     | Authenticated |

---

### 🛎 Other

| Method | Endpoint      | Description             | Access        |
| ------ | ------------- | ----------------------- | ------------- |
| POST   | `/newsletter` | Subscribe to newsletter | Public        |
| GET    | `/reviews`    | Get user reviews        | Public        |
| POST   | `/reviews`    | Submit review           | Authenticated |

---

## 🧩 Database Schema

### 🧑 Users Collection

```js
{
  name: String,
  email: String,       // Unique
  photoURL: String,
  role: String,        // ['admin', 'trainer', 'member']
  activityLog: {
    createdAt: Date,
    lastLogin: Date,
    paymentHistory: [ObjectId],
    bookedSlots: [Object]
  },
  trainerApplication: {
    name: String,
    age: Number,
    experience: String,
    certifications: [String],
    skills: [String],
    slots: [{
      day: String,
      time: String
    }],
    status: String,     // ['pending', 'approved', 'rejected']
    createdAt: Date,
    updatedAt: Date
  }
}
```

### 🏋️ Classes Collection

```js
{
  className: String,
  skills: [String],
  description: String,
  difficultyLevel: String,
  equipmentNeeded: [String],
  imageUrl: String,
  createdBy: ObjectId,   // Trainer ID
  createdAt: Date,
  status: String,        // ['active', 'inactive']
  membersEnrolled: [ObjectId],
  averageRating: Number,
  totalReviews: Number
}
```

---

## ☁️ Deployment

Platforms:

- Render
- Vercel (API)
- Heroku
- AWS Elastic Beanstalk

### Example Deployment to Render

1. Create a new Web Service
2. Connect GitHub repository
3. Set environment variables
4. Build command: `npm install`
5. Start command: `npm start`
6. Deploy 🚀

---

## 📂 Project Structure

```
fitforge-backend/
├── index.js               # Main server entry point
├── package.json           # Project metadata and dependencies
├── .env                   # Environment variables
├── cloudinary.js          # Cloudinary config
└── README.md              # You're reading it!
```

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch:

```bash
git checkout -b feature/your-feature
```

3. Commit your changes:

```bash
git commit -m "Add some feature"
```

4. Push to the branch:

```bash
git push origin feature/your-feature
```

5. Open a pull request

---

## 📧 Support

For questions or issues, open an [issue](https://github.com/arafat22184/assignment-12-server/issues) or email:  
**123alarafat@gmail.com**

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).
