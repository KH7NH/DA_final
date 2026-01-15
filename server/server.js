import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import connectDB from './configs/db.js';
import { inngest, functions } from './inngest/index.js'
import { serve } from 'inngest/express'
import { clerkMiddleware } from '@clerk/express'
import userRouter from './routes/userRotes.js';
import postRouter from './routes/postRoutes.js';
import storyRouter from './routes/storyRoutes.js';
import messageRouter from './routes/messageRoutes.js';
import ageRouter from './routes/ageRoutes.js';
import multer from 'multer';

const app = express();

await connectDB();

app.use(express.json());
app.use(cors());
app.use(clerkMiddleware());
app.use('/api/age', ageRouter);

app.get('/', (req, res) => res.send('Server is running'))
app.use('/api/inngest', serve({ client: inngest, functions }))
app.use('/api/user', userRouter)
app.use('/api/post', postRouter)
app.use('/api/story', storyRouter)
app.use('/api/message', messageRouter)


app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        success: false,
        message: "Bạn upload quá số lượng ảnh cho phép.",
      });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  return res.status(500).json({ success: false, message: err.message || "Server error" });
});



const PORT = process.env.PORT || 4000;

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`))