import { Builder, By, Key, until, WebDriver } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

export class PostService {
    private driver: WebDriver;
    private downloadDir: string;

    constructor() {
        // Setup Chrome options for headless execution
        const options = new chrome.Options();
        options.addArguments('--headless');
        options.addArguments('--no-sandbox');
        options.addArguments('--disable-dev-shm-usage');
        options.addArguments('--window-size=1920,1080'); // Consistent window size

        // Ensure ChromeDriver is accessible.
        // You might need to set the path to chromedriver executable if it's not in PATH.
        // Example: process.env.CHROMEDRIVER_PATH = '/usr/local/bin/chromedriver';
        // For Bun, you might need to configure this differently or ensure it's globally available.

        this.driver = new Builder()
            .forBrowser('chrome')
            .setChromeOptions(options)
            .build();
        
        this.downloadDir = path.join(process.cwd(), 'temp_downloads');
        // Ensure the download directory exists
        fs.mkdir(this.downloadDir, { recursive: true }).catch(console.error);
    }

    private async loginDeviantArt(username: string, password: string): Promise<void> {
        console.log("Attempting to log in to DeviantArt...");
        await this.driver.get("https://www.deviantart.com/users/login");
        await this.driver.wait(until.elementLocated(By.name("username")), 20000).sendKeys(username);
        await this.driver.findElement(By.name("password")).sendKeys(password);
        await this.driver.findElement(By.css("button[type='submit']")).click();
        await this.driver.wait(until.urlContains("deviantart.com/"), 20000); // Wait until redirected after login
        console.log("Logged in to DeviantArt.");
    }

    private async postDeviantArt(imagePath: string, title: string, description: string, tags: string[]): Promise<void> {
        console.log(`Attempting to post to DeviantArt: ${title}`);
        await this.driver.get("https://www.deviantart.com/submit/deviation");
        
        // Wait for the file input element to be present
        const fileInput = await this.driver.wait(until.elementLocated(By.css("input[type='file']")), 20000);
        await fileInput.sendKeys(imagePath); // Upload the image

        // Wait for upload to process and title/description fields to appear
        await this.driver.wait(until.elementLocated(By.css("input[placeholder='Give your deviation a title']")), 20000).sendKeys(title);
        await this.driver.findElement(By.css("textarea[placeholder='Tell us about your deviation']")).sendKeys(description);
        
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
        console.log("Attempting to log in to Patreon...");
        await this.driver.get("https://www.patreon.com/login");
        await this.driver.wait(until.elementLocated(By.id("email")), 20000).sendKeys(username);
        await this.driver.findElement(By.id("password")).sendKeys(password);
        await this.driver.findElement(By.css("button[type='submit']")).click();
        await this.driver.wait(until.urlContains("patreon.com/home"), 20000); // Wait until redirected after login
        console.log("Logged in to Patreon.");
    }

    private async postPatreon(imagePath: string, title: string, description: string): Promise<void> {
        console.log(`Attempting to post to Patreon: ${title}`);
        await this.driver.get("https://www.patreon.com/create/posts"); // Navigate to create post page
        
        // Wait for the "Image" post type button and click it
        await this.driver.wait(until.elementLocated(By.xpath("//button[contains(., 'Image')]")), 20000).click();

        // Wait for the file input to appear
        const fileInput = await this.driver.wait(until.elementLocated(By.css("input[type='file']")), 20000);
        await fileInput.sendKeys(imagePath); // Upload the image

        // Wait for the title and description fields
        await this.driver.wait(until.elementLocated(By.css("textarea[placeholder='Title']")), 20000).sendKeys(title);
        await this.driver.findElement(By.css("div[data-placeholder='Tell your patrons about this post...']")).sendKeys(description);

        // Click the "Publish" button
        await this.driver.findElement(By.xpath("//button[contains(., 'Publish')]")).click();
        console.log("Post submitted to Patreon.");
    }

    private async downloadImage(url: string): Promise<string | null> {
        try {
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            const contentType = response.headers['content-type'] || '';
            let ext = '.bin';
            if (contentType.includes('image/jpeg')) {
                ext = '.jpg';
            } else if (contentType.includes('image/png')) {
                ext = '.png';
            } else if (contentType.includes('image/gif')) {
                ext = '.gif';
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

    public async postImage(imageUrl: string, platform: 'deviantart' | 'patreon', title: string, description: string, tags: string[] = []): Promise<boolean> {
        let localImagePath: string | null = null;
        try {
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
                await this.postPatreon(localImagePath, title, description);
            } else {
                console.error(`Unsupported platform: ${platform}`);
                return false;
            }
            return true;
        } catch (e) {
            console.error(`Error during posting to ${platform}:`, e);
            return false;
        } finally {
            await this.driver.quit();
            if (localImagePath) {
                await fs.unlink(localImagePath).catch(err => console.error("Failed to delete temp image:", err));
            }
        }
    }
}
