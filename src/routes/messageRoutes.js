const express = require("express");
const router = express.Router();
const Message = require("../models/message");
const multer = require("multer");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const s3 = require("../configs/aws");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.get("/", async (req, res) => {
  try {
    const messages = await Message.find().sort({ createdAt: -1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/upload", upload.single("file"), async (req, res) => {
  const { sender, filePath } = req.body;
  const fileBuffer = req.file.buffer;
  const fileSize = req.file.size;
  const fileType = req.file.mimetype;

  // Generate a new MongoDB ObjectId
  const fileId = new mongoose.Types.ObjectId();
  const fileExtension = path.extname(req.file.originalname);
  const fileName = `${fileId}${fileExtension}`;

  try {
    let optimizedBuffer = fileBuffer;

    // Apply different transformations based on file type and size
    if (fileType.startsWith("image/")) {
      if (fileSize < 5 * 1024 * 1024) {
        // Less than 5 MB
        optimizedBuffer = await sharp(fileBuffer)
          .resize({ width: 1000 }) // Resize the image to a width of 1000px
          .jpeg({ quality: 80 }) // Compress the image to 80% quality
          .toBuffer();
      } else if (fileSize < 10 * 1024 * 1024) {
        // Between 5 MB and 10 MB
        optimizedBuffer = await sharp(fileBuffer)
          .resize({ width: 800 }) // Resize the image to a width of 800px
          .jpeg({ quality: 70 }) // Compress the image to 70% quality
          .toBuffer();
      } else {
        // Greater than 10 MB
        optimizedBuffer = await sharp(fileBuffer)
          .resize({ width: 600 }) // Resize the image to a width of 600px
          .jpeg({ quality: 60 }) // Compress the image to 60% quality
          .toBuffer();
      }
    } else if (fileType.startsWith("video/")) {
      // Ensure the temp directory exists
      const tempDir = path.join(__dirname, "../temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Save the video buffer to a temporary file
      const tempInputFilePath = path.join(tempDir, `input_${fileName}`);
      const tempOutputFilePath = path.join(tempDir, `output_${fileName}`);
      fs.writeFileSync(tempInputFilePath, fileBuffer);

      // Apply different ffmpeg transformations based on file size
      if (fileSize < 10 * 1024 * 1024) {
        // Less than 10 MB
        await new Promise((resolve, reject) => {
          console.log("Less than 10 MB fileSize", fileSize / (1024 * 1024));

          ffmpeg(tempInputFilePath)
            .outputOptions([
              // "-b:v 300k", // Set video bitrate to 800 kbps
              // "-b:a 96k", // Set audio bitrate to 128 kbps
              // "-crf 10",   // Use a CRF value for better quality
              "-preset medium", // Balanced encoding speed and quality
              // "-vf scale=720:-2" // Scale to a width of 720 pixels, maintaining aspect ratio
            ]) // Set video bitrate to 1 Mbps
            .save(tempOutputFilePath)
            // .on('start', (commandLine) => {
            //   console.log('Spawned Ffmpeg with command: ' + commandLine);
            // })
            // .on('stderr', (stderrLine) => {
            //   console.log('Stderr output: ' + stderrLine);
            // })
            .on("end", resolve)
            .on("error", reject);
        });
      } else if (fileSize < 50 * 1024 * 1024) {
        // Between 10 and 50 MB
        await new Promise((resolve, reject) => {
          console.log(
            "Between 50 MB and 100 MB fileSize",
            fileSize / (1024 * 1024)
          );
          ffmpeg(tempInputFilePath)
            .outputOptions([
              // "-b:v 300k", // Set video bitrate to 800 kbps
              // "-b:a 96k", // Set audio bitrate to 128 kbps
              "-crf 12", // Use a CRF value for better quality
              "-preset medium", // Balanced encoding speed and quality
              // "-vf scale=720:-2" // Scale to a width of 720 pixels, maintaining aspect ratio
            ]) // Set video bitrate to 1 Mbps
            .save(tempOutputFilePath)
            .on("start", (commandLine) => {
              console.log("Spawned Ffmpeg with command: " + commandLine);
            })
            .on("stderr", (stderrLine) => {
              console.log("Stderr output: " + stderrLine);
            })
            .on("end", resolve)
            .on("error", reject);
        });
      } else if (fileSize < 100 * 1024 * 1024) {
        // Between 50 MB and 100 MB
        await new Promise((resolve, reject) => {
          console.log(
            "Between 50 MB and 100 MB fileSize",
            fileSize / (1024 * 1024)
          );

          ffmpeg(tempInputFilePath)
            .outputOptions([
              "-b:v 800k", // Set video bitrate to 800 kbps
              "-b:a 128k", // Set audio bitrate to 128 kbps
              "-crf 14", // Use a CRF value for better quality
              "-preset medium", // Balanced encoding speed and quality
              "-vf scale=720:-2", // Scale to a width of 720 pixels, maintaining aspect ratio
            ]) // Resize the video to 960px width, height divisible by 2
            .save(tempOutputFilePath)
            .on("start", (commandLine) => {
              console.log("Spawned Ffmpeg with command: " + commandLine);
            })
            .on("stderr", (stderrLine) => {
              console.log("Stderr output: " + stderrLine);
            })
            .on("end", resolve)
            .on("error", reject);
        });
      } else {
        // Greater than 100 MB
        await new Promise((resolve, reject) => {
          console.log("Greater than 100 MB fileSize", fileSize / (1024 * 1024));

          ffmpeg(tempInputFilePath)
            .outputOptions([
              "-b:v 2000k", // Set video bitrate to 2000 kbps
              "-b:a 192k", // Set audio bitrate to 192 kbps
              "-crf 18", // Use a CRF value for higher quality
              "-preset slow", // Slower encoding for better compression
              "-vf scale=1080:-2", // Scale to a width of 1080 pixels, maintaining aspect ratio
            ]) // Set video bitrate to 500 kbps
            .save(tempOutputFilePath)
            .on("start", (commandLine) => {
              console.log("Spawned Ffmpeg with command: " + commandLine);
            })
            .on("stderr", (stderrLine) => {
              console.log("Stderr output: " + stderrLine);
            })
            .on("end", resolve)
            .on("error", reject);
        });
      }

      // Read the optimized video file back into a buffer
      optimizedBuffer = fs.readFileSync(tempOutputFilePath);

      // Delete the temporary files
      if (fs.existsSync(tempInputFilePath)) {
        fs.unlinkSync(tempInputFilePath);
      }
      if (fs.existsSync(tempOutputFilePath)) {
        fs.unlinkSync(tempOutputFilePath);
      }
    }

    // Upload the optimized file to S3
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: `uploads/${fileName}`,
      Body: optimizedBuffer,
      ContentType: fileType,
      // ContentDisposition: "inline",
    };

    const s3UploadPromise = s3.send(new PutObjectCommand(params));

    // const messageContent = `https://files16.s3.amazonaws.com/uploads/${fileName}`;
    // const message = new Message({
    //   content: messageContent,
    //   sender: sender,
    //   type: 
    //   fileType.startsWith("image/")
    //     ? 
    //     "image"
    //     : fileType.startsWith("video/")
    //     ? "video"
    //     : "audio"
    //     ,
    //   createdAt: new Date(),
    //   filePath: filePath,
    // });

    // const savedMessagePromise = message.save();

    const [s3UploadResult, savedMessage] = await Promise.all([
      s3UploadPromise,
      // savedMessagePromise,
    ]);

    res
      .status(201)
      .json({ message: savedMessage, fileUrl: s3UploadResult.Location });
  } catch (err) {
    console.error("Error processing file:", err);
    // Delete the temporary files
    if (fs.existsSync(tempInputFilePath)) {
      fs.unlinkSync(tempInputFilePath);
    }
    if (fs.existsSync(tempOutputFilePath)) {
      fs.unlinkSync(tempOutputFilePath);
    }
    res.status(500).json({ error: "Failed to process file" });
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
