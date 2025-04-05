import { TXT_FORMATS, ZIP_FORMATS } from "@/constants";
import path from "path";
import fs from "fs";
import AdmZip from "adm-zip";

/**
 * The given function extracts any zip file given to it
 * @param file the file that needs to be extracted
 * @param extractionFolder the folder in which all the extracted files go
 * @param key The key acts as a directory all the files will go inside it
 * @returns The extractionFolder/key in which all the extracted files are
 */
export async function parseZip(
  file: File,
  extractionFolder: string,
  key: string
) {
  if (!ZIP_FORMATS.includes(file.type)) {
    console.error("Given file is not a zip");
    return;
  }

  const fileBuffer = await file.arrayBuffer();
  const zipBuffer = Buffer.from(fileBuffer);

  const extractedDir = path.join(extractionFolder, key);
  await fs.promises.mkdir(extractedDir, { recursive: true });

  console.log("Extracting ZIP file...");

  const zip = new AdmZip(zipBuffer);
  zip.extractAllTo(extractedDir, true); // Extracts to the directory

  console.log("Extraction complete!");

  return extractedDir;
}

/**
 * The function parses any text and saves it in the system given to it
 * @param file The file that needs to be saved which should be a txt file
 * @param extractionFolder This is the folder where all the files go
 * @param key File will go in this folder and this will go inside the extractionFolder
 * @returns the path at which the file has been save
 */
export async function parseTxt(
  file: File,
  extractionFolder: string,
  key: string
) {
  if (!TXT_FORMATS.includes(file.type)) {
    console.error("Given file is not a txt");
    return;
  }

  const fileBuffer = await file.arrayBuffer();
  const fileContent = Buffer.from(fileBuffer).toString("utf-8"); // Convert buffer to string

  const savedDir = path.join(extractionFolder, key);
  await fs.promises.mkdir(savedDir, { recursive: true });

  const filePath = path.join(savedDir, file.name); // Save with the original file name

  console.log("Saving TXT file...");

  await fs.promises.writeFile(filePath, fileContent, "utf-8");

  console.log("TXT file saved successfully!");

  return filePath;
}
