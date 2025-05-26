import { DeskThing } from '@deskthing/server';
import { existsSync, mkdirSync, writeFile, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream';
import { promisify } from 'node:util';

const pipelineAsync = promisify(pipeline);

export const saveImage = async (imageData: string, fileName: string): Promise<string | undefined> => {
    // Check if it's a URL
    if (imageData.startsWith('http://') || imageData.startsWith('https://') || imageData.startsWith('file://')) {
        DeskThing.sendLog('Processing image URL');
        return await downloadImage(imageData, fileName);
    }
    // Handle base64 data
    else if (imageData.startsWith('data:image')) {
        DeskThing.sendLog('Processing base64 image data');
        return await saveBase64Image(imageData, fileName);
    } 
    // Handle binary data
    else {
        DeskThing.sendLog('Processing binary image data');
        return await saveBinaryImage(imageData, fileName);
    }
}

const downloadImage = async (url: string, fileName: string): Promise<string | undefined> => {
    try {
        // Create the images directory if it doesn't exist
        const imagesDir = join(__dirname, '../images');
        if (!existsSync(imagesDir)) {
            DeskThing.sendLog('Creating images directory');
            mkdirSync(imagesDir, { recursive: true });
        }

        // Handle file:// URLs (local files)
        if (url.startsWith('file://')) {
            return await handleLocalFile(url, fileName, imagesDir);
        }

        // Download from HTTP/HTTPS
        const response = await fetch(url);
        if (!response.ok) {
            DeskThing.sendError(`Failed to fetch image: ${response.status} ${response.statusText}`);
            return;
        }

        // Always save as PNG for compatibility
        const fileExtension = 'png';
        
        const filePath = join(imagesDir, `${fileName}.${fileExtension}`);
        
        // Get the response as a stream and save it
        if (response.body) {
            const fileStream = createWriteStream(filePath);
            await pipelineAsync(response.body as any, fileStream);
            
            DeskThing.sendLog(`Successfully downloaded image: ${fileName}.${fileExtension}`);
            return `/resource/image/audio/${fileName}.${fileExtension}`;
        } else {
            DeskThing.sendError('No response body received');
            return;
        }
        
    } catch (error) {
        DeskThing.sendError(`Failed to download image: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return;
    }
}

const handleLocalFile = async (fileUrl: string, fileName: string, imagesDir: string): Promise<string | undefined> => {
    try {
        // Convert file:// URL to local path
        const localPath = fileUrl.replace('file://', '');
        
        // Check if local file exists
        if (!existsSync(localPath)) {
            DeskThing.sendError(`Local file does not exist: ${localPath}`);
            return;
        }

        // Always save as PNG for compatibility
        const originalExtension = 'png';
        const targetPath = join(imagesDir, `${fileName}.${originalExtension}`);
        
        // Read the local file and copy it
        const fs = await import('node:fs/promises');
        await fs.copyFile(localPath, targetPath);
        
        DeskThing.sendLog(`Successfully copied local file: ${fileName}.png`);
        return `/resource/image/audio/${fileName}.png`;
        
    } catch (error) {
        DeskThing.sendError(`Failed to handle local file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return;
    }
}

const getFileExtension = (url: string, contentType: string | null): string => {
    // First try to get extension from Content-Type header
    if (contentType) {
        const typeMap: { [key: string]: string } = {
            'image/jpeg': 'jpg',
            'image/jpg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'image/svg+xml': 'svg',
            'image/bmp': 'bmp',
            'image/tiff': 'tiff'
        };
        
        if (typeMap[contentType.toLowerCase()]) {
            return typeMap[contentType.toLowerCase()];
        }
    }
    
    // Fallback: try to extract extension from URL
    const urlExtension = url.split('.').pop()?.split('?')[0]?.toLowerCase();
    if (urlExtension && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff'].includes(urlExtension)) {
        return urlExtension === 'jpeg' ? 'jpg' : urlExtension;
    }
    
    // Default fallback
    return 'jpg';
}

const saveBase64Image = async (base64Image: string, fileName: string): Promise<string | undefined> => {
    // Extract the image format from the data URL
    const matches = base64Image.match(/^data:image\/([a-zA-Z+]+);base64,/);
    if (!matches) {
        DeskThing.sendError('Invalid base64 image format');
        return;
    }
    
    // Always save as PNG for compatibility
    const imageFormat = 'png';
    const base64Data = base64Image.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
    
    // Create the images directory if it doesn't exist
    const imagesDir = join(__dirname, '../images');
    if (!existsSync(imagesDir)) {
        DeskThing.sendLog('Creating images directory');
        mkdirSync(imagesDir, { recursive: true });
    }
    
    // Generate file path with correct extension
    const filePath = join(imagesDir, `${fileName}.${imageFormat}`);
    
    // Write the file and return a promise
    return new Promise((resolve, reject) => {
        writeFile(filePath, base64Data, 'base64', (err) => {
            if (err) {
                DeskThing.sendError(`Failed to save base64 image: ${err.message}`);
                reject(err);
                return;
            }
            DeskThing.sendLog(`Successfully saved base64 image: ${fileName}.png`);
            resolve(`/resource/image/audio/${fileName}.png`);
        });
    });
}

const saveBinaryImage = async (binaryData: string, fileName: string): Promise<string | undefined> => {
    // Create the images directory if it doesn't exist
    const imagesDir = join(__dirname, '../images');
    if (!existsSync(imagesDir)) {
        DeskThing.sendLog('Creating images directory');
        mkdirSync(imagesDir, { recursive: true });
    }
    
    // Generate file path (assuming png as default)
    const filePath = join(imagesDir, `${fileName}.png`);
    
    // Write the file and return a promise
    return new Promise((resolve, reject) => {
        writeFile(filePath, binaryData, 'binary', (err) => {
            if (err) {
                DeskThing.sendError(`Failed to save binary image: ${err.message}`);
                reject(err);
                return;
            }
            DeskThing.sendLog(`Successfully saved binary image: ${fileName}.png`);
            resolve(`/resource/image/audio/${fileName}.png`);
        });
    });
}

export async function deleteImages() {
    const imagesDir = join(__dirname, '../images')
    if (existsSync(imagesDir)) {
        const files = readdirSync(imagesDir)
        for (const file of files) {
            unlinkSync(join(imagesDir, file))
        }
    }
}