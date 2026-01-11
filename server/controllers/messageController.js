import fs from "fs";
import imagekit from "../configs/imageKit.js";
import Message from "../models/Message.js";
import User from "../models/User.js";

// SSE connections
const connections = {};

/* ================= SSE ================= */
export const sseController = async (req, res) => {
  const { userId } = req.params; // ObjectId

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  connections[userId] = res;
  res.write("data: connected\n\n");

  req.on("close", () => {
    delete connections[userId];
  });
};

/* ================= SEND MESSAGE ================= */
export const sendMessage = async (req, res) => {
  try {
    const { userId: clerkId } = req.auth();
    const { to_user_id, text } = req.body;
    const image = req.file;

    const fromUser = await User.findOne({ clerkId });
    if (!fromUser) throw new Error("User not found");

    let media_url = "";
    let message_type = image ? "image" : "text";

    if (image) {
      const buffer = fs.readFileSync(image.path);
      const upload = await imagekit.upload({
        file: buffer,
        fileName: image.originalname,
      });
      media_url = upload.url;
    }

    const message = await Message.create({
      from_user_id: fromUser._id,
      to_user_id,
      text,
      message_type,
      media_url,
    });

    const populated = await Message.findById(message._id)
      .populate("from_user_id", "full_name profile_picture")
      .populate("to_user_id", "full_name profile_picture");

    if (connections[to_user_id]) {
      connections[to_user_id].write(
        `data: ${JSON.stringify(populated)}\n\n`
      );
    }

    res.json({ success: true, message: populated });
  } catch (err) {
    console.log(err);
    res.json({ success: false, message: err.message });
  }
};

/* ================= GET CHAT ================= */
export const getChatMessages = async (req, res) => {
  try {
    const { userId: clerkId } = req.auth();
    const { to_user_id } = req.body;

    const fromUser = await User.findOne({ clerkId });

    const messages = await Message.find({
      $or: [
        { from_user_id: fromUser._id, to_user_id },
        { from_user_id: to_user_id, to_user_id: fromUser._id },
      ],
    })
      .populate("from_user_id", "full_name profile_picture")
      .populate("to_user_id", "full_name profile_picture")
      .sort({ createdAt: 1 });

    await Message.updateMany(
      { from_user_id: to_user_id, to_user_id: fromUser._id },
      { seen: true }
    );

    res.json({ success: true, messages });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};
