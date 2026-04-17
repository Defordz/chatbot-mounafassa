import { Router, type IRouter } from "express";
import healthRouter from "./health";
import monafassaChatRouter from "./monafassa-chat";
import monafassaAdminRouter from "./monafassa-admin";
import conseilChatRouter from "./conseil-chat";
import conseilAdminRouter from "./conseil-admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(monafassaChatRouter);
router.use(monafassaAdminRouter);
router.use(conseilChatRouter);
router.use(conseilAdminRouter);

export default router;
