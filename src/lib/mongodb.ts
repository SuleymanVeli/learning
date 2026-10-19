import mongoose from "mongoose";

let connectionPromise: Promise<typeof mongoose> | undefined;

export const connectToDatabase = async () => {
  if (mongoose.connection.readyState === 1) return mongoose;

  if (!connectionPromise) {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
      throw new Error("MONGODB_URI mühit dəyişəni təyin olunmayıb.");
    }

    connectionPromise = mongoose.connect(uri);
  }

  try {
    return await connectionPromise;
  } catch (error) {
    connectionPromise = undefined;
    throw error;
  }
};
