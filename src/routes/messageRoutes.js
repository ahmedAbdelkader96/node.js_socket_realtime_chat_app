const express = require("express");
const router = express.Router();
const Message = require("../models/message");
const multer = require("multer");
const sharp = require("sharp");
const s3 = require("../configs/aws");
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
  // const fileName = req.file.originalname;
   const id = new mongoose.Types.ObjectId();
  
  const fileType = req.file.mimetype;

  try {
    // Resize and compress the image using sharp
    const optimizedBuffer = await sharp(fileBuffer)
      .resize({ width: 1000 }) // Resize the image to a width of 1000px
      .jpeg({ quality: 80 }) // Compress the image to 35% quality
      .toBuffer();

    // Upload the optimized image to S3
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: `uploads/${id}`, 
      Body: optimizedBuffer,
      ContentType: fileType,
      ContentDisposition: 'inline'
      // ACL: 'public-read'
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
        type: 'image',
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