import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';

import batchesRoutes from './routes/batchesRoutes.js';
import { connectDb } from './config/db.js';
import rateLimiter from './middleware/rateLimiter.js';


dotenv.config();

const app = express();
const PORT= process.env.PORT || 5001;


// Middleware to parse JSON bodies
app.use(cors({
  origin: 'http://localhost:5173', // Adjust this to your frontend's origin
}));
app.use(express.json());
app.use(rateLimiter);

app.use("/api/batch", batchesRoutes);

connectDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
});
