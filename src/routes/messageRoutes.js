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
const mime = require("mime-types");

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
  const { type } = req.body;
  const fileBuffer = req.file.buffer;
  const fileSize = req.file.size;
  const fileExtension = path.extname(req.file.originalname);
  const fileType = type;

  // Generate a new MongoDB ObjectId
  const fileId = new mongoose.Types.ObjectId();
  const fileName = `${fileId}${fileExtension}`;

  // Declare temp file paths outside the try block for proper cleanup
  let tempInputFilePath;
  let tempOutputFilePath;

  try {
    let optimizedBuffer = fileBuffer;

    if (fileType.startsWith("image")) {
      // Optimize images based on file size
      if (fileSize < 5 * 1024 * 1024) {
        optimizedBuffer = await sharp(fileBuffer)
          .resize({ width: 1000 })
          .jpeg({ quality: 80 })
          .toBuffer();
      } else if (fileSize < 10 * 1024 * 1024) {
        optimizedBuffer = await sharp(fileBuffer)
          .resize({ width: 800 })
          .jpeg({ quality: 70 })
          .toBuffer();
      } else {
        optimizedBuffer = await sharp(fileBuffer)
          .resize({ width: 600 })
          .jpeg({ quality: 60 })
          .toBuffer();
      }
    } else if (fileType.startsWith("video")) {
      // Ensure the temp directory exists
      const tempDir = path.join(__dirname, "../temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Save the video buffer to temporary files
      tempInputFilePath = path.join(tempDir, `input_${fileName}`);
      tempOutputFilePath = path.join(tempDir, `output_${fileName}`);
      fs.writeFileSync(tempInputFilePath, fileBuffer);

      // Apply ffmpeg transformations based on file size
      if (fileSize < 10 * 1024 * 1024) {
        // Less than 10 MB
        await processVideo(tempInputFilePath, tempOutputFilePath, {
          crf: 28,
          preset: "ultrafast",
        });
      } else if (fileSize < 50 * 1024 * 1024) {
        // Between 10 MB and 50 MB
        await processVideo(tempInputFilePath, tempOutputFilePath, {
          crf: 24,
          preset: "fast",
        });
      } else if (fileSize < 100 * 1024 * 1024) {
        // Between 50 MB and 100 MB
        await processVideo(tempInputFilePath, tempOutputFilePath, {
          crf: 20,
          preset: "medium",
          scale: "720:-2",
        });
      } else {
        // Greater than 100 MB
        await processVideo(tempInputFilePath, tempOutputFilePath, {
          crf: 18,
          preset: "slow",
          scale: "1080:-2",
        });
      }

      // Read the optimized video file back into a buffer
      optimizedBuffer = fs.readFileSync(tempOutputFilePath);
    }

    // Upload the optimized file to S3
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: `uploads/${fileName}`,
      Body: optimizedBuffer,
      ContentType: fileType,
    };

    await s3.send(new PutObjectCommand(params));

    const fileUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/uploads/${fileName}`;

    res.status(201).json({ fileUrl:fileUrl });  
  } catch (err) {
    console.error("Error processing file:", err);
    res.status(500).json({ error: "Failed to process file" });
  } finally {
    // Cleanup temporary files
    if (tempInputFilePath && fs.existsSync(tempInputFilePath)) {
      fs.unlinkSync(tempInputFilePath);
    }
    if (tempOutputFilePath && fs.existsSync(tempOutputFilePath)) {
      fs.unlinkSync(tempOutputFilePath);
    }
  }
});

/**
 * Helper function to process videos using ffmpeg
 */
async function processVideo(inputPath, outputPath, options) {
  return new Promise((resolve, reject) => {
    const ffmpegCommand = ffmpeg(inputPath).outputOptions([
      `-crf ${options.crf || 28}`, // Compression quality
      `-preset ${options.preset || "ultrafast"}`, // Encoding speed
      options.scale ? `-vf scale=${options.scale}` : null, // Scaling
    ].filter(Boolean));

    ffmpegCommand
      .save(outputPath)
      .on("start", (commandLine) => {
        console.log("Spawned ffmpeg with command:", commandLine);
      })
      .on("stderr", (stderrLine) => {
        console.log("ffmpeg stderr:", stderrLine);
      })
      .on("end", resolve)
      .on("error", reject);
  });
}

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
