import { Patterns, cron } from "@elysiajs/cron";
import Characters from "@/services/brain/characters";

const rootCron = cron({
  name: "rootBeat",
  pattern: Patterns.everySecond(),
  async run() {
    try {
      const characterForToday = await Characters.getTodaysCharacter();
    } catch (e) {
      console.error("Runtime Error in daily run", { e });
    }
  },
});

export default rootCron;
