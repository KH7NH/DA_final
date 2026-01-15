import fs from "fs";
import imagekit from "../configs/imageKit.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { moderateImage } from "../utils/aiModeration.js";

/**
 * =========================
 * SSE STORE (multi-tab safe)
 * key: mongoUserId (string)
 * value: Set<res>
 * =========================
 */
const connections = new Map();

/**
 * Clerk auth can appear as:
 * - req.auth() -> { userId: "user_xxx" }
 * - req.auth.userId
 */
const getClerkId = (req) => {
  try {
    if (typeof req.auth === "function") {
      return req.auth()?.userId || null;
    }
    return req.auth?.userId || null;
  } catch {
    return null;
  }
};

const getMongoUserByClerk = async (clerkId) => {
  if (!clerkId) return null;
  return User.findOne({ clerkId }).select("_id clerkId").lean();
};

const addSseConnection = (mongoUserId, res) => {
  const key = String(mongoUserId);

  if (!connections.has(key)) connections.set(key, new Set());
  connections.get(key).add(res);

  res.on("close", () => {
    const set = connections.get(key);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) connections.delete(key);
  });
};

const broadcastToUser = (mongoUserId, payloadObj) => {
  const key = String(mongoUserId);
  const set = connections.get(key);
  if (!set || set.size === 0) return;

  const data = `data: ${JSON.stringify(payloadObj)}\n\n`;
  for (const res of set) {
    try {
      res.write(data);
    } catch {}
  }
};

const safeUnlink = (p) => {
  try {
    if (p) fs.unlinkSync(p);
  } catch {}
};

/**
 * Quy tắc chặn cho chat (Cách 1):
 * - Chặn nếu NSFW rất cao hoặc gore cao.
 * - Bạn chỉnh ngưỡng tại đây cho hợp app của bạn.
 */
const shouldBlockChatImage = (ai) => {
  const nsfw = Number(ai?.nsfw_sensitive_prob ?? ai?.nsfw_prob ?? 0);
  const gore = Number(ai?.gore_score ?? 0);

  // gợi ý ngưỡng (an toàn + ít chặn nhầm):
  // - NSFW >= 0.90 hoặc gore >= 0.75 => CHẶN
  return nsfw >= 0.9 || gore >= 0.75;
};

/* ================= SSE ================= */
export const sseController = async (req, res) => {
  const { userId } = req.params; // mongo ObjectId string

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  res.flushHeaders?.();

  addSseConnection(userId, res);

  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  const keepAlive = setInterval(() => {
    try {
      res.write(`event: ping\ndata: ${Date.now()}\n\n`);
    } catch {}
  }, 25000);

  res.on("close", () => clearInterval(keepAlive));
};

/* ================= SEND MESSAGE ================= */
export const sendMessage = async (req, res) => {
  let tempPath = null;

  try {
    const clerkId = getClerkId(req);
    if (!clerkId) {
      return res.status(401).json({ success: false, message: "Unauthenticated" });
    }

    const { to_user_id, text } = req.body;
    const image = req.file;

    if (!to_user_id) {
      if (image?.path) safeUnlink(image.path);
      return res.status(400).json({ success: false, message: "Missing to_user_id" });
    }

    if (!text && !image) {
      return res.status(400).json({ success: false, message: "Nothing to send" });
    }

    const fromUser = await User.findOne({ clerkId }).select("_id").lean();
    if (!fromUser) {
      if (image?.path) safeUnlink(image.path);
      return res.status(404).json({ success: false, message: "User not found" });
    }

    let media_url = "";
    const message_type = image ? "image" : "text";

    // ===== If image: run moderation FIRST, then upload =====
    if (image) {
      tempPath = image.path;

      // 1) AI moderation (block if bad)
      const ai = await moderateImage(image.path);

      if (shouldBlockChatImage(ai)) {
        safeUnlink(tempPath);
        return res.status(400).json({
          success: false,
          message: "The image you sent in the message has been flagged as sensitive/horrific and has been blocked. Please choose a different image.",
          // (tuỳ chọn) debug:
          // debug: { nsfw: ai?.nsfw_sensitive_prob ?? ai?.nsfw_prob, gore: ai?.gore_score }
        });
      }

      // 2) Upload to ImageKit
      const buffer = fs.readFileSync(image.path);

      const upload = await imagekit.upload({
        file: buffer,
        fileName: image.originalname,
        folder: "messages",
      });

      media_url = upload.url;

      // 3) cleanup temp
      safeUnlink(tempPath);
      tempPath = null;
    }

    const created = await Message.create({
      from_user_id: fromUser._id,
      to_user_id,
      text,
      message_type,
      media_url,
    });

    const populated = await Message.findById(created._id)
      .populate("from_user_id", "full_name username profile_picture")
      .populate("to_user_id", "full_name username profile_picture")
      .lean();

    // broadcast cho người nhận + người gửi (multi-tab)
    broadcastToUser(to_user_id, populated);
    broadcastToUser(fromUser._id, populated);

    return res.json({ success: true, message: populated });
  } catch (err) {
    console.log(err);
    // cleanup nếu lỗi giữa chừng
    if (tempPath) safeUnlink(tempPath);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= GET CHAT ================= */
export const getChatMessages = async (req, res) => {
  try {
    const clerkId = getClerkId(req);
    if (!clerkId) {
      return res.status(401).json({ success: false, message: "Unauthenticated" });
    }

    const me = await getMongoUserByClerk(clerkId);
    if (!me) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const to_user_id =
      req.body?.to_user_id ||
      req.body?.userId ||
      req.body?.toUserId ||
      req.body?.to_userId;

    if (!to_user_id) {
      return res.status(400).json({ success: false, message: "Missing to_user_id" });
    }

    const messages = await Message.find({
      $or: [
        { from_user_id: me._id, to_user_id },
        { from_user_id: to_user_id, to_user_id: me._id },
      ],
    })
      .populate("from_user_id", "full_name username profile_picture")
      .populate("to_user_id", "full_name username profile_picture")
      .sort({ createdAt: 1 })
      .lean();

    return res.json({ success: true, messages });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ================= RECENT MESSAGES ================= */
export const getRecentMessages = async (req, res) => {
  try {
    const clerkId = getClerkId(req);
    if (!clerkId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const me = await getMongoUserByClerk(clerkId);
    if (!me) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const all = await Message.find({
      $or: [{ from_user_id: me._id }, { to_user_id: me._id }],
    })
      .populate("from_user_id", "full_name username profile_picture")
      .populate("to_user_id", "full_name username profile_picture")
      .sort({ createdAt: -1 })
      .lean();

    const map = new Map();
    const meId = String(me._id);

    for (const m of all) {
      const fromId = String(m.from_user_id?._id || m.from_user_id);
      const toId = String(m.to_user_id?._id || m.to_user_id);

      const otherUser = fromId === meId ? m.to_user_id : m.from_user_id;
      if (!otherUser?._id) continue;

      const key = String(otherUser._id);

      if (!map.has(key)) {
        map.set(key, {
          ...m,
          from_user_id: otherUser,
        });
      }
    }

    return res.json({
      success: true,
      messages: Array.from(map.values()),
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
