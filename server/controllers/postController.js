import fs from "fs";
import imagekit from "../configs/imageKit.js";
import Post from "../models/Post.js";
import User from "../models/User.js";

/* =====================================================
   HELPER: GET CURRENT USER (FROM CLERK)
===================================================== */
const getCurrentUser = async (auth) => {
  const { userId } = auth();
  if (!userId) throw new Error("Unauthenticated");

  const user = await User.findOne({ clerkId: userId });
  if (!user) throw new Error("User not found");

  return user;
};

/* =====================================================
   ADD POST
===================================================== */
export const addPost = async (req, res) => {
  try {
    const user = await getCurrentUser(req.auth);
    const { content, post_type } = req.body;
    const images = req.files || [];

    let image_urls = [];

    if (images.length) {
      image_urls = await Promise.all(
        images.map(async (image) => {
          const buffer = fs.readFileSync(image.path);

          const upload = await imagekit.upload({
            file: buffer,
            fileName: image.originalname,
            folder: "posts",
          });

          return imagekit.url({
            path: upload.filePath,
            transformation: [
              { quality: "auto" },
              { format: "webp" },
              { width: "1280" },
            ],
          });
        })
      );
    }

    await Post.create({
      user: user._id, // ✅ ObjectId
      content,
      image_urls,
      post_type,
    });

    res.json({ success: true, message: "Post created successfully" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

/* =====================================================
   GET FEED POSTS
===================================================== */
export const getFeedPosts = async (req, res) => {
  try {
    const user = await getCurrentUser(req.auth);

    const feedUserIds = [
      user._id,
      ...user.following,
      ...user.connections,
    ];

    const posts = await Post.find({
      user: { $in: feedUserIds },
    })
      .populate("user")
      .sort({ createdAt: -1 });

    res.json({ success: true, posts });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

/* =====================================================
   LIKE / UNLIKE POST
===================================================== */
export const likePost = async (req, res) => {
  try {
    const user = await getCurrentUser(req.auth);
    const { postId } = req.body;

    const post = await Post.findById(postId);
    if (!post) {
      return res.json({ success: false, message: "Post not found" });
    }

    const userIdStr = user._id.toString();

    if (post.likes_count.some(id => id.toString() === userIdStr)) {
      post.likes_count = post.likes_count.filter(
        id => id.toString() !== userIdStr
      );
      await post.save();
      return res.json({ success: true, message: "Post unliked" });
    }

    post.likes_count.push(user._id);
    await post.save();

    res.json({ success: true, message: "Post liked" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};
