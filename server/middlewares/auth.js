// server/middlewares/auth.js
export const protect = async (req, res, next) => {
  try {
    const { userId } = await req.auth();
    if (!userId) {
      return res.status(401).json({ success: false, message: "not authenticated" });
    }
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: error.message });
  }
};
