import { PostService } from "./src/services/postService";
import path from "path";
import fs from "fs/promises";

// Load environment variables from .env file if it exists

async function testLogin() {
  const postService = new PostService();

  const daUsername = Bun.env.DEVIANTART_USERNAME;
  const daPassword = Bun.env.DEVIANTART_PASSWORD;
  const patreonUsername = Bun.env.PATREON_EMAIL;
  const patreonPassword = Bun.env.PATREON_PASSWORD;

  if (!daUsername || !daPassword) {
    console.warn("DeviantArt credentials not set. Skipping DeviantArt login test.");
  } else {
    console.log("\n--- Testing DeviantArt Login ---");
    try {
      // First attempt: should log in if not already
      await postService["loginDeviantArt"](daUsername, daPassword);
      console.log("DeviantArt login test 1 successful.");

      // Second attempt: should use existing cookies
      await postService["loginDeviantArt"](daUsername, daPassword);
      console.log("DeviantArt login test 2 successful (should use existing session).");
    } catch (error) {
      console.error("DeviantArt login test failed:", error);
    }
  }

  if (!patreonUsername || !patreonPassword) {
    console.warn("Patreon credentials not set. Skipping Patreon login test.");
  } else {
    console.log("\n--- Testing Patreon Login ---");
    try {
      // First attempt: should log in if not already
      await postService["loginPatreon"](patreonUsername, patreonPassword);
      console.log("Patreon login test 1 successful.");

      // Second attempt: should use existing cookies
      await postService["loginPatreon"](patreonUsername, patreonPassword);
      console.log("Patreon login test 2 successful (should use existing session).");
    } catch (error) {
      console.error("Patreon login test failed:", error);
    }
  }

  // Clean up the driver
  await postService["driver"].quit();

  // Clean up temp_downloads directory if it exists and is empty
  const downloadDir = path.join(process.cwd(), "temp_downloads");
  try {
    const files = await fs.readdir(downloadDir);
    if (files.length === 0) {
      await fs.rmdir(downloadDir);
      console.log(`Cleaned up empty directory: ${downloadDir}`);
    } else {
      console.log(`Directory ${downloadDir} is not empty, skipping cleanup.`);
    }
  } catch (err: any) {
    if (err.code === "ENOENT") {
      console.log(`Directory ${downloadDir} does not exist, no cleanup needed.`);
    } else {
      console.error(`Error cleaning up directory ${downloadDir}:`, err);
    }
  }
}

testLogin().catch(console.error);
