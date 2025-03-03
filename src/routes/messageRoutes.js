const express = require("express");
const router = express.Router();
const Message = require("../models/message");
const multer = require("multer");
const mongoose = require("mongoose");
const { GridFSBucket } = require("mongodb");
const mime = require("mime-types");
const stream = require("stream"); // Import the stream module
const path = require("path");
const fs = require("fs");

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

let gfsBucket;
mongoose.connection.once("open", () => {
  gfsBucket = new GridFSBucket(mongoose.connection.db, {
    bucketName: "uploads",
    chunkSizeBytes: 1024 * 1024, // 1 MB chunk size
  });
});

router.get("/", async (req, res) => {
  try {
    const messages = await Message.find().sort({ createdAt: -1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/upload", upload.single("file"), async (req, res) => {
  if (!gfsBucket) {
    return res.status(500).json({ error: "MongoDB connection is not established" });
  }

  const { sender } = req.body;
  const fileBuffer = req.file.buffer;
  const fileName = req.file.originalname;
  const totalChunks = Math.ceil(fileBuffer.length / (1024 * 1024));

  let globalFileId = new mongoose.Types.ObjectId();
  const uploadPromises = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * (1024 * 1024);
    const end = Math.min(start + 1024 * 1024, fileBuffer.length);

    const chunkBuffer = fileBuffer.slice(start, end);
    const uploadStream = gfsBucket.openUploadStreamWithId(
      globalFileId,
      fileName,
      {
        contentType: mime.lookup(fileName),
        chunkSizeBytes: 1024 * 1024, // 1 MB chunk size
      }
    );

    const uploadPromise = new Promise((resolve, reject) => {
      uploadStream.write(chunkBuffer);
      uploadStream.end();
      uploadStream.on("finish", resolve);
      uploadStream.on("error", reject);
    });

    uploadPromises.push(uploadPromise);
    console.log(`Uploaded chunk ${i + 1}/${totalChunks}`);
  }

  try {
    await Promise.all(uploadPromises);

    // Create a message with the global file link
    const messageContent = `https://express-mongo-vercel-crud-projec-production.up.railway.app/messages/files/${globalFileId}`;
    const message = new Message({
      content: messageContent,
      sender: sender,
      type: mime.lookup(fileName),
      createdAt: new Date(),
    });

    const savedMessage = await message.save();
    console.log("Message saved:", savedMessage);
    res.status(201).json({ message: savedMessage, fileUrl: messageContent });
  } catch (err) {
    console.error("Error saving message:", err);
    res.status(500).json({ error: "Failed to save message" });
  }
});

router.get("/files/:id", async (req, res) => {
  const fileId = req.params.id;

  try {
    const file = await gfsBucket
      .find({ _id: new mongoose.Types.ObjectId(fileId) })
      .toArray();
    if (!file || file.length === 0) {
      return res.status(404).json({ message: "File not found" });
    }

    const readstream = gfsBucket.openDownloadStream(
      new mongoose.Types.ObjectId(fileId)
    );
    res.set("Content-Type", file[0].contentType);
    readstream.pipe(res);
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