const express = require("express");
const router = express.Router();
const Message = require("../models/message");
const multer = require("multer");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const s3 = require("../configs/aws");
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
  const { sender } = req.body;
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
    if (fileType.startsWith('image/')) {
      if (fileSize < 5 * 1024 * 1024) { // Less than 5 MB
        optimizedBuffer = await sharp(fileBuffer)
          .resize({ width: 1000 }) // Resize the image to a width of 1000px
          .jpeg({ quality: 80 }) // Compress the image to 80% quality
          .toBuffer();
      } else if (fileSize < 10 * 1024 * 1024) { // Between 5 MB and 10 MB
        optimizedBuffer = await sharp(fileBuffer)
          .resize({ width: 800 }) // Resize the image to a width of 800px
          .jpeg({ quality: 70 }) // Compress the image to 70% quality
          .toBuffer();
      } else { // Greater than 10 MB
        optimizedBuffer = await sharp(fileBuffer)
          .resize({ width: 600 }) // Resize the image to a width of 600px
          .jpeg({ quality: 60 }) // Compress the image to 60% quality
          .toBuffer();
      }
    } else if (fileType.startsWith('video/')) {
      // Save the video buffer to a temporary file
      const tempFilePath = path.join(__dirname, `../temp/${fileName}`);
      fs.writeFileSync(tempFilePath, fileBuffer);

      // Apply different ffmpeg transformations based on file size
      if (fileSize < 50 * 1024 * 1024) { // Less than 50 MB
        await new Promise((resolve, reject) => {
          ffmpeg(tempFilePath)
            .outputOptions('-vf', 'scale=1280:-1') // Resize the video to 1280px width
            .outputOptions('-b:v', '1M') // Set video bitrate to 1 Mbps
            .save(tempFilePath)
            .on('end', resolve)
            .on('error', reject);
        });
      } else if (fileSize < 100 * 1024 * 1024) { // Between 50 MB and 100 MB
        await new Promise((resolve, reject) => {
          ffmpeg(tempFilePath)
            .outputOptions('-vf', 'scale=960:-1') // Resize the video to 960px width
            .outputOptions('-b:v', '800k') // Set video bitrate to 800 kbps
            .save(tempFilePath)
            .on('end', resolve)
            .on('error', reject);
        });
      } else { // Greater than 100 MB
        await new Promise((resolve, reject) => {
          ffmpeg(tempFilePath)
            .outputOptions('-vf', 'scale=640:-1') // Resize the video to 640px width
            .outputOptions('-b:v', '500k') // Set video bitrate to 500 kbps
            .save(tempFilePath)
            .on('end', resolve)
            .on('error', reject);
        });
      }

      // Read the optimized video file back into a buffer
      optimizedBuffer = fs.readFileSync(tempFilePath);

      // Delete the temporary file
      fs.unlinkSync(tempFilePath);
    }

    // Upload the optimized file to S3
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: `uploads/${fileName}`,
      Body: optimizedBuffer,
      ContentType: fileType,
      // ContentDisposition: 'inline',
 };

    s3.upload(params, async (err, data) => {
      if (err) {
        console.error("Error uploading to S3:", err);
        return res.status(500).json({ error: "Failed to upload to S3" });
      }

      // Create a message with the S3 file link
      const messageContent = data.Location;
      const message = new Message({
        content: messageContent,
        sender: sender,
        type: fileType.startsWith('image/') ? 'image' : fileType.startsWith('video/') ? 'video' : 'audio',
        createdAt: new Date(),
      });

      const savedMessage = await message.save();
      console.log("Message saved:", savedMessage);
      res.status(201).json({ message: savedMessage, fileUrl: messageContent });
    });
  } catch (err) {
    console.error("Error processing file:", err);
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