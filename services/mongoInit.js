import mongoose from "mongoose";

export const initMongo = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.log("❌ MongoDB Error:", err.message);
  }
};

export const isMongoReady = () => mongoose.connection.readyState === 1;