
const express = require('express');
const db = require('./database/db')
const Hash = require('./database/models/hash');

const Search = require("./models/search");
const Slave = require("./models/slave");
const WebSocket = require('ws');

const app = express();

app.use(express.static(__dirname + "/public"));

const { exec } = require('child_process');
const http = require('http').Server(app);
const webSocketServer = new WebSocket.Server({ server: http });

// Informations réseaux
const HOST = '0.0.0.0';
const PORT = 3000;
const ADDR = "ws://" + HOST + ":" + PORT;

// Image Docker Hub pour le crack MD5
const IMAGE = "servuc/hash_extractor";
const INSTANCE_NAME = "crack_MD5";

// Minimum de slaves innactifs
const INACTIVE_SLAVES = 5; 

// Informations des clients
let clients = {}; 
let clientsFront = [];

// 3 niveaux de difficultés
const difficulty_tab = {
    easy: [
        new Search('0*', 'z*')
    ],
    medium: [
        new Search('0*', 'N*'),
        new Search('O*', 'z*')
    ],
    hard: [
        new Search('0*', 'C*'),
        new Search('D*', 'W*'),
        new Search('X*', 'k*'),
        new Search('l*', 'z*')
    ]
}

// Informations des slaves
let slaves = [];
let slavesCount = 0;
let hashInSearch = {};

// Initialisation de Docker Swarm Manager
function initSwarmManager() {
    exec("docker swarm init --advertise-addr 127.0.0.1", (err, _stdout, _stderr) => {
        if (err)
            console.log(`error: ${err}`);
            
        createSlaveService();
    });
}

// Ajout de 5 slaves de l'image hash extractor et initialise checkInactive toutes les 5 secondes
function createSlaveService() {
    console.log("Creating " + INACTIVE_SLAVES + " slaves using replicas");
    let command = "docker service create --restart-condition='none' --network='host' --name " + INSTANCE_NAME
    + " --replicas " + INACTIVE_SLAVES + " " + IMAGE + " ./hash_extractor s " + ADDR
    console.log(command)
    exec(command, (err, _stdout, _stderr) => {
        if (err) {
            console.error("Error executing " + command);
            console.error(err);
            return;
        }
        setInterval(checkInactive, 5000);
    });
}

// Initialiser un minimum de 5 esclaves inactifs supplémentaires du nombre d'esclaves
function checkInactive() {
    let inactifs = getInactiveSlaves().length;

    if (inactifs < INACTIVE_SLAVES) 
        scaleSlaves(INACTIVE_SLAVES - inactifs);
    else {
        let inactiveSlaves = getInactiveSlaves();
        for (let i = 0; i < inactifs - INACTIVE_SLAVES; i++) {
            let slave = inactiveSlaves[i];
            console.log("Closing slave : " + slave.name);
            slave.ws.send("exit");
            slaves = slaves.filter(s => s !== slave)
        }
    }
}

// Service de scale slaves
function scaleSlaves(nbMiss) {
    let slavesTot = slaves.length + nbMiss;
    console.log("Scale slaves to " + slavesTot);
    let command = "docker service scale " + INSTANCE_NAME + "=" + slavesTot;
    exec(command, (err, _stdout, _stderr) => {
        if (err) {
            console.error("Error executing " + command);
            console.error(err);
            return;
        }
    });
}

// Retourne le nombre de slaves innactifs
function getInactiveSlaves() {
    return slaves.filter(s => !s.active);
}

// Initialisation du serveur WebSocket
function initWebSocket() {
    webSocketServer.on('connection', (ws) => {
        ws.on('message', (data) => {
            console.log('received: %s', data);
            if (data === 'client') {
                clientsFront.push(ws);
                sendNbSlavesToClient();
            }
            else if (data === 'slave') {
                slavesCount++;
                slaves.push(
                    new Slave("slave_" + slavesCount, ws)
                );
                sendNbSlavesToClient();
            } else if (data.includes("found")) { // Un slave a décodé le hash 
                let split = data.split(" ");
                let hash = split[1];
                let solution = split[2];
                sendToClientsSolution(hash, solution);
                stopSearch(hash);
                saveHashInDB(hash, solution);   
            } else {
                try {
                    data = JSON.parse(data);
                    if (data.hash in clients)
                        clients[data.hash].push(ws);
                    else
                        clients[data.hash] = [ws];
                    Hash.findOne({ hash: data.hash }, function (err, foundHash) {
                        if (err || foundHash === null) {
                            switch (data.difficulty) {
                                case "1":
                                    activeInactiveSlaves(difficulty_tab.easy, data.hash);
                                    break;
                                case "3":
                                    activeInactiveSlaves(difficulty_tab.hard, data.hash);
                                    break;
                                default:
                                    activeInactiveSlaves(difficulty_tab.medium, data.hash);
                            }
                        } else {
                            console.log("Hash was already decoded and registered in database")
                            sendToClientsSolution(foundHash.hash, foundHash.solution);
                        }
                    });
                } catch (Exception) {
                    console.log(Exception)
                }
            }
        });
    });
}

// Envoi la solution à tous les clients
function sendToClientsSolution(hash, solution) {
    if (hash in clients) {
        for (let client of clients[hash]) {
            client.send(JSON.stringify({ 'type': 'found', 'hash': hash, 'solution': solution }));
        }
        delete clients[hash];
    }
}

// Arrêt de recherche pour les slaves
function stopSearch(hash) {
    if (hash in hashInSearch) {
        for (let slave of hashInSearch[hash]) {
            slave.ws.send("exit");
        }
        delete hashInSearch[hash];
        sendNbSlavesToClient();
    }
}

// Envoi du nombre de slaves à tous les clients
function sendNbSlavesToClient() {
    for (let client of clientsFront)
        client.send(JSON.stringify({ 'type': 'nbSlaves', 'slaves': slaves.length }));
}

// Envoi du hash au bon nombre de slaves via l'objet Search
function activeInactiveSlaves(difficultySearchMode, hash) {
    let inactiveSlaves = getInactiveSlaves();
    let slavesForHash = [];
    for (let i = 0; i < difficultySearchMode.length; i++) {
        let slave = inactiveSlaves[i];
        let begin = difficultySearchMode[i].begin;
        let end = difficultySearchMode[i].end;
        let emit = "search " + hash + " " + begin + " " + end;
        console.log("Sent to " + slave.name + " : " + emit);
        slave.ws.send(emit);
        slave.active = true;
        slavesForHash.push(slave);
    }
    hashInSearch[hash] = slavesForHash;
}

// Sauvegarde du hash et de la solution dans mongoDB 
function saveHashInDB(hash, solution) {
    let newHash = new Hash({
        hash: hash,
        solution: solution
    });
    newHash.save(function (err, hash) {
        if (err)
            console.error(err);
        else 
            console.log("New hash : " + hash.hash + " - " + hash.solution);
    });
}

initSwarmManager();
initWebSocket();

http.listen(PORT, HOST, () => {
    console.log(`Server launched on http://${HOST}:${PORT}`);
});
