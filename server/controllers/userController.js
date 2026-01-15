import fs from "fs";
import imagekit from "../configs/imageKit.js";
import { inngest } from "../inngest/index.js";
import Connection from "../models/Connection.js";
import Post from "../models/Post.js";
import User from "../models/User.js";
import { clerkClient } from "@clerk/express";
import { moderateImage } from "../utils/aiModeration.js";


/* =====================================================
   HELPER: GET OR CREATE USER (SAFE – NO DUPLICATE)
===================================================== */
const getOrCreateUser = async (auth) => {
  const { userId } = auth();
  if (!userId) throw new Error("Unauthenticated");

  const clerkUser = await clerkClient.users.getUser(userId);

  return await User.findOneAndUpdate(
    { clerkId: userId },
    {
      $setOnInsert: {
        clerkId: userId,
        email: clerkUser.emailAddresses?.[0]?.emailAddress || "",
        full_name: `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim(),
        profile_picture: clerkUser.imageUrl || "",
        followers: [],
        following: [],
        connections: [],
      },
    },
    { upsert: true, new: true }
  );
};

/* =====================================================
   GET USER DATA
===================================================== */
export const getUserData = async (req, res) => {
  try {
    const user = await getOrCreateUser(req.auth);
    res.json({ success: true, user });
  } catch (err) {
    console.log(err);
    res.json({ success: false, message: err.message });
  }
};

/* =====================================================
   UPDATE USER DATA
===================================================== */
export const updateUserData = async (req, res) => {
  try {
    const user = await getOrCreateUser(req.auth);
    const { username, bio, location, full_name } = req.body;

    const update = {};

    // ===== Validate username =====
    if (username && username !== user.username) {
      const exists = await User.findOne({ username });
      if (exists) {
        return res.status(400).json({ success: false, message: "Username already taken" });
      }
      update.username = username;
    }

    if (bio !== undefined) update.bio = bio;
    if (location !== undefined) update.location = location;
    if (full_name !== undefined) update.full_name = full_name;

    const profile = req.files?.profile?.[0];
    const cover = req.files?.cover?.[0];

    // Helper: cleanup file temp
    const safeUnlink = (p) => {
      try {
        if (p) fs.unlinkSync(p);
      } catch (_) {}
    };

    // ===== AI Moderation: block sensitive avatar/cover =====
    // Nếu 1 trong 2 ảnh nhạy cảm -> chặn toàn bộ (không update)
    if (profile) {
      const ai = await moderateImage(profile.path);
      const flagged = !!ai?.is_sensitive || ai?.final === "NHẠY CẢM";
      if (flagged) {
        safeUnlink(profile.path);
        if (cover) safeUnlink(cover.path);
        return res.status(400).json({
          success: false,
          message: "Ảnh avatar không phù hợp (nhạy cảm/kinh dị). Vui lòng chọn ảnh khác.",
        });
      }
    }

    if (cover) {
      const ai = await moderateImage(cover.path);
      const flagged = !!ai?.is_sensitive || ai?.final === "NHẠY CẢM";
      if (flagged) {
        safeUnlink(cover.path);
        if (profile) safeUnlink(profile.path);
        return res.status(400).json({
          success: false,
          message: "Ảnh nền không phù hợp (nhạy cảm/kinh dị). Vui lòng chọn ảnh khác.",
        });
      }
    }

    // ===== Upload profile to ImageKit =====
    if (profile) {
      const buffer = fs.readFileSync(profile.path);
      const upload = await imagekit.upload({
        file: buffer,
        fileName: profile.originalname,
        folder: "profiles",
      });

      update.profile_picture = imagekit.url({
        path: upload.filePath,
        transformation: [{ width: 512 }, { format: "webp" }, { quality: "auto" }],
      });

      safeUnlink(profile.path);
    }

    // ===== Upload cover to ImageKit =====
    if (cover) {
      const buffer = fs.readFileSync(cover.path);
      const upload = await imagekit.upload({
        file: buffer,
        fileName: cover.originalname,
        folder: "covers",
      });

      update.cover_photo = imagekit.url({
        path: upload.filePath,
        transformation: [{ width: 1400 }, { format: "webp" }, { quality: "auto" }],
      });

      safeUnlink(cover.path);
    }

    const updated = await User.findByIdAndUpdate(user._id, update, { new: true });

    return res.json({ success: true, user: updated });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ success: false, message: err.message });
  }
};



/* =====================================================
   DISCOVER USERS
===================================================== */
export const discoverUsers = async (req, res) => {
  try {
    const user = await getOrCreateUser(req.auth);
    const { input = "" } = req.body;

    const users = await User.find({
      _id: { $ne: user._id },
      $or: [
        { username: new RegExp(input, "i") },
        { email: new RegExp(input, "i") },
        { full_name: new RegExp(input, "i") },
        { location: new RegExp(input, "i") },
      ],
    });

    res.json({ success: true, users });
  } catch (err) {
    console.log(err);
    res.json({ success: false, message: err.message });
  }
};

/* =====================================================
   FOLLOW / UNFOLLOW
===================================================== */
export const followUser = async (req, res) => {
  try {
    const user = await getOrCreateUser(req.auth);
    const { id } = req.body;

    await User.findByIdAndUpdate(user._id, {
      $addToSet: { following: id },
    });

    await User.findByIdAndUpdate(id, {
      $addToSet: { followers: user._id },
    });

    res.json({ success: true });
  } catch (err) {
    console.log(err);
    res.json({ success: false, message: err.message });
  }
};

export const unfollowUser = async (req, res) => {
  try {
    const user = await getOrCreateUser(req.auth);
    const { id } = req.body;

    await User.findByIdAndUpdate(user._id, {
      $pull: { following: id },
    });

    await User.findByIdAndUpdate(id, {
      $pull: { followers: user._id },
    });

    res.json({ success: true });
  } catch (err) {
    console.log(err);
    res.json({ success: false, message: err.message });
  }
};

/* =====================================================
   CONNECTIONS
===================================================== */
export const sendConnectionRequest = async (req, res) => {
  try {
    const user = await getOrCreateUser(req.auth);
    const { id } = req.body;

    const exists = await Connection.findOne({
      $or: [
        { from_user_id: user._id, to_user_id: id },
        { from_user_id: id, to_user_id: user._id },
      ],
    });

    if (exists) {
      return res.json({ success: false, message: "Request already exists" });
    }

    const connection = await Connection.create({
      from_user_id: user._id,
      to_user_id: id,
    });

    await inngest.send({
      name: "app/connection-request",
      data: { connectionId: connection._id },
    });

    res.json({ success: true });
  } catch (err) {
    console.log(err);
    res.json({ success: false, message: err.message });
  }
};

export const acceptConnectionRequest = async (req, res) => {
  try {
    const user = await getOrCreateUser(req.auth)
    const { id } = req.body // id = user gửi request

    const connection = await Connection.findOne({
      from_user_id: id,
      to_user_id: user._id,
      status: "pending",
    })

    if (!connection) {
      return res.json({ success: false, message: "Connection not found" })
    }

    // ✅ add each other to connections
    await User.findByIdAndUpdate(user._id, {
      $addToSet: { connections: id },
    })

    await User.findByIdAndUpdate(id, {
      $addToSet: { connections: user._id },
    })

    connection.status = "accepted"
    await connection.save()

    res.json({ success: true })
  } catch (err) {
    console.log(err)
    res.json({ success: false, message: err.message })
  }
}


/* =====================================================
   PROFILE
===================================================== */
export const getUserProfiles = async (req, res) => {
  try {
    const { profileId } = req.body;

    const profile = await User.findById(profileId);
    if (!profile) {
      return res.json({ success: false, message: "Profile not found" });
    }

    const posts = await Post.find({ user: profileId }).populate("user");

    res.json({ success: true, profile, posts });
  } catch (err) {
    console.log(err);
    res.json({ success: false, message: err.message });
  }
};
export const getUserConnections = async (req, res) => {
  try {
    const user = await getOrCreateUser(req.auth);

    const populatedUser = await User.findById(user._id)
      .populate("connections followers following");

    const pendingConnections = await Connection.find({
      to_user_id: user._id,
      status: "pending",
    }).populate("from_user_id");

    res.json({
      success: true,
      connections: populatedUser.connections,
      followers: populatedUser.followers,
      following: populatedUser.following,
      pendingConnections: pendingConnections.map(c => c.from_user_id),
    });
  } catch (err) {
    console.log(err);
    res.json({ success: false, message: err.message });
  }
};