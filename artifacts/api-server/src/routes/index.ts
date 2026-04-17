import { Router, type IRouter } from "express";
import healthRouter from "./health";
import monafassaChatRouter from "./monafassa-chat";
import monafassaAdminRouter from "./monafassa-admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(monafassaChatRouter);
router.use(monafassaAdminRouter);

export default router;
