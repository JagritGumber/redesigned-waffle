// danbooruTagGroupScraper.ts
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import fs from "fs/promises";
import path from "path";

const TAG_GROUPS_URL = "https://danbooru.donmai.us/wiki_pages/tag_groups";
const OUTPUT_FILE = "../danbooru_tag_groups.json";

// Interface to represent a parsed tag group
interface ParsedTagGroup {
  name: string;
  level: number; // H2 could be level 1, H3 level 2, etc.
  tags: string[]; // List of tags under this group
  subgroups?: ParsedTagGroup[]; // Nested groups if the structure is hierarchical
}

interface IndexTagGroup {
  name: string;
  level: number; // H5=1, H6=2, etc.
  detailPageUrl?: string; // URL path to the page with actual tags (if it's a link)
  subgroups?: IndexTagGroup[]; // Nested groups
  // No 'tags' list directly here, as tags are on linked pages
}

async function fetchTagGroupsPage(): Promise<string | null> {
  console.log(`Fetching ${TAG_GROUPS_URL}`);
  try {
    const response = await fetch(TAG_GROUPS_URL);
    if (!response.ok) {
      console.error(`Error fetching page: ${response.status} ${response.statusText}`);
      return null;
    }
    return await response.text(); // Get the HTML content as text
  } catch (error) {
    console.error(`Failed to fetch page:`, error);
    return null;
  }
}

async function parseTagGroupsIndexHtml(html: string): Promise<IndexTagGroup[]> {
  const $ = cheerio.load(html);

  const topLevelGroups: IndexTagGroup[] = [];
  const stack: IndexTagGroup[] = []; // Stack to maintain hierarchy based on heading level

  // Find the main content area - inspect the page source for a likely container div/article
  // Based on the example structure, elements seem to be children under a container
  const contentContainer = $("section#content > div#wiki-page-body"); // Common ID, adjust if needed

  if (!contentContainer.length) {
    console.error("Could not find the main content container. Check selector.");
    // Fallback to body if needed, but #wiki-page-content is typical
    // contentContainer = $('body');
  }

  // Iterate through the children of the main content container
  contentContainer.children().each((i, elem) => {
    const node = $(elem);
    const tagName = node.get(0)?.name?.toLowerCase();
    console.log(tagName);

    // Process headings (h5, h6, h?). Adjust based on actual page structure.
    if (tagName && tagName.match(/^h[5-6]$/)) {
      // Assuming h5 and h6 define structure levels
      const groupName = node.text().trim();
      const level = parseInt(tagName.substring(1), 10) - 4; // h5=1, h6=2

      const newGroup: IndexTagGroup = { name: groupName, level: level };

      // Manage the stack: Pop higher or equal level groups
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      if (stack.length > 0) {
        // Add the new group as a subgroup of the current top of the stack
        if (!stack[stack.length - 1].subgroups) {
          stack[stack.length - 1].subgroups = [];
        }
        stack[stack.length - 1].subgroups!.push(newGroup);
      } else {
        // This is a top-level group (level 1 in our parsed structure)
        topLevelGroups.push(newGroup);
      }
      // Push the new group onto the stack
      stack.push(newGroup);
    } else if (tagName === "ul") {
      // Find the list items within this UL that contain links to tag group pages
      // Assuming links to tag group pages have 'dtext-wiki-link' class and start with "Tag group:"
      node.find("li a.dtext-wiki-link").each((j, linkElem) => {
        const linkNode = $(linkElem);
        const linkText = linkNode.text().trim();
        const href = linkNode.attr("href");

        // Check if the link text indicates it's a link to another tag group page
        if (linkText.startsWith("Tag group:") && href) {
          const groupName = linkText.trim();
          // Find the parent group on the stack this UL conceptually belongs to
          if (stack.length > 0) {
            const currentGroup = stack[stack.length - 1];

            // Add this linked group as a subgroup, linking to its detail page
            // We create a *new* IndexTagGroup for the *linked* page
            const linkedGroup: IndexTagGroup = {
              name: groupName,
              level: currentGroup.level + 1, // Assume linked groups are one level deeper
              detailPageUrl: href, // Store the URL to scrape later
            };

            if (!currentGroup.subgroups) {
              currentGroup.subgroups = [];
            }
            currentGroup.subgroups.push(linkedGroup);
            // Note: We do NOT push linkedGroup onto the stack here, as the stack
            // represents the heading hierarchy, not the links. We process the linked
            // pages in a separate step.
          } else {
            console.warn(
              `Found a tag group link ("${linkText}") without a preceding heading/group on stack.`
            );
            // Handle links that might not be directly under a heading
          }
        }
        // Ignore list items/links that are just regular tags listed directly on THIS page
        // (Unless the page structure shows actual tags *also* listed directly,
        // in which case you need to adjust the selector and logic)
      });
    }
    // Ignore other tags like <p>, <div>, etc.
  });

  return topLevelGroups;
}

// --- Main Script Execution ---
async function runScrapingAndSave() {
  const html = await fetchTagGroupsPage();
  if (!html) {
    console.error("Failed to fetch HTML.");
    return;
  }

  console.log("Parsing HTML...");
  const parsedGroups = await parseTagGroupsIndexHtml(html); // parseTagGroupsHtml is not async, but good practice to await if it contained async ops
  console.log(`Parsing complete. Found ${parsedGroups.length} top-level tag groups.`);
  // console.log("Example parsed groups:", JSON.stringify(parsedGroups, null, 2).slice(0, 1000)); // Print example

  // Save the parsed structure to a file
  try {
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(parsedGroups, null, 2));
    console.log(`Parsed tag groups saved to ${OUTPUT_FILE}`);
  } catch (error) {
    console.error("Failed to save parsed groups to file:", error);
  }
}

runScrapingAndSave().catch(console.error);
