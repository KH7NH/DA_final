// server/models/Message.js
import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    from_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    to_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    text: { type: String, trim: true, default: "" },

    message_type: {
      type: String,
      enum: ["text", "image"],
      default: "text",
    },

    media_url: { type: String, default: "" },

    // ✅ optional but recommended (để debug & tinh chỉnh threshold)
    is_sensitive: { type: Boolean, default: false },
    moderation: {
      nsfw_prob: { type: Number, default: null },
      gore_score: { type: Number, default: null },
    },

    seen: { type: Boolean, default: false },
  },
  { timestamps: true, minimize: false }
);

export default mongoose.model("Message", messageSchema);
