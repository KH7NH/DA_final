import express from "express";
import { upload } from "../configs/multer.js";
import { protect } from "../middlewares/auth.js";
import { addPost, getFeedPosts, likePost, revealPost } from "../controllers/postController.js";

const postRouter = express.Router();

postRouter.post("/add", protect, upload.array("images", 10), addPost);
postRouter.get("/feed", protect, getFeedPosts);
postRouter.post("/like", protect, likePost);
postRouter.post("/reveal", protect, revealPost);

export default postRouter;
