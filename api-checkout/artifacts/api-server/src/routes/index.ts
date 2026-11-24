import { Router, type IRouter } from "express";
import pushImagesRouter from "./pushImages";
import healthRouter from "./health";
import authRouter from "./auth";
import profileRouter from "./profile";
import learningRouter from "./learning";
import pushRouter from "./push";
import directoryRouter from "./directory";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pushImagesRouter);
router.use(authRouter);
router.use(profileRouter);
router.use(learningRouter);
router.use(pushRouter);
router.use(directoryRouter);

export default router;
