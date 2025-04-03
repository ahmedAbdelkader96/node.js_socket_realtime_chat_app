const socketIo = require('socket.io');
const Message = require('../models/message');


let io;


function init(server) {
    io = socketIo(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on("connection", async (socket) => {

        socket.on("AddNewMessage", async (data, ack) => {
            const { content, sender, createdAt, status, tempId , type  , senderFilePath} = data;
            const message = new Message({
                content: content,
                sender: sender,
                createdAt:  new Date(createdAt),
                status: status,
                seen: false,
                tempId: tempId,
                type: type,
                senderFilePath:senderFilePath
            });

            try {
              io.emit('newMessage', message);

                const savedMessage = await message.save();
                //io.emit('newMessage', savedMessage);
                if (ack) ack({ success: true, message: savedMessage });

            } catch (err) {
                console.error(err);
                if (ack) ack({ success: false, error: "Failed to save message" });

            }
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