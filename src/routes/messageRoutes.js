const express = require('express');
const router = express.Router();
const Message = require('../models/message');
const multer = require('multer');
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const path = require('path');
const mime = require('mime-types');
const stream = require('stream');

// Set up memory storage for multer
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

let gfsBucket;

// Connect to MongoDB and set up GridFSBucket
mongoose.connection.once('open', () => {
  gfsBucket = new GridFSBucket(mongoose.connection.db, {
    bucketName: 'uploads',
    chunkSizeBytes: 1024 * 1024 * 2 // 2 MB chunk size
  });
});

// GET route for retrieving messages
router.get('/', async (req, res) => {
  try {
    const messages = await Message.find().sort({ createdAt: -1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST route for saving text messages
router.post("/", async (req, res) => {
  const { content, sender, status } = req.body;

  const message = new Message({
    content: content,
    sender: sender,
    status: status,
    createdAt: new Date(),
    seen: true,
    tempId: '',
    type: 'text'
  });

  try {
    const savedMessage = await message.save();
    res.status(201).json(savedMessage);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// POST route for file uploads
router.post('/upload', upload.single('file'), async (req, res) => {
  const { sender, tempId, filePath } = req.body;
  const file = req.file;
  const id = new mongoose.Types.ObjectId();
  const mimeType = mime.lookup(file.originalname);
  let messageType;

  if (mimeType.startsWith('image/')) {
    messageType = 'image';
  } else if (mimeType.startsWith('video/')) {
    messageType = 'video';
  } else if (mimeType.startsWith('audio/')) {
    messageType = 'sound';
  } else {
    messageType = 'file';
  }

  const uploadStream = gfsBucket.openUploadStreamWithId(id, file.originalname, {
    contentType: file.mimetype,
    metadata: { sender },
    chunkSizeBytes: 1024 * 1024 * 2 // 2 MB chunk size
  });

  // Stream the file directly without buffering
  const bufferStream = new stream.PassThrough();
  bufferStream.end(file.buffer);
  
  bufferStream.pipe(uploadStream);

  uploadStream.on('finish', async () => {
    const messageContent = `https://express-mongo-vercel-crud-projec-production.up.railway.app/messages/files/${id}`;
    const message = new Message({
      _id: id,
      type: messageType,
      content: messageContent,
      sender: sender,
      createdAt: new Date(),
      tempId: tempId,
      filePath: filePath
    });

    try {
      const savedMessage = await message.save();
      res.status(201).json(savedMessage);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to save message' });
    }
  });

  uploadStream.on('error', (err) => {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload file' });
  });
});

// GET route for downloading files
router.get('/files/:id', async (req, res) => {
  const fileId = req.params.id;

  try {
    const file = await gfsBucket.find({ _id: new mongoose.Types.ObjectId(fileId) }).toArray();
    if (!file || file.length === 0) {
      return res.status(404).json({ message: 'File not found' });
    }

    const readstream = gfsBucket.openDownloadStream(new mongoose.Types.ObjectId(fileId));
    res.set('Content-Type', file[0].contentType);
    readstream.pipe(res);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH route for marking messages as seen
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