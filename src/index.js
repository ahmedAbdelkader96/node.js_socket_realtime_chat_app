require('dotenv').config(); 

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const morgan = require("morgan");
const http = require("http");
const connectDB = require("./configs/db");


const messageRoutes = require("./routes/messageRoutes");
const socket = require("./configs/socket");
const path = require("path");
const app = express();
const server = http.createServer(app);
 

connectDB();

socket.init(server);


app.use(cors());
app.use(morgan("dev"));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, "../public"))); // Serve static files from the public directory

app.use("/messages", messageRoutes);

app.use((req, res, next) => {
  const error = new Error("Not found");
  error.status = 404;
  next(error);
});

app.use((error, req, res, next) => {
  res.status(error.status || 500);
  res.json({
    error: {
      message: error.message,
    },
  });
});
 
// // Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port http://localhost:${PORT}`));
 
module.exports = app;
