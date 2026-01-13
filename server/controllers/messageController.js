import fs from "fs";
import imagekit from "../configs/imageKit.js";
import Message from "../models/Message.js";
import User from "../models/User.js";

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

  // cleanup when client disconnects
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
    } catch {
      // ignore broken pipe, cleanup happens on close
    }
  }
};

/* ================= SSE ================= */
export const sseController = async (req, res) => {
  const { userId } = req.params; // mongo ObjectId string

  // SSE headers
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // giúp reverse proxy (nginx) không buffer
  res.setHeader("X-Accel-Buffering", "no");

  // flush headers nếu có
  res.flushHeaders?.();

  // register connection
  addSseConnection(userId, res);

  // send initial ping
  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  // keep-alive ping mỗi 25s để tránh bị proxy cắt
  const keepAlive = setInterval(() => {
    try {
      res.write(`event: ping\ndata: ${Date.now()}\n\n`);
    } catch {}
  }, 25000);

  res.on("close", () => clearInterval(keepAlive));
};

/* ================= SEND MESSAGE ================= */
export const sendMessage = async (req, res) => {
  try {
    const clerkId = getClerkId(req);
    if (!clerkId) {
      return res.status(401).json({ success: false, message: "Unauthenticated" });
    }

    const { to_user_id, text } = req.body;
    if (!to_user_id && !req.file) {
      return res.json({ success: false, message: "Nothing to send" });
    }

    const fromUser = await User.findOne({ clerkId }).select("_id").lean();
    if (!fromUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const image = req.file;

    let media_url = "";
    const message_type = image ? "image" : "text";

    if (image) {
      const buffer = fs.readFileSync(image.path);

      const upload = await imagekit.upload({
        file: buffer,
        fileName: image.originalname,
        // bạn có thể set folder cho gọn:
        folder: "messages",
      });

      media_url = upload.url;

      // cleanup temp upload file
      try {
        fs.unlinkSync(image.path);
      } catch {}
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

    // ✅ broadcast cho người nhận
    broadcastToUser(to_user_id, populated);

    // ✅ broadcast cho chính người gửi (nếu mở nhiều tab / nhiều thiết bị)
    broadcastToUser(fromUser._id, populated);

    return res.json({ success: true, message: populated });
  } catch (err) {
    console.log(err);
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
      return res.json({ success: false, message: "Missing to_user_id" });
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
        // chuẩn hóa: FE dùng from_user_id là "đối phương"
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
