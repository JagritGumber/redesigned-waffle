// danbooruTagGroupScraper.ts
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import type { Element } from "domhandler"; // Import Element type for cheerio

// Import Drizzle DB and schemas
import db from "@/db"; // !! Adjust path to your Drizzle DB instance !!
// Import specific schema tables and types
import { categories, tags, categoryTag } from "@/schema"; // Adjust path to your schema directory, assuming index.ts exports them or list individually
import type { InsertCategory } from "@/schema";
import { eq, max, desc, sql, and } from "drizzle-orm"; // Drizzle operators for SQLite

// Import the normalization utility
import { normalizeTag } from "@/utils/tags"; // !! Adjust path !!

// --- Existing Scraper Constants ---
const TAG_GROUPS_URL = "https://danbooru.donmai.us/wiki_pages/tag_groups";
const DANBOORU_BASE_URL = "https://danbooru.donmai.us";
const DELAY_MS = 300;
const DONT_INCLUDE_HEADERS = ["see also", "more"]; // Headers to ignore for structure

// Interface to represent a node in the scraped hierarchy tree
// A node can be a category from main page headers, a section header from a detail page,
// or a link found on a page (which might become a category or a tag).
interface TagGroupNode {
  name: string; // The raw display name scraped from the wiki (used for category prefixing)
  normalizedName?: string; // The normalized name (only for potential tags/linked page names)
  detailPageUrl?: string; // The URL this node links to (if it's a link)
  children?: TagGroupNode[]; // Nested nodes (subcategories or tags under this node)
}

// --- Global State for Recursion ---
const visitedUrls = new Set<string>(); // Track visited pages to avoid infinite loops and redundant fetches

// --- Helper Functions ---

async function fetchHtml(url: string): Promise<string | null> {
  console.log(`Fetching ${url}`);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Error fetching ${url}: ${response.status} ${response.statusText}`);
      // Implement more robust error handling if needed (e.g., retry on 429)
      if (response.status === 429) {
        console.warn(`Rate limited on ${url}. Waiting longer.`);
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS * 5)); // Wait 5x longer
      }
      return null;
    }
    const html = await response.text();
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    return html;
  } catch (error) {
    console.error(`Failed to fetch ${url}:`, error);
    // Optionally wait even on error to avoid spamming
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    return null;
  }
}

/**
 * Extracts link information from a UL or TABLE element, specifically looking
 * for a.dtext-link.dtext-wiki-link elements.
 * Returns a flat array of objects containing the raw link text and the full URL.
 * @param $ Cheerio API instance.
 * @param $listElement The Cheerio object for the UL or TABLE.
 * @param pageUrl The URL of the page being scraped (for logging).
 * @returns Array of { name: string, detailPageUrl: string }
 */
function extractLinksFromListElement(
  $: cheerio.CheerioAPI,
  $listElement: cheerio.Cheerio<Element>,
  pageUrl: string,
): { name: string; detailPageUrl: string }[] {
  const links: { name: string; detailPageUrl: string }[] = [];
  const listTagName = $listElement[0]?.tagName?.toLowerCase();
  if (!listTagName) {
    console.warn(`[${pageUrl}] Attempted to extract links from invalid element.`);
    return [];
  }

  const linkSelector = "a.dtext-link.dtext-wiki-link[href]";
  let $targetLinks: cheerio.Cheerio<Element>;

  if (listTagName === "table") {
    const $rows = $listElement.find("tr");
    let tagColumnIndex = -1;
    $rows
      .first()
      .find("th, td")
      .each((index, cellEl) => {
        if ($(cellEl).text().trim().toLowerCase() === "tag") {
          tagColumnIndex = index;
          return false; // Break loop
        }
      });

    if (tagColumnIndex === -1) {
      console.debug(`[${pageUrl}] Table found but no 'Tag' header column. Cannot extract tags.`);
      return [];
    }
    $targetLinks = $rows.slice(1).find(`td:nth-child(${tagColumnIndex + 1}) ${linkSelector}`);
  } else {
    // For ULs
    $targetLinks = $listElement.find(linkSelector);
  }

  $targetLinks.each((_, linkElement) => {
    const $link = $(linkElement);
    const linkText = $link.text().trim();
    const href = $link.attr("href");

    // Check for valid text and href, ignore single colon links
    if (href && linkText && linkText !== ":") {
      const fullUrl = href.startsWith("http") ? href : `${DANBOORU_BASE_URL}${href}`;
      const fullUrlBase = fullUrl.split("#")[0]; // Ignore hash for consistency

      // Only include links that point to wiki tag/tag_group pages
      if (fullUrlBase.includes("/wiki_pages")) {
        links.push({ name: linkText, detailPageUrl: fullUrlBase });
      } else {
        console.debug(
          `[${pageUrl}] Ignoring non-tag/tag_group link found in list: "${linkText}" -> ${fullUrlBase}`,
        );
      }
    } else {
      console.debug(
        `[${pageUrl}] Ignoring link with missing href/text/colon in list: "${linkText}" -> ${href}`,
      );
    }
  });

  console.debug(
    `[${pageUrl}] Extracted ${links.length} relevant links from ${listTagName.toUpperCase()}.`,
  );
  return links;
}

/**
 * Recursively fetches and parses a wiki page to build the tag hierarchy tree.
 * Handles the special structure of the main tag_groups page at the root,
 * and the general Hx + List structure and links found on other pages.
 * @param url The URL of the wiki page to fetch and parse recursively.
 * @returns A Promise resolving to an array of TagGroupNode representing the
 * immediate children nodes found *on* this page (sections, or direct links).
 */
async function processWikiPageRecursive(url: string): Promise<TagGroupNode[]> {
  const baseUrl = url.split("#")[0];

  if (visitedUrls.has(baseUrl)) {
    console.debug(`Already visited: ${baseUrl}. Returning empty.`);
    return []; // Stop recursion if already visited
  }

  console.log(`Visiting: ${url}`);
  visitedUrls.add(baseUrl); // Mark as visited BEFORE fetching to prevent cycles

  const html = await fetchHtml(url);
  if (!html) {
    console.warn(`Could not fetch page: ${url}. Skipping recursion branch.`);
    return []; // Return empty array on fetch failure
  }

  const $ = cheerio.load(html);
  const $content = $("#wiki-page-body");

  const nodesFoundOnPage: TagGroupNode[] = []; // Nodes representing the immediate children in the hierarchy found *on* this page

  const elements = $content.children().toArray() as Element[]; // Get all direct children
  const elementsCount = elements.length;
  let i = 0; // Use while loop

  let currentH3Text: string | null = null; // State for H3 context

  console.debug(`[${url}] Starting parsing page content with ${elementsCount} elements.`);

  while (i < elementsCount) {
    const element = elements[i];
    const $element = $(element);

    // Skip non-tag nodes
    if (element.type !== "tag") {
      console.debug(`[${url}] Skipping non-tag node at index ${i}: type=${element.type}`);
      i++;
      continue;
    }

    const tagName = element.tagName.toLowerCase();
    const elementText = $element.text().trim();

    // console.debug(`[${url}] Processing element at index ${i}: <${tagName}> (Text: "${elementText.substring(0, 50)}...")`);

    // Handle H3 for context (persists until next H3)
    if (tagName === "h3") {
      currentH3Text = elementText;
      console.debug(`[${url}] H3 found: "${currentH3Text}"`);
      i++;
      continue;
    }

    // --- Special Handling for the Main tag_groups Page ---
    // This page has a unique H5 -> H6 -> UL link structure at the top level.
    // We parse this explicitly first to build the initial hierarchy layers.
    if (url === TAG_GROUPS_URL) {
      // We need to re-implement the main page parsing logic here
      // to build the initial H5/H6 structure and find the Level 4 links.
      // Links found here will be processed recursively later.
      console.debug(`[${url}] Parsing as main tag_groups page.`);
      let currentH5: TagGroupNode | null = null;

      // Reset index 'i' to process from the start for main page structure
      // (although the outer loop continues, this inner block will consume elements)
      i = 0; // Process from the start if this is the main URL

      while (i < elementsCount) {
        const currentElement = elements[i];
        const $currentElement = $(currentElement);
        if (currentElement.type !== "tag") {
          i++;
          continue;
        }
        const currentTagName = currentElement.tagName.toLowerCase();
        const currentElementText = $currentElement.text().trim();

        if (
          currentTagName === "h5" &&
          !DONT_INCLUDE_HEADERS.includes(currentElementText.toLowerCase())
        ) {
          currentH5 = { name: currentElementText, children: [] };
          nodesFoundOnPage.push(currentH5); // Top-level nodes are H5s
          i++;
        } else if (
          currentTagName === "h6" &&
          !DONT_INCLUDE_HEADERS.includes(currentElementText.toLowerCase())
        ) {
          const $next1 = i + 1 < elementsCount ? $(elements[i + 1]) : null;
          const next1Element = elements[i + 1] as Element | undefined;

          const isValidH6Block =
            currentH5 !== null &&
            next1Element?.type === "tag" &&
            next1Element?.tagName?.toLowerCase() === "ul";

          if (isValidH6Block) {
            const h6Node: TagGroupNode = { name: currentElementText, children: [] };
            if (currentH5?.children) currentH5.children.push(h6Node);

            const $ulElement = $next1!;
            // Extract *links* from the UL under this H6
            const extractedLinks = extractLinksFromListElement($, $ulElement, url);

            // For each extracted link (Level 4): create a node, and RECURSE to get its children
            for (const linkInfo of extractedLinks) {
              // Note: Level 4 link names are stored raw initially, normalized later for tags/categories
              const linkNode: TagGroupNode = {
                name: linkInfo.name,
                detailPageUrl: linkInfo.detailPageUrl,
                children: [], // Will be populated recursively
              };
              // **RECURSIVE CALL for Level 4 links**
              linkNode.children = await processWikiPageRecursive(linkInfo.detailPageUrl); // Pass URL
              if (h6Node.children) h6Node.children.push(linkNode); // Add the populated linkNode to the H6's children
            }
            i += 2; // Skip H6 and UL
          } else {
            i++; // Skip H6
          }
        } else {
          // Any other element on the main page, just skip it
          i++;
        }
      } // End of main page parsing loop

      // After parsing main page structure, filter out empty H5/H6 nodes
      const filteredHierarchy = nodesFoundOnPage.filter(
        (h5) => h5.children && h5.children.length > 0,
      );
      for (const h5 of filteredHierarchy) {
        if (h5.children) {
          h5.children = h5.children.filter((h6) => h6.children && h6.children.length > 0);
        }
      }
      return filteredHierarchy.filter((h5) => h5.children && h5.children.length > 0);
    } // --- End Special Handling for Main Page ---

    // --- General Handling for Other Wiki Pages ---
    // Check if the current element is a list (UL or TABLE)
    if (tagName === "ul" || tagName === "table") {
      console.debug(`[${url}] Found potential list: <${tagName}>`);

      // Look at the immediately preceding tag element, skipping non-tag nodes
      let precedingTagElement: Element | undefined;
      let j = i - 1;
      while (j >= 0) {
        const prevElement = elements[j];
        if (prevElement.type === "tag") {
          precedingTagElement = prevElement;
          break; // Found the preceding tag element
        }
        j--; // Move backwards
      }

      const precedingTagName = precedingTagElement?.tagName?.toLowerCase();
      const $precedingTag = precedingTagElement ? $(precedingTagElement) : null;
      const precedingElementText = $precedingTag?.text().trim();

      // Determine if the preceding tag is a recognized section header (H4, H5, H6)
      const isPrecededBySectionHeader =
        precedingTagName &&
        ["h4", "h5", "h6"].includes(precedingTagName) &&
        !DONT_INCLUDE_HEADERS.includes(precedingElementText?.toLowerCase() || "");

      // Extract *links* from the current list element (UL or TABLE)
      const extractedLinks = extractLinksFromListElement($, $element, url);
      const childrenNodesForList: TagGroupNode[] = []; // Nodes created from links in this list

      // For each extracted link found in the list: create a node and RECURSE to get its children
      for (const linkInfo of extractedLinks) {
        // Note: Link names from detail pages are normalized *at this point*
        const normalizedName = normalizeTag(linkInfo.name);
        if (!normalizedName) {
          console.warn(
            `[${url}] Skipping link with empty normalized name (Original: "${linkInfo.name}") found in list.`,
          );
          continue;
        }

        const linkNode: TagGroupNode = {
          name: linkInfo.name, // Raw name for potential category prefixing
          normalizedName: normalizedName, // Normalized name for tag/lookup
          detailPageUrl: linkInfo.detailPageUrl,
          children: [], // Will be populated recursively
        };

        // **RECURSIVE CALL for links found on detail pages**
        // Only recurse if the link is to a *different* page to avoid infinite loops on self-referential links within a page.
        if (linkInfo.detailPageUrl !== url) {
          // Check against original page URL
          linkNode.children = await processWikiPageRecursive(linkInfo.detailPageUrl); // Pass URL
        } else {
          console.debug(
            `[${url}] Found self-referential link "${linkInfo.name}" -> ${linkInfo.detailPageUrl}. Not recursing on self.`,
          );
          // If it's a self-link, its children will remain []. It will be treated as a leaf tag.
        }

        childrenNodesForList.push(linkNode); // Add the populated linkNode to the list of children for this list/section
      }

      if (isPrecededBySectionHeader) {
        // Case 1: List is immediately preceded by a valid section header
        console.debug(
          `[${url}] List preceded by section header <${precedingTagName}>: "${precedingElementText}". Adding section node.`,
        );

        if (precedingElementText === undefined) {
          console.error(
            `[${url}] Logic error: precedingElementText is undefined for header ${precedingTagName}`,
          );
          // Still add the children nodes found in the list directly to the page nodes? Or skip?
          // Let's skip creating a section node if header text is null.
          i++; // Skip current list
          continue;
        }

        // Create a new node for this section
        const sectionNode: TagGroupNode = {
          name: precedingElementText, // Raw header text for section name
          children: childrenNodesForList, // Add the nodes created from the links in the list as children of this section node
        };
        // Only add the section node if it contains children (links were found and processed)
        if ((sectionNode.children?.length ?? 0) > 0) {
          nodesFoundOnPage.push(sectionNode); // Add the section node to the results for this page
          console.debug(
            `[${url}] Added section "${sectionNode.name}" with ${sectionNode.children?.length} items.`,
          );
        } else {
          console.warn(
            `[${url}] Section "${sectionNode.name}" found, but contained no valid links after processing. Skipping section.`,
          );
        }

        i++; // Move past the current list element (the section header was processed before)
      } else {
        // Case 2: List is NOT immediately preceded by a recognized section header
        console.debug(
          `[${url}] List NOT preceded by section header. Adding links as direct nodes on page.`,
        );

        // Add the nodes created from the links directly to the nodesFoundOnPage list
        nodesFoundOnPage.push(...childrenNodesForList); // Spread the array to add individual nodes
        console.debug(
          `[${url}] Added ${childrenNodesForList.length} nodes from top-level list <${tagName}>.`,
        );

        i++; // Move past the current list element
      }
    } else {
      // If the current element is NOT a UL or TABLE, just skip it.
      // This includes H4, H5, H6 (that don't precede a list), P, DETAILS, etc.
      // H3 was handled at the top.
      // If it's a header in DONT_INCLUDE_HEADERS, we also skip it implicitly by not acting.
      if (!DONT_INCLUDE_HEADERS.includes(tagName) && tagName !== "h3") {
        console.debug(
          `[${url}] Ignoring tag <${tagName}> (Text: "${elementText.substring(0, 50)}..."). Not a list element or a header we process.`,
        );
      }
      i++; // Move to the next element
    }
  } // End of while loop processing page elements

  console.debug(
    `[${url}] Finished parsing page content. Found ${nodesFoundOnPage.length} immediate child nodes for this page in the hierarchy.`,
  );

  // Return the nodes found *on this page*. These will become children of the node
  // that linked to this page in the level above.
  return nodesFoundOnPage;
}

// --- Database Insertion Logic ---

/**
 * Recursively saves a TagGroupNode and its children to the database.
 * Differentiates between categories (nodes with children) and tags (leaf nodes).
 * Handles insertion and linking via parentId and categoryTag table.
 * Uses onConflictDoNothing and selects existing IDs.
 * Prefixes category names for uniqueness. Normalizes tag names.
 * @param node The current TagGroupNode from the recursively scraped hierarchy.
 * @param parentCategoryId The ID of the parent category in the database (null for top-level nodes).
 * @param parentCategoryPrefixedName The *full, prefixed* name of the parent category (null for top-level nodes). Used for constructing child category names.
 * @param currentLevel The hierarchical level of the current node (1 for H5 from main page, increases recursively).
 */
async function processAndSaveNode(
  node: TagGroupNode,
  parentCategoryId: number | null,
  parentCategoryPrefixedName: string | null,
  currentLevel: number,
): Promise<void> {
  if (!node || !node.name) {
    console.warn("Skipping invalid node (null, undefined, or missing name):", node);
    return;
  }

  // Determine if this node is a leaf in the scraped hierarchy tree
  const isLeaf = !node.children || node.children.length === 0;

  if (isLeaf) {
    // --- Process as a Tag ---
    // Leaf nodes in the recursive structure are assumed to be tags.
    // Use the normalizedName property if available (from recursive links),
    // otherwise normalize the raw name (should only happen for errors or specific cases).
    const tagText = node.normalizedName || normalizeTag(node.name);

    if (!tagText) {
      console.warn(
        `Skipping tag node with empty normalized name (original: "${node.name}") under parent ID ${parentCategoryId}`,
      );
      return;
    }

    console.debug(
      `Processing Tag: "${tagText}" (Original: "${node.name}", Level ${currentLevel}, Parent ID: ${parentCategoryId ?? "null"})`,
    );

    let tagId: number | undefined;

    try {
      // Attempt to insert the tag using the normalized text
      const insertedTags = await db
        .insert(tags)
        .values({ tagText: tagText }) // Use normalized text here
        .onConflictDoNothing({ target: tags.tagText }) // Conflict on the normalized tagText
        .returning({ id: tags.id });

      if (insertedTags.length > 0) {
        // Tag was newly inserted
        tagId = insertedTags[0].id;
        console.debug(`Inserted new tag: "${tagText}" (ID: ${tagId})`);
      } else {
        // Tag already exists (based on normalized text), select its ID
        const existingTag = await db
          .select({ id: tags.id })
          .from(tags)
          .where(eq(tags.tagText, tagText)) // Use normalized text here for lookup
          .limit(1);
        tagId = existingTag[0]?.id;
        console.debug(`Tag already exists: "${tagText}" (ID: ${tagId})`);
      }
    } catch (error) {
      console.error(`Failed to insert or retrieve tag "${tagText}":`, error);
      // Decide if you want to stop or continue. Continuing might lead to missing relationships.
      return; // Stop processing this tag node on error
    }

    // If tagId was successfully obtained (either new or existing) AND there's a parent category
    if (tagId !== undefined && parentCategoryId !== null) {
      // --- Create the Category-Tag Relationship ---
      try {
        // Attempt to insert the relationship
        const insertedCategoryTag = await db
          .insert(categoryTag)
          .values({ categoryId: parentCategoryId, tagId: tagId })
          .onConflictDoNothing({ target: [categoryTag.categoryId, categoryTag.tagId] })
          .returning(); // returning any column to check if it was inserted

        if (insertedCategoryTag.length > 0) {
          console.debug(`Linked tag ID ${tagId} to category ID ${parentCategoryId}.`);
        } else {
          console.debug(
            `Link between tag ID ${tagId} and category ID ${parentCategoryId} already exists.`,
          );
        }
      } catch (error) {
        console.error(`Failed to link tag ID ${tagId} to category ID ${parentCategoryId}:`, error);
        // Error linking shouldn't stop the whole process usually, just log.
      }
    } else if (tagId === undefined) {
      console.warn(`Could not get tag ID for "${tagText}", skipping category-tag link.`);
    } else if (parentCategoryId === null) {
      // This is a tag without a parentCategoryId - could happen if a link to a tag is found
      // directly on a page that becomes a top-level category itself (e.g., the main page H5 might be a tag_group name)
      console.debug(`Tag "${tagText}" has no parent category ID to link (top level tag?).`);
    }
  } else {
    // --- Process as a Category ---
    // Nodes with children are categories.
    // Category name is built from the parent's prefixed name and the current node's *raw* name.
    const originalCategoryName = node.name.trim();
    const categoryName = parentCategoryPrefixedName
      ? `${parentCategoryPrefixedName} / ${originalCategoryName}`
      : originalCategoryName; // Top-level categories (H5) don't get a prefix

    if (!categoryName) {
      console.warn(
        `Skipping category node with empty name (original node name: "${node.name}") under parent ID ${parentCategoryId}`,
      );
      return;
    }

    console.debug(
      `Processing Category: "${categoryName}" (Original Node Name: "${node.name}", Level ${currentLevel}, Parent ID: ${parentCategoryId ?? "null"})`,
    );

    let categoryId: number | undefined;

    try {
      // Prepare category insert data
      const categoryData: InsertCategory = {
        name: categoryName, // Use the prefixed name for storage
        parentId: parentCategoryId,
        level: currentLevel,
        isGroup: true, // Categories represent groups/sections
        // description, selectionRule, promptTemplatePart default/null
      };

      // Attempt to insert the category
      // Conflict target is the unique prefixed name
      const insertedCategories = await db
        .insert(categories)
        .values(categoryData)
        .onConflictDoNothing({ target: [categories.name] }) // Conflict only on the unique prefixed name
        .returning({ id: categories.id });

      if (insertedCategories.length > 0) {
        // Category was newly inserted
        categoryId = insertedCategories[0].id;
        console.debug(`Inserted new category: "${categoryName}" (ID: ${categoryId})`);
      } else {
        // Category already exists, select its ID using name (prefixed)
        const existingCategory = await db
          .select({ id: categories.id })
          .from(categories)
          // Select using only the unique prefixed name
          .where(eq(categories.name, categoryName))
          .limit(1);

        categoryId = existingCategory[0]?.id;
        console.debug(`Category already exists: "${categoryName}" (ID: ${categoryId})`);

        if (categoryId === undefined) {
          console.error(
            `Logic Error: Attempted to find existing category "${categoryName}" by unique name, but select returned no ID.`,
          );
          // This indicates a potential issue with conflict handling or select logic
          // We cannot process children without a valid parent category ID
          return;
        }
      }
    } catch (error) {
      console.error(
        `Failed to insert or retrieve category "${categoryName}" under parent ID ${parentCategoryId}:`,
        error,
      );
      // Decide if you want to stop or continue. Continuing might lead to children being orphaned.
      // Let's stop processing this branch on error.
      return;
    }

    // If categoryId was obtained, process its children
    if (categoryId !== undefined && node.children) {
      console.debug(`Processing children for category "${categoryName}" (ID: ${categoryId})...`);
      for (const childNode of node.children) {
        // Recurse, pass the new category ID, its prefixed name, and increment level
        await processAndSaveNode(childNode, categoryId, categoryName, currentLevel + 1);
      }
    } else if (categoryId === undefined) {
      console.warn(`Category ID not obtained for "${categoryName}", skipping children processing.`);
    } else {
      console.debug(`Category "${categoryName}" has no children to process.`);
    }
  }
}

/**
 * Initiates the database saving process by traversing the root nodes
 * of the full recursively scraped hierarchy.
 * @param hierarchy The array of top-level TagGroupNodes from the recursive scraper.
 */
async function saveHierarchyToDatabase(hierarchy: TagGroupNode[]): Promise<void> {
  console.log("Starting database insertion of recursive tag hierarchy...");
  // The root nodes (H5s from the main page parse) are Level 1 categories.
  // Start recursion with null parentId, null parentCategoryPrefixedName, and level 1
  for (const topNode of hierarchy) {
    await processAndSaveNode(topNode, null, null, 1);
  }
  console.log("Database insertion of tag hierarchy complete.");
}

// --- Main Execution Function ---
async function main() {
  console.log("Starting Danbooru Tag Group Scraper and Database Saver (Recursive)...");

  // Clear visited URLs from previous runs if any (though it's global, good practice)
  visitedUrls.clear();

  // Start the recursive scraping process from the main tag_groups page
  // This single call will build the entire nested hierarchy in memory.
  console.log(`Starting recursive scrape from root: ${TAG_GROUPS_URL}`);
  const fullHierarchy = await processWikiPageRecursive(TAG_GROUPS_URL);

  console.log(
    `Finished recursive scraping. Built hierarchy with ${fullHierarchy.length} top-level nodes.`,
  );
  console.log(`Visited a total of ${visitedUrls.size} unique wiki pages.`);

  // Save the resulting recursive hierarchy to the database
  await saveHierarchyToDatabase(fullHierarchy);

  console.log("Scraping and Database Saving complete.");
}

// Execute the main function
main().catch((err) => {
  console.error("An unexpected error occurred during scraping and database saving:", err);
  if (err instanceof Error) {
    console.error("Error name:", err.name);
    console.error("Error message:", err.message);
    // @ts-ignore
    if (err.code) console.error("Error code:", err.code);
  }
  process.exit(1);
});
