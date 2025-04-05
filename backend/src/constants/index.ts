export const MAX_WHATSAPP_UPLOAD_SIZE = 1024 * 1024 * 3; // 3MB

export const ZIP_FORMATS = ["application/x-zip-compressed", "application/zip"];
export const TXT_FORMATS = ["application/txt"];

export const ACCEPTED_WHATSAPP_FILE_TYPES = [...ZIP_FORMATS, ...TXT_FORMATS];
