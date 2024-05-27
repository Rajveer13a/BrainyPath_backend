import { Router } from "express";
import { approvedCourses, courseById, learning } from "../controllers/student.controller.js";
import { isLoggedIn } from "../middlewares/auth.middleware.js";

const router = Router();



router.get("/courses",approvedCourses);

// router.all("/*",isLoggedIn());

router.get("/courseDetail",courseById);

router.get("/mylearning", isLoggedIn(), learning);

export default router;