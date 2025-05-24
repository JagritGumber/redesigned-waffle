import { formatInTimeZone } from "date-fns-tz";
import { getDay } from "date-fns";

const checkTimeAndRunTask = (func: () => void) => {
  const now = new Date();
  const timeZone = "Asia/Kolkata"; // IST timezone identifier

  const istTime = formatInTimeZone(now, timeZone, "HH:mm");
  const istHour = Number.parseInt(istTime.split(":")[0], 10);

  console.log(
    `[${new Date().toISOString()}] Cron triggered. Current time in IST: ${istTime} and day: [${getDay(
      now,
    )}].`,
  );

  if (istHour === 8) {
    const randomMinutes = Math.floor(Math.random() * 60);
    const randomSeconds = Math.floor(Math.random() * 60);
    const randomDelayMilliseconds = randomMinutes * 60 * 1000 + randomSeconds * 1000;

    console.log(
      `[${new Date().toISOString()}] It's Monday and the 8 AM hour in IST. Scheduling task with a random delay of ${randomDelayMilliseconds} ms.`,
    );

    setTimeout(() => {
      console.log(`[${new Date().toISOString()}] Random delay finished. Executing task now.`);
      func();
      process.exit();
    }, randomDelayMilliseconds);
    console.log(`[${new Date().toISOString()}] Waiting for setTimeout to finish...`);
  } else {
    console.log(
      `[${new Date().toISOString()}] Not Monday or not the 8 AM hour in IST. Executing task immediately.`,
    );
    func();
    process.exit();
  }
};
