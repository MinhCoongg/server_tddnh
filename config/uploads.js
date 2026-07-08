import fileUpload from 'express-fileupload';
import path from 'path';

const __dirname = import.meta.dirname;

export const upload = fileUpload({
    limits: {
        fileSize: process.env.MAX_FILE_SIZE
            ? parseInt(process.env.MAX_FILE_SIZE)
            : 2 * 1024 * 1024 
    },
    safeFileNames: true,
    preserveExtension: true,
    abortOnLimit: true,
});

export const uploadPath = process.env.FILE_UPLOAD_PATH || '/uploads';
export const fullUploadPath = path.join(__dirname, '..', uploadPath);