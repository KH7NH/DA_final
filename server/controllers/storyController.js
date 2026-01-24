import fs from "fs";
import imagekit from "../configs/imageKit.js";
import Story from "../models/Story.js";
import User from "../models/User.js";
import { inngest } from "../inngest/index.js";
import { moderateImage } from "../utils/aiModeration.js";

/* =====================================================
   HELPER: GET CURRENT USER (FROM CLERK)
===================================================== */
const getCurrentUser = async (authFn) => {
  const auth = await authFn();
  const { userId } = auth || {};
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
    const { content = "", media_type, background_color } = req.body || {};
    const media = req.file;

    let media_url = "";
    let media_file_path = "";
    let is_sensitive = false;
    let moderation = [];

    /* =========================
       TEXT STORY
    ========================= */
    if (media_type === "text") {
      if (!content.trim()) {
        return res.json({ success: false, message: "Please enter some text" });
      }

      const story = await Story.create({
        user: user._id,
        content,
        media_url: "",
        media_file_path: "",
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

    /* =========================
       IMAGE / VIDEO STORY
    ========================= */
    if ((media_type === "image" || media_type === "video") && media) {
      /* ========= 1) MODERATION FIRST ========= */
      if (media_type === "image") {
        const ai = await moderateImage(media.path);

        const nsfw = Number(ai?.nsfw_sensitive_prob ?? ai?.nsfw_prob ?? 0);
        const gore = Number(ai?.gore_score ?? 0);

        const flagged = nsfw >= 0.85 || gore >= 0.75;

        is_sensitive = flagged;

        moderation.push({
          file: media.originalname,
          is_sensitive: flagged,
          nsfw_prob: Number.isFinite(nsfw) ? nsfw : null,
          gore_score: Number.isFinite(gore) ? gore : null,
        });

        /* ========= 2) BLOCK UNVERIFIED USER ========= */
        if (flagged && (user.age_verified_level ?? 0) < 1) {
          try {
            fs.unlinkSync(media.path);
          } catch (_) {}

          return res.status(403).json({
            success: false,
            code: "AGE_VERIFICATION_REQUIRED",
            message: "You need to verify your age to post stories containing sensitive or violent content.",
            moderation,
          });
        }
      }

      /* ========= 3) UPLOAD IMAGEKIT ========= */
      const buffer = fs.readFileSync(media.path);
      const upload = await imagekit.upload({
        file: buffer,
        fileName: media.originalname,
        folder: "stories",
      });

      media_file_path = upload.filePath;

      /* ========= 4) CREATE DISPLAY URL ========= */
      if (media_type === "image") {
        const transformation = is_sensitive
          ? [{ blur: "60" }, { quality: "auto" }, { format: "webp" }, { width: "1080" }]
          : [{ quality: "auto" }, { format: "webp" }, { width: "1080" }];

        media_url = imagekit.url({
          path: upload.filePath,
          transformation,
        });
      } else {
        // video
        media_url = upload.url;
      }

      /* ========= 5) CLEAN TEMP FILE ========= */
      try {
        fs.unlinkSync(media.path);
      } catch (_) {}
    }

    /* =========================
       CREATE STORY
    ========================= */
    const story = await Story.create({
      user: user._id,
      content,
      media_url,
      media_file_path,
      media_type,
      background_color,
      is_sensitive,
      moderation,
    });

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
    const feedUserIds = [user._id, ...(user.following || []), ...(user.connections || [])];

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

/* =====================================================
   REVEAL STORY
===================================================== */
export const revealStory = async (req, res) => {
  try {
    const user = await getCurrentUser(req.auth);
    const { storyId } = req.body;

    if (!storyId) {
      return res.status(400).json({ success: false, message: "Missing storyId" });
    }

    const story = await Story.findById(storyId).select(
      "media_type media_file_path media_url is_sensitive"
    );

    if (!story) {
      return res.status(404).json({ success: false, message: "Story not found" });
    }

    if (!story.is_sensitive) {
      return res.json({ success: true, original: story.media_url });
    }

    if ((user.age_verified_level ?? 0) < 1) {
      return res.status(403).json({ success: false, message: "18+ only" });
    }

    if (story.media_type !== "image") {
      return res.json({ success: true, original: story.media_url });
    }

    if (!story.media_file_path) {
      return res.status(400).json({
        success: false,
        message: "Missing media_file_path for this story",
      });
    }

    const original = imagekit.url({
      path: story.media_file_path,
      transformation: [{ quality: "auto" }, { format: "webp" }, { width: "1080" }],
    });

    return res.json({ success: true, original });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
