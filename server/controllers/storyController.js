import fs from "fs";
import imagekit from "../configs/imageKit.js";
import Story from "../models/Story.js";
import User from "../models/User.js";
import { inngest } from "../inngest/index.js";

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

    // Upload media to ImageKit
    if ((media_type === "image" || media_type === "video") && media) {
      const buffer = fs.readFileSync(media.path);

      const upload = await imagekit.upload({
        file: buffer,
        fileName: media.originalname,
        folder: "stories",
      });

      media_url = upload.url;
    }

    // Create story
    const story = await Story.create({
      user: user._id, // ✅ ObjectId
      content,
      media_url,
      media_type,
      background_color,
    });

    // Schedule auto delete after 24h
    await inngest.send({
      name: "app/story.delete",
      data: { storyId: story._id },
    });

    res.json({ success: true });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

/* =====================================================
   GET STORIES (FEED)
===================================================== */
export const getStories = async (req, res) => {
  try {
    const user = await getCurrentUser(req.auth);

    const feedUserIds = [
      user._id,
      ...user.following,
      ...user.connections,
    ];

    const stories = await Story.find({
      user: { $in: feedUserIds },
    })
      .populate("user")
      .sort({ createdAt: -1 });

    res.json({ success: true, stories });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};
