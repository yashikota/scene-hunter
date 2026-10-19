import { MotionGlobalConfig } from "motion/react";

// 画面のテストでは演出を飛ばし、終わった姿を出す（数字のカウントアップや順番に出す演出を待たない）
MotionGlobalConfig.skipAnimations = true;
