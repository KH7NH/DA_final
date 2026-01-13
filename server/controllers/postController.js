// controllers/postController.js
import fs from "fs";
import axios from "axios";
import FormData from "form-data";
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
   HELPER: CALL AI SERVICE (moderation)
   FastAPI trả: { success: true, result: {...} }
===================================================== */
const moderateImageBuffer = async (buffer, fileName = "image.jpg") => {
  const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:8001";

  try {
    const form = new FormData();

    // form-data (Node) cần truyền buffer + filename
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

    // ✅ FastAPI của bạn return { success: true, result: ... }
    if (data?.success && data?.result) return data.result;

    // Nếu format khác mong đợi
    console.log("[AI_MODERATION_WARNING] Unexpected response:", data);
    return { is_sensitive: false, error: true };
  } catch (err) {
    console.log(
      "[AI_MODERATION_ERROR]",
      err?.response?.data || err.message
    );
    // Fail-open: không blur nếu AI lỗi (bạn có thể đổi thành true để fail-close)
    return { is_sensitive: false, error: true };
  }
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
    let is_sensitive = false;

    // log moderation (lưu DB nếu schema có field)
    const moderation = [];

    if (images.length) {
      image_urls = await Promise.all(
        images.map(async (image) => {
          const buffer = fs.readFileSync(image.path);

          // 1) gọi AI để kiểm duyệt
          const ai = await moderateImageBuffer(buffer, image.originalname);

          const flagged = !!ai?.is_sensitive;
          if (flagged) is_sensitive = true;

          moderation.push({
            file: image.originalname,
            is_sensitive: flagged,
            nsfw_prob: ai?.nsfw_sensitive_prob ?? ai?.nsfw_prob ?? null,
            gore_score: ai?.gore_score ?? null,
          });

          // 2) upload lên ImageKit
          const upload = await imagekit.upload({
            file: buffer,
            fileName: image.originalname,
            folder: "posts",
          });

          // 3) tạo URL hiển thị
          // Nếu nhạy cảm: blur mạnh + vẫn tối ưu ảnh
          const transformation = flagged
            ? [
                { blur: "60" },
                { quality: "auto" },
                { format: "webp" },
                { width: "1280" },
              ]
            : [{ quality: "auto" }, { format: "webp" }, { width: "1280" }];

          // 4) xoá file tạm (multer)
          try {
            fs.unlinkSync(image.path);
          } catch (_) {}

          return imagekit.url({
            path: upload.filePath,
            transformation,
          });
        })
      );
    }

    // ⚠️ Nếu bạn muốn lưu is_sensitive / moderation:
    // cần thêm field vào Post schema (type: Boolean + Array)
    await Post.create({
      user: user._id,
      content,
      image_urls,
      post_type,
      is_sensitive,
      moderation,
    });

    return res.json({ success: true, message: "Post created successfully" });
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

    const feedUserIds = [user._id, ...user.following, ...user.connections];

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
    if (!post) {
      return res.json({ success: false, message: "Post not found" });
    }

    const userIdStr = user._id.toString();

    if (post.likes_count.some((id) => id.toString() === userIdStr)) {
      post.likes_count = post.likes_count.filter(
        (id) => id.toString() !== userIdStr
      );
      await post.save();
      return res.json({ success: true, message: "Post unliked" });
    }

    post.likes_count.push(user._id);
    await post.save();

    return res.json({ success: true, message: "Post liked" });
  } catch (error) {
    console.log(error);
    return res.json({ success: false, message: error.message });
  }
};
