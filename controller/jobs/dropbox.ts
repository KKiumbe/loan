import fs from "fs";
import fetch from "node-fetch"; // Required by Dropbox SDK
import { Dropbox } from "dropbox";
import dotenv from "dotenv";

dotenv.config();

const dbx = new Dropbox({
  clientId: process.env.DROPBOX_APP_KEY!,
  clientSecret: process.env.DROPBOX_APP_SECRET!,
  refreshToken: process.env.DROPBOX_REFRESH_TOKEN!,
  fetch, // required for Dropbox SDK
});

export async function uploadToDropbox(filePath: string): Promise<void> {
  const contents = fs.readFileSync(filePath);
  const fileName = filePath.split("/").pop();

  if (!fileName) {
    console.error("❌ Invalid file path:", filePath);
    return;
  }

  try {
    const response = await dbx.filesUpload({
      path: `/${fileName}`,
      contents,
      mode: { ".tag": "overwrite" },
    });

    console.log(`✅ Uploaded to Dropbox: ${response.result.name}`);
  } catch (error: any) {
    console.error("❌ Dropbox upload failed:", error?.error || error.message || error);
  }
}
