import mongoose from "mongoose";

const storySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    content: { type: String, default: "" },

    // URL hiển thị (có thể blur nếu nhạy cảm)
    media_url: { type: String, default: "" },

    // ✅ Lưu ImageKit filePath để generate original URL khi reveal
    media_file_path: { type: String, default: "" },

    media_type: {
      type: String,
      enum: ["text", "image", "video"],
      default: "text",
    },

    views_count: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    background_color: { type: String, default: "#000000" },

    /* =======================
       AI MODERATION FIELDS
    ======================= */
    is_sensitive: { type: Boolean, default: false },

    moderation: [
      {
        file: { type: String },
        is_sensitive: { type: Boolean, default: false },
        nsfw_prob: { type: Number, default: null },
        gore_score: { type: Number, default: null },
      },
    ],
  },
  { timestamps: true, minimize: false }
);

const Story = mongoose.model("Story", storySchema);
export default Story;
