const express = require('express');
const router = express.Router();
const Message = require('../models/message');
const multer = require('multer');
const AWS = require('aws-sdk');
const mime = require('mime-types');
const mongoose = require('mongoose');

// Configure AWS SDK
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const s3 = new AWS.S3();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.get('/', async (req, res) => {
  try {
    const messages = await Message.find().sort({ createdAt: -1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

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

router.post('/upload', upload.single('file'), async (req, res) => {
  const { sender, tempId, filePath } = req.body;
  const file = req.file;
   const id = new mongoose.Types.ObjectId();
  
  // const id = uuidv4();
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

  const params = {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: `${id}-${file.originalname}`,
    Body: file.buffer,
    ContentType: file.mimetype,
    Metadata: { sender }
  };

  s3.upload(params, async (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to upload file' });
    }

    const messageContent = data.Location;
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
});

router.get('/files/:id', async (req, res) => {
  const fileId = req.params.id;

  try {
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileId
    };

    s3.getObject(params, (err, data) => {
      if (err) {
        console.error(err);
        return res.status(404).json({ message: 'File not found' });
      }

      res.set('Content-Type', data.ContentType);
      res.send(data.Body);
    });
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