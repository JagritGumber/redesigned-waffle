import { z } from "zod"
import { ACCEPTED_WHATSAPP_FILE_TYPES, MAX_WHATSAPP_UPLOAD_SIZE } from "../constants";

const whatsappUploadSchema = z.object({
    file: z.instanceof(File).refine((file) => {
        return !file || file.size <= MAX_WHATSAPP_UPLOAD_SIZE;
    }, 'File size must be less than 3MB').refine((file) => {
        console.log(file.type)
        return ACCEPTED_WHATSAPP_FILE_TYPES.includes(file.type);
    }, `File must be a ZIP or a TXT`)
})

export default whatsappUploadSchema