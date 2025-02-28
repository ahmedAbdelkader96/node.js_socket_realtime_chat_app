const express = require('express');
const router = express.Router();
const Message = require('../models/message');
const multer = require('multer');
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const path = require('path');
const mime = require('mime-types');



const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

let gfsBucket;
mongoose.connection.once('open', () => {
  gfsBucket = new GridFSBucket(mongoose.connection.db, {
    bucketName: 'uploads'
  });
});



router.get('/', async (req, res) => {
  try {
    const messages = await Message.find().sort({ timestamp: -1 }).limit(10);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// router.post("/", async (req, res) => {
//   const { content, sender , status } = req.body;

//   const message = new Message({
//     content: content,
//     sender: sender,
//     status: status,
//     timestamp: new Date()
//   });

//   try {
//     const savedMessage = await message.save();
//     res.status(201).json(savedMessage);
//   } catch (err) {
//     res.status(400).json({ message: err.message });
//   }
// });


router.post('/', upload.array('files', 10), async (req, res) => {
  const { content, sender } = req.body;

  if (!sender) {
    return res.status(400).json({ message: 'Sender is required' });
  }

  const messages = [];
  const files = req.files;

  if (files && files.length > 0) {
    const uploadPromises = files.map(file => {
      return new Promise((resolve, reject) => {
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
          metadata: { sender }
        });

        uploadStream.end(file.buffer);

        uploadStream.on('finish', async () => {
          const messageContent = `/messages/files/${id}`;

          const message = new Message({
            _id: id,
            type: messageType,
            content: messageContent,
            senderName: sender,
            timestamp: new Date()
          });

          try {
            socket.getIo().emit('message', message); // Emit message before saving
            const newMessage = await message.save();
            resolve(newMessage);
          } catch (err) {
            reject(err);
          }
        });

        uploadStream.on('error', (err) => {
          reject(err);
        });
      });
    });

    try {
      const newMessages = await Promise.all(uploadPromises);
      res.status(201).json(newMessages);
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  } else if (content) {
    // Handle text message
    const id = new mongoose.Types.ObjectId();
    const message = new Message({
      _id: id,
      type: 'text',
      content: content,
      senderName: sender,
      timestamp: new Date()
    });

    try {
      socket.getIo().emit('message', message); // Emit message before saving
      const newMessage = await message.save();
      res.status(201).json(newMessage);
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  } else {
    return res.status(400).json({ message: 'Content or file is required' });
  }
});

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