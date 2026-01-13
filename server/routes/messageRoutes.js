import express from "express";
import {
  getChatMessages,
  sendMessage,
  sseController,
  getRecentMessages, // ✅ thêm
} from "../controllers/messageController.js";
import { upload } from "../configs/multer.js";
import { protect } from "../middlewares/auth.js";

const router = express.Router();

router.get("/sse/:userId", sseController);
router.post("/send", protect, upload.single("image"), sendMessage);
router.post("/get", protect, getChatMessages);

// ✅ thêm route này
router.get("/recent", protect, getRecentMessages);

export default router;
