const mongoose = require('mongoose');


const connectDB = async () => {
  try {
    const MONGO_URI = "mongodb+srv://ahmed:Ahm01200224741@cluster0.mlvgo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
    await mongoose.connect(MONGO_URI
      , { 
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
      writeConcern: {
        w: 'majority',
        j: true,
        wtimeout: 1000
      }
    }
  );
    console.log('MongoDB connected...');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};

module.exports = connectDB;