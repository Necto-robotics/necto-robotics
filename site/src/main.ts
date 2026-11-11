import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/home.css";
import { detectTier } from "./perf/tier";
import { initNav } from "./ui/nav";
import { initChapterIndex } from "./ui/chapter-index";
import { initFeed } from "./ui/feed";
import { initDrawers, getLogDrawer } from "./ui/drawer";
import { initReveal } from "./ui/reveal";

/** Boot: the page is complete HTML before this runs. If the device can run
 * the 3D stage it loads lazily as its own chunk; otherwise every chapter
 * shows its still and nothing else changes. Drawers, reveals and the replay
 * log work on both paths. */
initNav();
initDrawers();
getLogDrawer();
initReveal();
void initFeed();
const report = detectTier();
document.documentElement.dataset.tier = report.tier;
const toStatic = (why: unknown) => {
  if (why) console.warn("[necto] static journey:", why);
  document.documentElement.classList.add("static");
};

if (!report.webgl) {
  toStatic(report.reasons.join(", "));
  initChapterIndex(null);
} else {
  import("./journey/engine")
    .then(({ mountJourney }) => mountJourney(report))
    .catch(toStatic);
}
