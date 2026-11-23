// Parts of the day (views.html "a sitting's day"): a pick lands on the part's first hour; Zen then places the hour inside it.
export const PARTS = ["Sáng", "Trưa", "Chiều", "Tối"]; // Sáng 0-11, Trưa 11-13, Chiều 13-18, Tối 18-24
export const PART_HOUR = [8, 11, 14, 19];
export const partOf = (ts: number) => { const h = new Date(ts).getHours(); return h < 11 ? 0 : h < 13 ? 1 : h < 18 ? 2 : 3; };
