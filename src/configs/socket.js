const socketIo = require('socket.io');
const Message = require('../models/message');
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const mime = require('mime-types');

let io;
let gfsBucket;



function init(server) {
    io = socketIo(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on("connection", async (socket) => {
        console.log("New client connected");

        socket.on("AddNewTextMessage", async (data) => {
            const { content, sender, createdAt, status, tempId , type } = data;
            const message = new Message({
                content: content,
                sender: sender,
                createdAt:  new Date(createdAt),
                status: status,
                seen: false,
                tempId: tempId,
                type: type
            });

            try {
                const savedMessage = await message.save();
                io.emit('newTextMessage', savedMessage);
            } catch (err) {
                console.error(err);
            }
        });

        socket.on("AddNewFileMessage", async (data) => {


            const { content, sender, createdAt, tempId } = data;
            const message = new Message({
                content: content,
                sender: sender,
                createdAt:  new Date(createdAt),
                status: 'sent',
                seen: false,
                tempId: tempId,
                type: 'image'
            });

            try {
                const savedMessage = await message.save();
                io.emit('newFileMessage', savedMessage);
            } catch (err) {
                console.error(err);
            }

            // const { file, sender , createdAt, tempId , filePath } = data;
            // const id = new mongoose.Types.ObjectId();
            // const mimeType = mime.lookup(file.originalname);
            // let messageType;
        
            // if (mimeType.startsWith('image/')) {
            //     messageType = 'image';
            // } else if (mimeType.startsWith('video/')) {
            //     messageType = 'video';
            // } else if (mimeType.startsWith('audio/')) {
            //     messageType = 'sound';
            // } else {
            //     messageType = 'file';
            // }
        
            // const buffer = Buffer.from(file.buffer, 'base64');
        
            // const uploadStream = gfsBucket.openUploadStreamWithId(id, file.originalname, {
            //     contentType: file.mimetype,
            //     metadata: { sender }
            // });
        
            // uploadStream.end(buffer);
        
            // uploadStream.on('finish', async () => {
            //     const messageContent = `https://express-mongo-vercel-crud-projec-production-9faf.up.railway.app/messages/files/${id}`;
            //     const message = new Message({
            //         _id: id,
            //         type: messageType,
            //         content: messageContent,
            //         sender: sender,
            //         createdAt: new Date(createdAt),
            //         status:'sent',
            //         tempId: tempId,
            //         filePath:filePath
            //     });
        
            //     try {
            //         const savedMessage = await message.save();
            //         io.emit('newFileMessage', savedMessage);
            //     } catch (err) {
            //         console.error(err);
            //     }
            // });
        
            // uploadStream.on('error', (err) => {
            //     console.error(err);
            // });
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