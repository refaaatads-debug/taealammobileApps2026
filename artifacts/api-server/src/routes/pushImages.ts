import { Router, type IRouter } from "express";
import { readPreparedPushImage } from "../lib/pushImageDerivative";

const router: IRouter = Router();
// Generated public image derivatives only, never an arbitrary URL proxy or filesystem path.
router.get("/push-images/:filename", async (req, res) => {
  const bytes = await readPreparedPushImage(String(req.params.filename));
  if (!bytes) { res.status(404).end(); return; }
  res.setHeader("Content-Type","image/jpeg");
  res.setHeader("Content-Length",String(bytes.length));
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Cache-Control","public, max-age=3600, immutable");
  res.send(bytes);
});
export default router;
