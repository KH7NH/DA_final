import express from "express";
import { upload } from "../configs/multer.js";
import { protect } from "../middlewares/auth.js";
import { addPost, getFeedPosts, likePost, revealPost } from "../controllers/postController.js";

const postRouter = express.Router();

postRouter.post("/add", upload.array("images", 10), protect, addPost);
postRouter.get("/feed", protect, getFeedPosts);
postRouter.post("/like", protect, likePost);

// ✅ reveal original images for sensitive posts
postRouter.post("/reveal", protect, revealPost);

export default postRouter;
