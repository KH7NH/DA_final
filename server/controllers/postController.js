import fs from "fs";
import axios from "axios";
import FormData from "form-data";
import imagekit from "../configs/imageKit.js";
import Post from "../models/Post.js";
import User from "../models/User.js";

/* =====================================================
   HELPER: GET CURRENT USER (FROM CLERK)
===================================================== */
const getCurrentUser = async (authFn) => {
  const auth = await authFn(); // ✅ async
  const { userId } = auth || {};
  if (!userId) throw new Error("Unauthenticated");

  const user = await User.findOne({ clerkId: userId });
  if (!user) throw new Error("User not found");

  return user;
};

/* =====================================================
   HELPER: CALL AI SERVICE (moderation)
===================================================== */
const moderateImageBuffer = async (buffer, fileName = "image.jpg") => {
  const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || "http://127.0.0.1:8001").replace(/\/$/, "");

  try {
    const form = new FormData();
    form.append("file", buffer, {
      filename: fileName,
      contentType: "application/octet-stream",
    });

    const { data } = await axios.post(`${AI_SERVICE_URL}/predict`, form, {
      headers: form.getHeaders(),
      timeout: 30000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    if (data?.success && data?.result) return data.result;

    console.log("[AI_MODERATION_WARNING] Unexpected response:", data);
    return { is_sensitive: false, error: true };
  } catch (err) {
    console.log("[AI_MODERATION_ERROR]", err?.response?.data || err.message);
    return { is_sensitive: false, error: true };
  }
};

/* =====================================================
   ADD POST
===================================================== */
export const addPost = async (req, res) => {
  try {
    const user = await getCurrentUser(req.auth);

    // ✅ default để tránh undefined
    let { content = "", post_type = "" } = req.body || {};
    let images = req.files || [];

    let image_urls = [];
    let image_file_paths = [];
    let is_sensitive = false;

    // ✅ FIX: moderation phải là let nếu bạn gán lại
    let moderation = [];

    if (images.length) {
      const results = await Promise.all(
        images.map(async (image) => {
          const buffer = fs.readFileSync(image.path);

          // 1) AI moderation
          const ai = await moderateImageBuffer(buffer, image.originalname);
          const nsfw = Number(ai?.nsfw_sensitive_prob ?? ai?.nsfw_prob ?? 0);
          const gore = Number(ai?.gore_score ?? 0);

          const flagged = nsfw >= 0.85 || gore >= 0.75;

          // 2) upload ImageKit
          const upload = await imagekit.upload({
            file: buffer,
            fileName: image.originalname,
            folder: "posts",
          });

          // 3) display URL (blur if flagged)
          const transformation = flagged
            ? [{ blur: "60" }, { quality: "auto" }, { format: "webp" }, { width: "1280" }]
            : [{ quality: "auto" }, { format: "webp" }, { width: "1280" }];

          const displayUrl = imagekit.url({
            path: upload.filePath,
            transformation,
          });

          // 4) cleanup temp file
          try {
            fs.unlinkSync(image.path);
          } catch (_) {}

          return {
            displayUrl,
            filePath: upload.filePath,
            moderationItem: {
              file: image.originalname,
              is_sensitive: flagged,
              nsfw_prob: Number.isFinite(nsfw) ? nsfw : null,
              gore_score: Number.isFinite(gore) ? gore : null,
            },
            flagged,
          };
        })
      );

      image_urls = results.map((r) => r.displayUrl);
      image_file_paths = results.map((r) => r.filePath);

      // ✅ FIX: giờ gán lại OK vì moderation là let
      moderation = results.map((r) => r.moderationItem);

      // ✅ set cờ cấp bài
      is_sensitive = results.some((r) => r.flagged);

      // (optional) nếu post_type gửi lên bị rỗng thì tự set
      if (!post_type) {
        post_type = content?.trim() ? "text_with_image" : "image";
      }
    } else {
      // không có ảnh
      if (!post_type) post_type = "text";
    }

    const post = await Post.create({
      user: user._id,
      content,
      image_urls,
      image_file_paths,
      post_type,
      is_sensitive,
      moderation,
    });

    return res.json({ success: true, message: "Post created successfully", post });
  } catch (error) {
    console.log(error);
    return res.json({ success: false, message: error.message });
  }
};

/* =====================================================
   GET FEED POSTS
===================================================== */
export const getFeedPosts = async (req, res) => {
  try {
    const user = await getCurrentUser(req.auth);
    const feedUserIds = [user._id, ...(user.following || []), ...(user.connections || [])];

    const posts = await Post.find({
      user: { $in: feedUserIds },
    })
      .populate("user")
      .sort({ createdAt: -1 });

    return res.json({ success: true, posts });
  } catch (error) {
    console.log(error);
    return res.json({ success: false, message: error.message });
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
    if (!post) return res.json({ success: false, message: "Post not found" });

    const userIdStr = user._id.toString();

    if (post.likes_count?.some((id) => id.toString() === userIdStr)) {
      post.likes_count = post.likes_count.filter((id) => id.toString() !== userIdStr);
      await post.save();
      return res.json({ success: true, message: "Post unliked" });
    }

    post.likes_count = post.likes_count || [];
    post.likes_count.push(user._id);
    await post.save();

    return res.json({ success: true, message: "Post liked" });
  } catch (error) {
    console.log(error);
    return res.json({ success: false, message: error.message });
  }
};

/* =====================================================
   REVEAL POST (return unblurred urls if verified)
===================================================== */
export const revealPost = async (req, res) => {
  try {
    const user = await getCurrentUser(req.auth);
    const { postId } = req.body;

    if (!postId) {
      return res.status(400).json({ success: false, message: "Missing postId" });
    }

    const post = await Post.findById(postId).select("is_sensitive image_file_paths image_urls");
    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    // không nhạy cảm → trả luôn
    if (!post.is_sensitive) {
      return res.json({ success: true, originals: post.image_urls });
    }

    // nhạy cảm → cần verify
    if ((user.age_verified_level ?? 0) < 1) {
      return res.status(403).json({ success: false, message: "18+ only" });
    }

    if (!post.image_file_paths?.length) {
      return res.status(400).json({ success: false, message: "Missing image_file_paths for this post" });
    }

    const originals = post.image_file_paths.map((p) =>
      imagekit.url({
        path: p,
        transformation: [{ quality: "auto" }, { format: "webp" }, { width: "1280" }],
      })
    );

    return res.json({ success: true, originals });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
