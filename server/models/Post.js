import mongoose from "mongoose";

const postSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    content: { type: String, default: "" },

    // URL hiển thị (có thể đã blur nếu nhạy cảm)
    image_urls: {
      type: [String],
      default: [],
    },

    post_type: {
      type: String,
      enum: ["text", "image", "text_with_image"],
      required: true,
    },

    likes_count: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

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

// (Tuỳ chọn) tối ưu query feed
postSchema.index({ createdAt: -1 });

const Post = mongoose.model("Post", postSchema);
export default Post;
