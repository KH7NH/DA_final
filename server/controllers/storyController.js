import fs from "fs";
import imagekit from "../configs/imageKit.js";
import Story from "../models/Story.js";
import User from "../models/User.js";
import { inngest } from "../inngest/index.js";
import { moderateImage } from "../utils/aiModeration.js";

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
   ADD USER STORY
===================================================== */
export const addUserStory = async (req, res) => {
  try {
    const user = await getCurrentUser(req.auth);
    const { content, media_type, background_color } = req.body;
    const media = req.file;

    let media_url = "";
    let is_sensitive = false;
    const moderation = [];

    // ===== TEXT STORY =====
    if (media_type === "text") {
      if (!content) throw new Error("Please enter some text");

      const story = await Story.create({
        user: user._id,
        content,
        media_url: "",
        media_type: "text",
        background_color,
        is_sensitive: false,
        moderation: [],
      });

      await inngest.send({
        name: "app/story.delete",
        data: { storyId: story._id },
      });

      return res.json({ success: true, story });
    }

    // ===== IMAGE / VIDEO =====
    if ((media_type === "image" || media_type === "video") && media) {
      // ✅ 1) nếu là image -> gọi AI kiểm duyệt bằng filePath (vì util đang dùng stream)
      if (media_type === "image") {
        const ai = await moderateImage(media.path);

        // AI result của bạn có thể là:
        // - { is_sensitive: true/false, nsfw_sensitive_prob, gore_score, final: "NHẠY CẢM" }
        const flagged = !!ai?.is_sensitive || ai?.final === "NHẠY CẢM";
        is_sensitive = flagged;

        moderation.push({
          file: media.originalname,
          is_sensitive: flagged,
          nsfw_prob: ai?.nsfw_sensitive_prob ?? ai?.nsfw_prob ?? null,
          gore_score: ai?.gore_score ?? null,
        });
      }

      // ✅ 2) Upload lên ImageKit
      const buffer = fs.readFileSync(media.path);
      const upload = await imagekit.upload({
        file: buffer,
        fileName: media.originalname,
        folder: "stories",
      });

      // ✅ 3) Tạo URL hiển thị
      if (media_type === "image") {
        const transformation = is_sensitive
          ? [
              { blur: "60" },
              { quality: "auto" },
              { format: "webp" },
              { width: "1080" },
            ]
          : [{ quality: "auto" }, { format: "webp" }, { width: "1080" }];

        media_url = imagekit.url({
          path: upload.filePath,
          transformation,
        });
      } else {
        // video: giữ nguyên (không blur)
        media_url = upload.url;
      }

      // ✅ 4) Xóa file tạm multer
      try {
        fs.unlinkSync(media.path);
      } catch (_) {}
    }

    // Create story
    const story = await Story.create({
      user: user._id,
      content,
      media_url,
      media_type,
      background_color,
      is_sensitive,
      moderation,
    });

    // Schedule auto delete after 24h
    await inngest.send({
      name: "app/story.delete",
      data: { storyId: story._id },
    });

    return res.json({ success: true, story });
  } catch (error) {
    console.log(error);
    return res.json({ success: false, message: error.message });
  }
};

/* =====================================================
   GET STORIES (FEED)
===================================================== */
export const getStories = async (req, res) => {
  try {
    const user = await getCurrentUser(req.auth);

    const feedUserIds = [user._id, ...user.following, ...user.connections];

    const stories = await Story.find({
      user: { $in: feedUserIds },
    })
      .populate("user")
      .sort({ createdAt: -1 });

    return res.json({ success: true, stories });
  } catch (error) {
    console.log(error);
    return res.json({ success: false, message: error.message });
  }
};
