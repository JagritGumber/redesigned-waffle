import { Builder, By, Key, until, WebDriver } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome";
import axios from "axios";
import fs from "fs/promises";
import path from "path";

export class PostService {
  private downloadDir: string;
  private cookiesPath: string;
  private driver: WebDriver | null = null; // Make driver nullable

  constructor() {
    this.downloadDir = path.join(process.cwd(), "temp_downloads");
    this.cookiesPath = path.join(process.cwd(), "cookies.json");
    // Ensure the download directory exists
    fs.mkdir(this.downloadDir, { recursive: true }).catch(console.error);
  }

  private async _createAndConfigureDriver(): Promise<WebDriver> {
    const options = new chrome.Options();
    // options.addArguments("--headless");
    options.addArguments("--no-sandbox");
    options.addArguments("--disable-dev-shm-usage");
    options.addArguments("--window-size=1920,1080"); // Consistent window size
    options.addArguments(
      "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0"
    );

    const driver = new Builder().forBrowser("chrome").setChromeOptions(options).build();

    // Overwrite navigator properties to appear more human
    await driver.executeScript(`
      Object.defineProperty(navigator, 'languages', {
        get: function() {
          return ['en-US', 'en'];
        },
      });

      Object.defineProperty(navigator, 'plugins', {
        get: function() {
          return [1, 2, 3, 4, 5];
        },
      });
    `);

    // Overwrite WebGL properties to appear more human
    await driver.executeScript(`
      const getParameter = WebGLRenderingContext.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        // UNMASKED_VENDOR_WEBGL
        if (parameter === 37445) {
          return 'Intel Open Source Technology Center';
        }
        // UNMASKED_RENDERER_WEBGL
        if (parameter === 37446) {
          return 'Mesa DRI Intel(R) Ivybridge Mobile ';
        }

        return getParameter(parameter);
      };
    `);

    // Overwrite HTMLImageElement properties for broken images
    await driver.executeScript(`
      ['height', 'width'].forEach(property => {
        const imageDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, property);
        Object.defineProperty(HTMLImageElement.prototype, property, {
          ...imageDescriptor,
          get: function() {
            if (this.complete && this.naturalHeight == 0) {
              return 20;
            }
            return imageDescriptor.get.apply(this);
          },
        });
      });
    `);

    // Overwrite HTMLDivElement properties for Retina/HiDPI hairline detection
    await driver.executeScript(`
      const elementDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
      Object.defineProperty(HTMLDivElement.prototype, 'offsetHeight', {
        ...elementDescriptor,
        get: function() {
          if (this.id === 'modernizr') {
              return 1;
          }
          return elementDescriptor.get.apply(this);
        },
      });
    `);
    return driver;
  }

  private async saveCookies(): Promise<void> {
    if (!this.driver) {
      console.error("Driver not initialized. Cannot save cookies.");
      return;
    }
    try {
      const cookies = await this.driver.manage().getCookies();
      await fs.writeFile(this.cookiesPath, JSON.stringify(cookies, null, 2));
      console.log("Cookies saved successfully.");
    } catch (error) {
      console.error("Failed to save cookies:", error);
    }
  }

  private async loadCookies(): Promise<void> {
    if (!this.driver) {
      console.error("Driver not initialized. Cannot load cookies.");
      return;
    }
    try {
      const cookieData = await fs.readFile(this.cookiesPath, "utf8");
      const cookies = JSON.parse(cookieData);
      for (const cookie of cookies) {
        console.log(`Attempting to load cookie: ${cookie.name}`);
        // Ensure the cookie has a valid expiry date, otherwise it might be a session cookie
        // Selenium expects expiry to be in seconds, not milliseconds
        const cookieToAdd: any = {
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain || undefined,
          path: cookie.path || "/",
          secure: cookie.secure || false,
          httpOnly: cookie.httpOnly || false,
          sameSite: cookie.sameSite || undefined, // Add sameSite if present
        };

        if (cookie.expiry && typeof cookie.expiry === "number") {
          cookieToAdd.expiry = Math.floor(cookie.expiry);
        }

        try {
          await this.driver.manage().addCookie(cookieToAdd);
          console.log(`Successfully loaded cookie: ${cookie.name}`);
        } catch (addCookieError) {
          console.error(`Failed to add cookie ${cookie.name}:`, addCookieError);
        }
      }
      console.log("All cookies processed.");
    } catch (error: any) {
      if (error.code === "ENOENT") {
        console.log("No cookies file found, starting fresh.");
      } else {
        console.error("Failed to load cookies:", error);
      }
    }
  }

  private async typeWithDelay(element: any, text: string): Promise<void> {
    if (!this.driver) {
      console.error("Driver not initialized. Cannot type with delay.");
      return;
    }
    for (const char of text) {
      await element.sendKeys(char);
      await this.driver.sleep(Math.random() * 200); // Small delay between key presses
    }
  }

  private async loginDeviantArt(username: string, password: string): Promise<void> {
    if (!this.driver) {
      console.error("Driver not initialized. Cannot login to DeviantArt.");
      return;
    }
    console.log("Checking DeviantArt login status...");
    await this.driver.get("https://www.deviantart.com/"); // Go to the main page to check cookies

    const cookies = await this.driver.manage().getCookies();
    const authCookie = cookies.find((c) => c.name === "auth");
    const authSecureCookie = cookies.find((c) => c.name === "auth_secure");

    const currentTime = Date.now() / 1000; // Current time in seconds since epoch

    if (
      authCookie &&
      authSecureCookie &&
      authCookie.expiry &&
      authSecureCookie.expiry &&
      (authCookie.expiry as number) > currentTime &&
      (authSecureCookie.expiry as number) > currentTime
    ) {
      console.log("Already logged in to DeviantArt with valid cookies.");
      return;
    }

    console.log("Attempting to log in to DeviantArt...");
    await this.driver.get("https://www.deviantart.com/users/login");
    // Note: If you use social login (e.g., Google, Facebook) for DeviantArt,
    // direct username/password login via these fields might not work.
    // In such cases, you might need to manually log in once, capture the 'auth' and 'auth_secure' cookies,
    // and then inject them into the Selenium session using driver.manage().addCookie().
    await this.driver.wait(until.elementLocated(By.name("username")), 20000).sendKeys(username);
    await this.driver.findElement(By.name("password")).sendKeys(password);
    await this.driver.findElement(By.css("button[type='submit']")).click();
    await this.driver.wait(until.urlContains("deviantart.com/"), 20000); // Wait until redirected after login
    console.log("Logged in to DeviantArt.");
  }

  private async postDeviantArt(
    imagePath: string,
    title: string,
    description: string,
    tags: string[]
  ): Promise<void> {
    if (!this.driver) {
      console.error("Driver not initialized. Cannot post to DeviantArt.");
      return;
    }
    console.log(`Attempting to post to DeviantArt: ${title}`);
    await this.driver.get("https://www.deviantart.com/submit/deviation");

    // Wait for the file input element to be present
    const fileInput = await this.driver.wait(
      until.elementLocated(By.css("input[type='file']")),
      20000
    );
    await fileInput.sendKeys(imagePath); // Upload the image

    // Wait for upload to process and title/description fields to appear
    await this.driver
      .wait(until.elementLocated(By.css("input[placeholder='Give your deviation a title']")), 20000)
      .sendKeys(title);
    await this.driver
      .findElement(By.css("textarea[placeholder='Tell us about your deviation']"))
      .sendKeys(description);

    // Add tags (this might be more complex depending on DA's UI)
    // For simplicity, let's assume a single tag input for now
    const tagInput = await this.driver.findElement(By.css("input[placeholder='Add tags']"));
    for (const tag of tags) {
      await tagInput.sendKeys(tag);
      await tagInput.sendKeys(Key.ENTER); // Simulate pressing Enter after each tag
    }

    // Click the "Publish" or "Submit" button
    // This CSS selector might need adjustment based on actual DA UI
    await this.driver.findElement(By.css("button[data-hook='submit_button']")).click();
    console.log("Post submitted to DeviantArt.");
  }

  private async loginPatreon(username: string, password: string): Promise<void> {
    if (!this.driver) {
      console.error("Driver not initialized. Cannot login to Patreon.");
      return;
    }
    console.log("Checking Patreon login status...");
    await this.driver.get("https://www.patreon.com"); // Navigate to Patreon login page first
    await this.loadCookies(); // Then load cookies

    // Original login logic (commented out as per user's request to wait)
    await this.driver.get("https://www.patreon.com/home"); // Go to a page that requires login

    const currentUrl = await this.driver.getCurrentUrl();
    if (currentUrl.includes("patreon.com/home")) {
      console.log("Already logged in to Patreon.");
      return;
    }

    console.log("Attempting to log in to Patreon...");
    await this.driver.get("https://www.patreon.com/login");
    // Enter email
    const emailField = await this.driver.wait(until.elementLocated(By.name("email")), 20000);
    await this.typeWithDelay(emailField, username);
    // Click the first submit button
    const firstSubmitButton = await this.driver.wait(
      until.elementLocated(By.css("button[type='submit']")),
      20000
    );
    await this.driver.wait(until.elementIsVisible(firstSubmitButton), 20000);
    await firstSubmitButton.click();

    // Wait for the password field to appear after the first submit
    const passwordField = await this.driver.wait(
      until.elementLocated(By.name("current-password")),
      20000
    );
    await this.driver.wait(until.elementIsVisible(passwordField), 20000);
    await this.typeWithDelay(passwordField, password);

    // Click the second submit button
    const secondSubmitButton = await this.driver.wait(
      until.elementLocated(By.css("button[type='submit']")),
      20000
    );
    await this.driver.wait(until.elementIsVisible(secondSubmitButton), 20000);
    await secondSubmitButton.click();

    await this.driver.wait(until.urlContains("patreon.com/home"), 20000); // Wait until redirected after login
    console.log("Logged in to Patreon.");
    await this.saveCookies(); // Save cookies after successful login
  }

  private async postPatreon(
    imagePath: string,
    title: string,
    description: string,
    tags: string[],
    tier?: string // Add tier parameter
  ): Promise<void> {
    if (!this.driver) {
      console.error("Driver not initialized. Cannot post to Patreon.");
      return;
    }
    console.log(`Attempting to post to Patreon: ${title}`);

    // 1. Navigate to the initial URL
    await this.driver.get("https://www.patreon.com/posts/new?postType=text_only");

    // 2. Wait for redirection to the edit URL
    await this.driver.wait(
      until.urlMatches(/https:\/\/www\.patreon\.com\/posts\/\d+\/edit/),
      30000
    );

    // 3. Click "Image" button
    const imageButton = await this.driver.wait(
      until.elementLocated(By.xpath("//button[div/div[text()='Image']]")),
      20000
    );
    await imageButton.click();

    // 4. Upload file
    const fileInput = await this.driver.wait(
      until.elementLocated(By.css("input[type='file']")),
      20000
    );
    await fileInput.sendKeys(imagePath);

    // 5. Fill title
    const titleField = await this.driver.wait(
      until.elementLocated(By.css("textarea[aria-label='Title']")),
      20000
    );
    await this.typeWithDelay(titleField, title);

    // 6. Fill description
    const descriptionField = await this.driver.wait(
      until.elementLocated(
        By.xpath("//div[contains(@class, 'remirror-editor-wrapper')]//div[@contenteditable='true']")
      ),
      20000
    );
    await this.typeWithDelay(descriptionField, description);

    // 7. Add tags
    const tagInput = await this.driver.wait(
      until.elementLocated(By.css("input[data-tag='tags-auto-complete']")),
      20000
    );
    for (const tag of tags) {
      await this.typeWithDelay(tagInput, tag);
      await tagInput.sendKeys(Key.ENTER);
      await this.driver.sleep(1000); // Small delay after each tag entry
    }

    // 8. Click "Next" button
    const nextButton = await this.driver.wait(
      until.elementLocated(By.css("button[data-tag='make-a-post-action-next_step']")),
      20000
    );
    await nextButton.click();

    // 9. Handle tier selection if a tier is provided
    if (tier) {
      console.log(`Attempting to select tier: ${tier}`);
      // Click the audience selector button
      const audienceSelectorButton = await this.driver.wait(
        until.elementLocated(By.css("button[aria-label='Who can view this post']")),
        20000
      );
      await audienceSelectorButton.click();

      // Click "Selected tiers" option
      const selectedTiersOption = await this.driver.wait(
        until.elementLocated(By.xpath("/html/body/div[2]/div/div/div/ul/li[5]/a/div")),
        20000
      );
      await selectedTiersOption.click();

      const orderedTiers = [
        { name: "tier 4", label: "Low", value: 4, xpathIndex: 2 },
        { name: "tier 3", label: "Moderate", value: 3, xpathIndex: 3 },
        { name: "tier 2", label: "High", value: 2, xpathIndex: 4 },
        { name: "tier 1", label: "Extreme", value: 1, xpathIndex: 5 },
      ];

      // Parse the numerical value of the selected tier (e.g., "Tier 2" becomes 2)
      const selectedTierValue = parseInt(tier.toLowerCase().replace('tier ', ''));

      if (isNaN(selectedTierValue) || selectedTierValue < 1 || selectedTierValue > 4) {
        console.warn(`Invalid tier "${tier}" provided. Skipping tier selection.`);
      } else {
        for (const t of orderedTiers) {
          // Use CSS selector to find the input checkbox by its ID starting with the tier label
          const tierCheckbox = await this.driver.wait(
            until.elementLocated(By.css(`input[id^='${t.label}']`)),
            20000
          );

          const isChecked = await tierCheckbox.isSelected();

          if (t.value <= selectedTierValue) {
            if (!isChecked) {
              await this.driver.executeScript("arguments[0].click();", tierCheckbox);
              console.log(`Selected tier: ${t.name} (${t.label})`);
            } else {
              console.log(`Tier "${t.name}" (${t.label}) already selected.`);
            }
          } else {
            if (isChecked) {
              await this.driver.executeScript("arguments[0].click();", tierCheckbox);
              console.log(`Deselected tier: ${t.name} (${t.label})`);
            } else {
              console.log(`Tier "${t.name}" (${t.label}) already deselected.`);
            }
          }
          await this.driver.sleep(500); // Small delay between clicks
        }
      }
    }

    // 10. Click "Publish" button
    const publishButton = await this.driver.wait(
      until.elementLocated(By.css("button[data-tag='make-a-post-action-publish']")),
      20000
    );
    await publishButton.click();

    console.log("Post submitted to Patreon.");
  }

  private async downloadImage(url: string): Promise<string | null> {
    try {
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0",
        },
      });
      const contentType = response.headers["content-type"] || "";
      let ext = ".bin";
      if (contentType.includes("image/jpeg")) {
        ext = ".jpg";
      } else if (contentType.includes("image/png")) {
        ext = ".png";
      } else if (contentType.includes("image/gif")) {
        ext = ".gif";
      }

      const filename = `temp_image_${Date.now()}${ext}`;
      const localPath = path.join(this.downloadDir, filename);
      await fs.writeFile(localPath, response.data);
      console.log(`Image downloaded to ${localPath}`);
      return localPath;
    } catch (error) {
      console.error(`Error downloading image from ${url}:`, error);
      return null;
    }
  }

  public async postImage(
    imageUrl: string,
    platform: "deviantart" | "patreon",
    title: string,
    description: string,
    tags: string[] = [],
    tier?: string // Add tier parameter
  ): Promise<boolean> {
    let localImagePath: string | null = null;
    try {
      this.driver = await this._createAndConfigureDriver(); // Create and configure driver for each post
      localImagePath = await this.downloadImage(imageUrl);
      if (!localImagePath) {
        console.error("Failed to download image.");
        return false;
      }

      if (platform === "deviantart") {
        const daUsername = Bun.env.DEVIANTART_USERNAME;
        const daPassword = Bun.env.DEVIANTART_PASSWORD;
        if (!daUsername || !daPassword) {
          console.error("DeviantArt credentials not set in environment variables.");
          return false;
        }
        await this.loginDeviantArt(daUsername, daPassword);
        await this.postDeviantArt(localImagePath, title, description, tags);
      } else if (platform === "patreon") {
        const patreonUsername = Bun.env.PATREON_USERNAME;
        const patreonPassword = Bun.env.PATREON_PASSWORD;
        if (!patreonUsername || !patreonPassword) {
          console.error("Patreon credentials not set in environment variables.");
          return false;
        }
        await this.loginPatreon(patreonUsername, patreonPassword);
        await this.postPatreon(localImagePath, title, description, tags, tier); // Pass tier here
      } else {
        console.error(`Unsupported platform: ${platform}`);
        return false;
      }
      return true;
    } catch (e) {
      console.error(`Error during posting to ${platform}:`, e);
      return false;
    } finally {
      if (this.driver) {
        await this.driver.quit();
        this.driver = null; // Clear the driver instance
      }
      if (localImagePath) {
        await fs
          .unlink(localImagePath)
          .catch((err) => console.error("Failed to delete temp image:", err));
      }
    }
  }
}
