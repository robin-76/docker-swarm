var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var Hash = new Schema({
  hash: {
    type: String,
    required: true,
  },
  solution: {
    type: String,
    required: true,
  },
  date: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Hash", Hash, "Hash");