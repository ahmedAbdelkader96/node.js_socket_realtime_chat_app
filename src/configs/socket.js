const socketIo = require('socket.io');
const Message = require('../models/message');
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const mime = require('mime-types');

let io;
let gfsBucket;

mongoose.connection.once('open', () => {
    gfsBucket = new GridFSBucket(mongoose.connection.db, {
        bucketName: 'uploads'
    });
});

function init(server) {
    io = socketIo(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on("connection", async (socket) => {
        console.log("New client connected");

        socket.on("newMessage", async (data) => {
            const { content, sender, timestamp, status, tempId } = data;
            const message = new Message({
                content: content,
                sender: sender,
                timestamp: timestamp || new Date(),
                status: status,
                seen: false,
                tempId: tempId,
                type: 'text'
            });

            try {
                const savedMessage = await message.save();
                io.emit('message', savedMessage);
            } catch (err) {
                console.error(err);
            }
        });

        socket.on("newFileMessage", async (data) => {
            const { file, sender, tempId } = data;
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
                const messageContent = `https://express-mongo-vercel-crud-projec-production.up.railway.app/file/${id}`;

                const message = new Message({
                    _id: id,
                    type: messageType,
                    content: messageContent,
                    sender: sender,
                    timestamp: new Date(),
                    tempId: tempId
                });

                try {
                    const savedMessage = await message.save();
                    io.emit('message', savedMessage);
                } catch (err) {
                    console.error(err);
                }
            });

            uploadStream.on('error', (err) => {
                console.error(err);
            });
        });

        socket.on("updateMessageStatus", async (data) => {
            const { messageId, status } = data;
            try {
                const message = await Message.findById(messageId);
                if (message) {
                    message.status = status;
                    await message.save();
                    io.emit('messageStatusUpdated', message);
                }
            } catch (err) {
                console.error(err);
            }
        });

        socket.on("messageSeen", async (data) => {
            const { messageId } = data;
            try {
                const message = await Message.findById(messageId);
                if (message) {
                    message.seen = true;
                    await message.save();
                    io.emit('messageSeenUpdated', message);
                }
            } catch (err) {
                console.error(err);
            }
        });

        socket.on("disconnect", () => {
            console.log("Client disconnected");
        });
    });
}

module.exports = { init };