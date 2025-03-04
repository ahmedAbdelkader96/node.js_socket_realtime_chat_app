// const express = require("express");
// const router = express.Router();
// const Message = require("../models/message");
// const multer = require("multer");
// const sharp = require("sharp");
// const ffmpeg = require("fluent-ffmpeg");
// const s3 = require("../configs/aws");
// const mongoose = require("mongoose");
// const path = require("path");
// const fs = require("fs");

// let limit;

// // Configure multer for file uploads
// const storage = multer.memoryStorage();
// const upload = multer({ storage: storage });

// router.get("/", async (req, res) => {
//   try {
//     const messages = await Message.find().sort({ createdAt: -1 });
//     res.json(messages);
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// });

// // router.post('/upload', upload.single('video'), (req, res) => {
// //   const fileBuffer = req.file.buffer; // Get the file buffer from the request
// //   const s3Bucket = 'files16';
// //   const s3Key = `uploads/${Date.now()}_video.mp4`; // Unique key for the uploaded video

// //   const outputFilePath = path.join(__dirname, '../temp/output.mp4'); // Ensure the output file has a name

// //   ffmpeg(fileBuffer)
// //       .videoCodec('libx264')
// //       .audioCodec('aac')
// //       .outputOptions([
// //           '-b:v 800k', // Set video bitrate to 800 kbps
// //           '-b:a 128k', // Set audio bitrate to 128 kbps
// //           '-movflags +faststart' // Optimize for web
// //       ])
// //       .on('end', () => {
// //           console.log("Processing finished. Uploading to S3...");

// //           const fileStream = fs.createReadStream(outputFilePath);
// //           const uploadParams = {
// //               Bucket: s3Bucket,
// //               Key: s3Key,
// //               Body: fileStream,
// //               ContentType: 'video/mp4',
// //           };

// //           s3.upload(uploadParams, { partSize: 5 * 1024 * 1024, queueSize: 2 }, (err, data) => {
// //               if (err) {
// //                   console.error("Error uploading to S3:", err);
// //                   // Send response on error
// //                   return res.status(500).send('Error uploading to S3');
// //               } else {
// //                   console.log("Upload successful:", data.Location);

// //                   // Clean up output file asynchronously
// //                   fs.unlink(outputFilePath, (unlinkErr) => {
// //                       if (unlinkErr) {
// //                           console.error("Error deleting temp file:", unlinkErr);
// //                       } else {
// //                           console.log("Temporary file deleted.");
// //                       }
// //                   });

// //                   // Send response after uploading
// //                   return res.status(200).send({ message: 'Upload successful', url: data.Location });
// //               }
// //           });
// //       })
// //       .on('error', (err) => {
// //           console.error("Error processing video:", err);
// //           // Send response on FFmpeg error
// //           return res.status(500).send('Error processing video');
// //       })
// //       .save(outputFilePath);
// // });
// // const pLimit = require('p-limit');
// // const limit = pLimit(5); // Limit concurrent uploads

// router.post("/upload", upload.single("file"), async (req, res) => {
  // if (!limit) {
  //   const pLimit = (await import("p-limit")).default;
  //   limit = pLimit(5); // Limit concurrent uploads to 5
  // }

//   const { sender } = req.body;
//   const fileBuffer = req.file.buffer;
//   const fileType = req.file.mimetype;

//   const fileId = new mongoose.Types.ObjectId();
//   const fileExtension = path.extname(req.file.originalname);
//   const fileName = `${fileId}${fileExtension}`;

//   const tempDir = path.join(__dirname, "../temp");
//   if (!fs.existsSync(tempDir)) {
//     fs.mkdirSync(tempDir, { recursive: true });
//   }

//   const tempInputFilePath = path.join(tempDir, `input_${fileName}`);
//   const tempOutputFilePath = path.join(tempDir, `output_${fileName}`);
//   fs.writeFileSync(tempInputFilePath, fileBuffer);

//   try {
//     await new Promise((resolve, reject) => {
//       ffmpeg(tempInputFilePath)
//         .videoCodec("libx264")
//         .audioCodec("aac")
//         .outputOptions([
//           "-b:v 500k",
//           "-b:a 128k",
//           "-crf 8", "-preset veryfast",
//           "-vf scale=500:-2"
//         ])
//         .save(tempOutputFilePath)
//         .on("end", resolve)
//         .on("error", reject);
//     });

//     const uploadParams = {
//       Bucket: process.env.AWS_S3_BUCKET_NAME,
//       Key: `uploads/${fileName}`,
//       ContentType: fileType,
//       ContentDisposition: "inline",
//     };

//     const stats = await fs.promises.stat(tempOutputFilePath);
//     const multipartUpload = await s3.createMultipartUpload(uploadParams).promise();
//     const uploadId = multipartUpload.UploadId;
//     const chunkSize = 5 * 1024 * 1024; // 5 MB
//     const totalChunks = Math.ceil(stats.size / chunkSize);
//     const parts = [];

//     const uploadPromises = [];
//     for (let i = 0; i < totalChunks; i++) {
//       const start = i * chunkSize;
//       const end = Math.min(start + chunkSize, stats.size);
//       const chunk = fs.createReadStream(tempOutputFilePath, { start, end });

//       const partParams = {
//         Bucket: process.env.AWS_S3_BUCKET_NAME,
//         Key: `uploads/${fileName}`,
//         Body: chunk,
//         PartNumber: i + 1,
//         UploadId: uploadId,
//       };

//       console.log(`Uploading part ${i + 1}: start = ${start}, end = ${end}`);

//       uploadPromises.push(
//         limit(() => s3.uploadPart(partParams).promise()
//           .then(data => {
//             parts.push({ ETag: data.ETag, PartNumber: i + 1 });
//             console.log(`Part ${i + 1} uploaded successfully`);
//           })
//           .catch(err => {
//             console.error(`Error uploading part ${i + 1}:`, err);
//             throw err; // Propagate error
//           })
//         )
//       );
//     }

//     console.log("Waiting for all upload promises to resolve...");
//     await Promise.all(uploadPromises);

//     const completeParams = {
//       Bucket: process.env.AWS_S3_BUCKET_NAME,
//       Key: `uploads/${fileName}`,
//       MultipartUpload: { Parts: parts },
//       UploadId: uploadId,
//     };

//     const data = await s3.completeMultipartUpload(completeParams).promise();
//     console.log("Upload successful:", data.Location);

//     await fs.promises.unlink(tempInputFilePath);
//     await fs.promises.unlink(tempOutputFilePath);
//     console.log("Temporary files deleted.");

//     const messageContent = data.Location;
//     const message = new Message({
//       content: messageContent,
//       sender: sender,
//       type: fileType.startsWith("image/")
//         ? "image"
//         : fileType.startsWith("video/")
//           ? "video"
//           : "audio",
//       createdAt: new Date(),
//     });

//     const savedMessage = await message.save();
//     console.log("Message saved:", savedMessage);
//     res.status(201).json({ message: savedMessage, fileUrl: messageContent });

//   } catch (err) {
//     console.error("Error processing file:", err);
//     if (fs.existsSync(tempInputFilePath)) await fs.promises.unlink(tempInputFilePath);
//     if (fs.existsSync(tempOutputFilePath)) await fs.promises.unlink(tempOutputFilePath);
//     res.status(500).json({ error: "Failed to process file" });
//   }
// });

// // router.post("/upload", upload.single("file"), async (req, res) => {
// //   const { sender } = req.body;
// //   const fileBuffer = req.file.buffer;
// //   const fileSize = req.file.size;
// //   const fileType = req.file.mimetype;

// //   // Generate a new MongoDB ObjectId
// //   const fileId = new mongoose.Types.ObjectId();
// //   const fileExtension = path.extname(req.file.originalname);
// //   const fileName = `${fileId}${fileExtension}`;

// //   try {
// //     let optimizedBuffer = fileBuffer;

// //     // Apply different transformations based on file type and size
// //     if (fileType.startsWith('image/')) {
// //       if (fileSize < 5 * 1024 * 1024) { // Less than 5 MB
// //         optimizedBuffer = await sharp(fileBuffer)
// //           .resize({ width: 1000 }) // Resize the image to a width of 1000px
// //           .jpeg({ quality: 80 }) // Compress the image to 80% quality
// //           .toBuffer();
// //       } else if (fileSize < 10 * 1024 * 1024) { // Between 5 MB and 10 MB
// //         optimizedBuffer = await sharp(fileBuffer)
// //           .resize({ width: 800 }) // Resize the image to a width of 800px
// //           .jpeg({ quality: 70 }) // Compress the image to 70% quality
// //           .toBuffer();
// //       } else { // Greater than 10 MB
// //         optimizedBuffer = await sharp(fileBuffer)
// //           .resize({ width: 600 }) // Resize the image to a width of 600px
// //           .jpeg({ quality: 60 }) // Compress the image to 60% quality
// //           .toBuffer();
// //       }
// //     } else if (fileType.startsWith('video/')) {

// //       // Ensure the temp directory exists
// //       const tempDir = path.join(__dirname, '../temp');
// //       if (!fs.existsSync(tempDir)) {
// //         fs.mkdirSync(tempDir, { recursive: true });
// //       }

// //       // Save the video buffer to a temporary file
// //       const tempInputFilePath = path.join(tempDir, `input_${fileName}`);
// //       const tempOutputFilePath = path.join(tempDir, `output_${fileName}`);
// //       fs.writeFileSync(tempInputFilePath, fileBuffer);

// //       // Apply different ffmpeg transformations based on file size

// //       let ffmpegOptions = {};

// //       if (fileSize > 100 * 1024 * 1024) {
// //         // Greater than 100 MB
// //         ffmpegOptions = {
// //           // Adjust bitrate and resolution for large files
// //           videoCodec: "libx264",
// //           audioCodec: "aac",
// //           outputOptions: ["-crf 28", "-preset fast"],
// //         };
// //       } else if (fileSize > 50 * 1024 * 1024) {
// //         console.log("Between 50 MB and 100 MB");
// //         // Between 50 MB and 100 MB
// // ffmpegOptions = {
// //   videoCodec: "libx264",
// //   audioCodec: "aac",
// //   outputOptions: [
// //     '-b:v 500k', // Set video bitrate to 800 kbps
// //     '-b:a 128k', // Set audio bitrate to 128 kbps
// //     '-movflags +faststart' // Optimize for web
// // ],
// // };
// //       } else {
// //         ffmpegOptions = {
// //           videoCodec: "libx264",
// //           audioCodec: "aac",
// //           outputOptions: ["-crf 24", "-preset medium" ],
// //         };
// //       }

// //         // ffmpeg(tempInputFilePath)
// //         //   .outputOptions('-vf', 'scale=640:-2') // Resize the video to 640px width, height divisible by 2
// //         //   .outputOptions('-b:v', '500k') // Set video bitrate to 500 kbps
// //         //   .save(tempOutputFilePath)
// //         //   .on('start', (commandLine) => {
// //         //     console.log('Spawned Ffmpeg with command: ' + commandLine);
// //         //   })
// //         //   .on('stderr', (stderrLine) => {
// //         //     console.log('Stderr output: ' + stderrLine);
// //         //   })
// //         //   .on('end', resolve)
// //         //   .on('error', reject);

// // ffmpeg(tempInputFilePath)
// // .videoCodec(ffmpegOptions.videoCodec)
// // .audioCodec(ffmpegOptions.audioCodec)
// // .outputOptions(ffmpegOptions.outputOptions)
// // .save(tempOutputFilePath)
// // .on('end', () => {
// //     // Upload to S3
// //     const fileStream = fs.createReadStream(tempOutputFilePath);
// //     const uploadParams = {
// //         Bucket: process.env.AWS_S3_BUCKET_NAME,
// //         Key: 'uploads/video.mp4',
// //         Body: fileStream,
// //         ContentType: 'video/mp4',
// //     };

// //     s3.upload(uploadParams, async (err, data) => {
// //         if (err) {
// //             console.error("Error uploading to S3:", err);
// //         } else {

// //           fs.unlinkSync(tempInputFilePath);
// //           fs.unlinkSync(tempOutputFilePath);

// //           const messageContent = data.Location;
// //           const message = new Message({
// //             content: messageContent,
// //             sender: sender,
// //             type: fileType.startsWith('image/') ? 'image' : fileType.startsWith('video/') ? 'video' : 'audio',
// //             createdAt: new Date(),
// //           });

// //           const savedMessage = await message.save();
// //           console.log("Message saved:", savedMessage);
// //           res.status(201).json({ message: savedMessage, fileUrl: messageContent });

// //             console.log("Upload successful:", data.Location);
// //         }
// //     });
// // })
// // .on('error', (err) => {
// //     console.error("Error processing video:", err);
// // });

// //       // if (fileSize < 60 * 1024 * 1024) { // Less than 50 MB
// //       //   await new Promise((resolve, reject) => {
// //       //     ffmpeg(tempInputFilePath)
// //       //       .outputOptions('-vf', 'scale=400:-6') // Resize the video to 1280px width, height divisible by 2
// //       //       .outputOptions('-b:v', '1000k') // Set video bitrate to 1 Mbps
// //       //       .save(tempOutputFilePath)
// //       //       .on('start', (commandLine) => {
// //       //         console.log('Spawned Ffmpeg with command: ' + commandLine);
// //       //       })
// //       //       .on('stderr', (stderrLine) => {
// //       //         console.log('Stderr output: ' + stderrLine);
// //       //       })
// //       //       .on('end', resolve)
// //       //       .on('error', reject);
// //       //   });
// //       // } else if (fileSize < 100 * 1024 * 1024) { // Between 50 MB and 100 MB
// //       //   await new Promise((resolve, reject) => {
// //       //     ffmpeg(tempInputFilePath)
// //       //       .outputOptions('-vf', 'scale=960:-2') // Resize the video to 960px width, height divisible by 2
// //       //       .outputOptions('-b:v', '800k') // Set video bitrate to 800 kbps
// //       //       .save(tempOutputFilePath)
// //       //       .on('start', (commandLine) => {
// //       //         console.log('Spawned Ffmpeg with command: ' + commandLine);
// //       //       })
// //       //       .on('stderr', (stderrLine) => {
// //       //         console.log('Stderr output: ' + stderrLine);
// //       //       })
// //       //       .on('end', resolve)
// //       //       .on('error', reject);
// //       //   });
// //       // } else { // Greater than 100 MB
// //       //   await new Promise((resolve, reject) => {
// //       //     ffmpeg(tempInputFilePath)
// //       //       .outputOptions('-vf', 'scale=640:-2') // Resize the video to 640px width, height divisible by 2
// //       //       .outputOptions('-b:v', '500k') // Set video bitrate to 500 kbps
// //       //       .save(tempOutputFilePath)
// //       //       .on('start', (commandLine) => {
// //       //         console.log('Spawned Ffmpeg with command: ' + commandLine);
// //       //       })
// //       //       .on('stderr', (stderrLine) => {
// //       //         console.log('Stderr output: ' + stderrLine);
// //       //       })
// //       //       .on('end', resolve)
// //       //       .on('error', reject);
// //       //   });
// //       // }

// //       // Read the optimized video file back into a buffer
// //       // optimizedBuffer = fs.readFileSync(tempOutputFilePath);

// //       // // Delete the temporary files
// //       // fs.unlinkSync(tempInputFilePath);
// //       // fs.unlinkSync(tempOutputFilePath);
// //     }

// //     // Upload the optimized file to S3
// //     // const params = {
// //     //   Bucket: process.env.AWS_S3_BUCKET_NAME,
// //     //   Key: `uploads/${fileName}`,
// //     //   Body: optimizedBuffer,
// //     //   ContentType: fileType,
// //     //   ContentDisposition: 'inline',
// //     // };

// //     // s3.upload(params , { partSize: 10 * 1024 * 1024, queueSize: 2 }, async (err, data) => {
// //     //   if (err) {
// //     //     console.error("Error uploading to S3:", err);
// //     //     return res.status(500).json({ error: "Failed to upload to S3" });
// //     //   }

// //     //   // Create a message with the S3 file link
// //     //   const messageContent = data.Location;
// //     //   const message = new Message({
// //     //     content: messageContent,
// //     //     sender: sender,
// //     //     type: fileType.startsWith('image/') ? 'image' : fileType.startsWith('video/') ? 'video' : 'audio',
// //     //     createdAt: new Date(),
// //     //   });

// //     //   const savedMessage = await message.save();
// //     //   console.log("Message saved:", savedMessage);
// //     //   res.status(201).json({ message: savedMessage, fileUrl: messageContent });
// //     // })
// //   } catch (err) {
// //     console.error("Error processing file:", err);
// //     res.status(500).json({ error: "Failed to process file" });
// //   }
// // });

// router.get("/files/:id", async (req, res) => {
//   const fileId = req.params.id;

//   try {
//     const message = await Message.findById(fileId);
//     if (!message) {
//       return res.status(404).json({ message: "File not found" });
//     }

//     res.redirect(message.content); // Redirect to the S3 file URL
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// });

// router.patch("/:id/seen", async (req, res) => {
//   try {
//     const message = await Message.findById(req.params.id);
//     if (message) {
//       message.seen = true;
//       await message.save();
//       res.json(message);
//     } else {
//       res.status(404).json({ message: "Message not found" });
//     }
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// });

// module.exports = router;
const express = require("express");
const router = express.Router();
const Message = require("../models/message");
const multer = require("multer");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const { S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } = require("@aws-sdk/client-s3");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const mime = require("mime-types");

 

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
let limit;


router.get("/", async (req, res) => {
  try {
    const messages = await Message.find().sort({ createdAt: -1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

class S3MultipartUploader {
  constructor(region = 'us-east-1', options = {}) {
    const { accessKeyId, secretAccessKey, useTransferAcceleration } = options;

    const clientConfig = {
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey
      },
      region: region,
      useAccelerateEndpoint: useTransferAcceleration,
    };

    this.s3Client = new S3Client(clientConfig);
  }

  async retry(fn, args, retryCount = 0) {
    try {
      return await fn(...args);
    } catch (error) {
      if (retryCount < 3) {
        console.log(`Attempt ${retryCount + 1} failed. Retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount))); // Exponential backoff
        return this.retry(fn, args, retryCount + 1);
      }
      throw error;
    }
  }

  async uploadFile(buffer, bucketName, key) {
    try {
      const fileSize = buffer.length;
      const fileName = path.basename(key);

      // Multipart upload configuration
      const minPartSize = 5 * 1024 * 1024; // 5 MB minimum
      const maxPartSize = 50 * 1024 * 1024; // 50 MB maximum

      // Calculate optimal part size
      let partSize = Math.max(minPartSize, Math.ceil(fileSize / 10000));
      partSize = Math.min(partSize, maxPartSize);

      const numberOfParts = Math.ceil(fileSize / partSize);

      // Prepare upload parameters
      const uploadParams = {
        Bucket: bucketName,
        Key: fileName,
        ContentType: mime.lookup(fileName),
      };

      // Initiate multipart upload with retry
      const multipartUpload = await this.retry(
        this.s3Client.send.bind(this.s3Client),
        [new CreateMultipartUploadCommand(uploadParams)]
      );

      console.log(`Multipart upload initiated for ${fileName}`);


      if (!limit) {
        const pLimit = (await import("p-limit")).default;
        limit = pLimit(5); // Limit concurrent uploads to 5
      }



      // Upload parts
      const uploadPromises = [];
      const uploadedParts = [];

      for (let partNumber = 1; partNumber <= numberOfParts; partNumber++) {
        const start = (partNumber - 1) * partSize;
        const end = Math.min(start + partSize, fileSize);

        const partParams = {
          Bucket: bucketName,
          Key: fileName,
          PartNumber: partNumber,
          UploadId: multipartUpload.UploadId,
          Body: buffer.slice(start, end),
        };

        console.log(`Uploading part ${partNumber}: start = ${start}, end = ${end}`);

        uploadPromises.push(
          limit(() =>
            this.retry(
              this.s3Client.send.bind(this.s3Client),
              [new UploadPartCommand(partParams)]
            )
            .then(uploadPartResult => {
              uploadedParts.push({
                ETag: uploadPartResult.ETag,
                PartNumber: partNumber
              });
              console.log(`Part ${partNumber} uploaded successfully`);
            })
            .catch(err => {
              console.error(`Error uploading part ${partNumber}:`, err);
              throw err; // Propagate error
            })
          )
        );
      }

      // Wait for all parts to upload
      await Promise.all(uploadPromises);

      // Sort parts to ensure correct order
      uploadedParts.sort((a, b) => a.PartNumber - b.PartNumber);

      // Complete multipart upload with retry
      const completeMultipartUploadResult = await this.retry(
        this.s3Client.send.bind(this.s3Client),
        [new CompleteMultipartUploadCommand({
          Bucket: bucketName,
          Key: fileName,
          UploadId: multipartUpload.UploadId,
          MultipartUpload: { Parts: uploadedParts }
        })]
      );

      console.log('File uploaded successfully:', completeMultipartUploadResult.Location);
      return completeMultipartUploadResult;

    } catch (error) {
      console.error('Error during multipart upload:', error);
      throw error;
    }
  }
}

router.post('/upload', upload.single('file'), async (req, res) => {




  const file = req.file;

  const options = { 
    accessKeyId: process.env.AWS_ACCESS_KEY_ID, 
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, 
    useTransferAcceleration: true 
  };

  // Create uploader with transfer acceleration
  const uploader = new S3MultipartUploader('us-east-1', options);
  try {
    const data = await uploader.uploadFile(
      file.buffer, // File buffer
      process.env.AWS_S3_BUCKET_NAME, // S3 Bucket Name
      `uploads/${file.originalname}` // S3 Key
    );

    console.log("Upload successful:", data.Location);
    res.status(200).json({ message: 'Upload successful', url: data.Location });
  } catch (err) {
    console.error("Error uploading file:", err);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

router.get("/files/:id", async (req, res) => {
  const fileId = req.params.id;

  try {
    const message = await Message.findById(fileId);
    if (!message) {
      return res.status(404).json({ message: "File not found" });
    }

    res.redirect(message.content); // Redirect to the S3 file URL
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/:id/seen", async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (message) {
      message.seen = true;
      await message.save();
      res.json(message);
    } else {
      res.status(404).json({ message: "Message not found" });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;