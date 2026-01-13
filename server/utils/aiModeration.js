// server/utils/aiModeration.js
import axios from "axios";
import fs from "fs";
import path from "path";
import FormData from "form-data";

export const moderateImage = async (filePath) => {
  const base = process.env.AI_SERVICE_URL || "http://127.0.0.1:8001";
  const url = `${base.replace(/\/$/, "")}/predict`;

  const form = new FormData();
  form.append("file", fs.createReadStream(filePath), {
    filename: path.basename(filePath),
  });

  try {
    const { data } = await axios.post(url, form, {
      headers: { ...form.getHeaders() },
      timeout: 30000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    // FastAPI trả: { success: true, result: {...} }
    if (!data?.success) {
      console.log("[AI_MODERATION_ERROR]", data);
      return {
        is_sensitive: false,
        nsfw_sensitive_prob: null,
        gore_score: null,
        error: true,
      };
    }

    // return result (đúng kiểu bạn đang dùng)
    return data.result;
  } catch (err) {
    console.log("[AI_MODERATION_ERROR]", err?.response?.data || err.message);
    return {
      is_sensitive: false,
      nsfw_sensitive_prob: null,
      gore_score: null,
      error: true,
    };
  }
};
