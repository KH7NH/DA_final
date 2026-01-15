// server/routes/ageRoutes.js
import express from "express";
import { protect } from "../middlewares/auth.js";
import { createSetupIntent, verifySetupIntent } from "../controllers/ageController.js";

const router = express.Router();

router.post("/setup-intent", protect, createSetupIntent);
router.post("/verify", protect, verifySetupIntent);

export default router;
