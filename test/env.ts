// Before any module loads: Vietnam time (day math is local), the campus env the app is built with, and no polite gap between campus calls.
process.env.TZ = "Asia/Ho_Chi_Minh";
process.env.VITEST = "1"; // client.ts: GAP = 0
process.env.EXPO_PUBLIC_DLU_API_KEY = "key";
