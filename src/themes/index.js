// The optional themes (24 Nov 2026; production and /preview/). Each entry builds its theme on demand, so a build without
// themes (production) drops this folder entirely. Order = the order in the chooser.
import drawing from "./drawing.js";
import contour from "./contour.js";
import lightwell from "./lightwell.js";
import indigo from "./indigo.js";
import lathe from "./lathe.js";
import brick from "./brick.js";
import lantern from "./lantern.js";

export const THEMES = [drawing, contour, lightwell, indigo, lathe, brick, lantern];
