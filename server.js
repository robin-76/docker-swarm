const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 3000 });

wss.on("connection", ws => {
    console.log("New client connected!");

    ws.onmessage = function (event) {
        console.log(event.data);
      }

    ws.on("close", () => {
        console.log("Client has disconnected!");
    });
});