// src/lib/capacitor.ts
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Media } from "@capacitor/media";
import { isPlatform } from "@capacitor/core"; // Optional: check platform if needed

export async function downloadAndSaveToGallery(
  imageUrl: string,
  filename: string
): Promise<void> {
  if (!imageUrl) {
    throw new Error("No image URL provided.");
  }

  try {
    console.log("Requesting Media permissions...");
    const mediaPermissions = await Media.requestPermissions();
    console.log("Media permissions status:", mediaPermissions.photos);

    if (mediaPermissions.photos !== "granted") {
      throw new Error(
        "Media library permissions are required to save the image."
      );
    }

    console.log(`Attempting to download ${imageUrl} to cache...`);

    // 1. Download the file to the cache directory
    // Using a temporary unique filename
    const tempFilename = `temp_download_${Date.now()}_${Math.random().toString(36).substring(7)}.${filename.split(".").pop() || "jpg"}`;
    const downloadResult = await Filesystem.downloadFile({
      url: imageUrl,
      path: tempFilename,
      directory: Directory.Cache,
    });

    if (!downloadResult.path) {
      throw new Error("Failed to download image to cache.");
    }

    console.log(`Download successful to cache path: ${downloadResult.path}`);

    // 2. Get the URI of the downloaded file
    const uriResult = await Filesystem.getUri({
      path: tempFilename,
      directory: Directory.Cache,
    });
    const fileUri = uriResult.uri;
    console.log(`Downloaded file URI: ${fileUri}`);

    // 3. Save the file to the media library
    // The Media plugin's savePhoto function is intended for saving photos *taken with the camera*
    // or files stored in specific locations/formats compatible with the native photo library API.
    // Saving arbitrary files like this downloaded one using Media.savePhoto can be unreliable
    // cross-platform.
    // A more robust approach might involve:
    // A) A dedicated Capacitor community plugin for saving arbitrary files to gallery.
    // B) Using the Share plugin to let the user save it.
    // C) Implementing native code to copy the file to the correct media directory and trigger scanner.

    // Let's try Media.savePhoto first as it's the most direct core plugin method,
    // but be aware it might not work reliably on all platforms/versions for arbitrary files.
    // It primarily expects URI schemes like 'file://' or 'content://' on Android,
    // and 'file://' or 'ph://' on iOS. Filesystem.getUri provides 'file://'.

    console.log(
      `Attempting to save file from URI ${fileUri} to media library using Media.savePhoto...`
    );

    try {
      // Note: On Android, savePhoto might require WRITE_EXTERNAL_STORAGE permission
      // which Media.requestPermissions() might not cover depending on Android version.
      // Post-Android 10, scoped storage rules apply. Saving to DCIM/Pictures is preferred.
      // Media plugin might handle this internally.

      await Media.savePhoto({
        path: fileUri,
        album: "My App Images", // Specify an album name
      });
      console.log("Media.savePhoto successful");
    } catch (saveError) {
      console.warn(
        "Media.savePhoto failed, attempting alternative save method if applicable...",
        saveError
      );
      // Handle potential failures with Media.savePhoto, maybe try copying
      // to a known public directory if on Android pre-Android 10,
      // or guide user to use Share functionality.
      // For simplicity in this example, if savePhoto fails, we'll just log and throw.
      // A real app might have more fallback logic.

      throw new Error("Failed to save image to media library after download.");
    }

    console.log(`Successfully saved image to gallery from ${imageUrl}`);

    // Optional: Clean up the temporary file after saving
    try {
      await Filesystem.deleteFile({
        path: tempFilename,
        directory: Directory.Cache,
      });
      console.log(`Cleaned up temporary cache file: ${tempFilename}`);
    } catch (deleteError) {
      console.warn("Failed to delete temporary file:", deleteError);
    }
  } catch (error: any) {
    console.error("Download/Save Error:", error);
    // Re-throw error so component can handle it (e.g., show an alert)
    throw error;
  }
}
