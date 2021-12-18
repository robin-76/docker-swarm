const express = require('express');
const db = require('./database/db');
const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 3000 });

const Hash = require('./database/models/hash');

const Search = require("./models/search");
const Slave = require("./models/slave");

const app = express();

app.use(express.static(__dirname + "/public"));

wss.on("connection", ws => {
    console.log("New client connected!");

    ws.onmessage = function (event) {
        console.log(event.data);
      }

    ws.on("close", () => {
        console.log("Client has disconnected!");
    });
});
