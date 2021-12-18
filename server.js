
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
const HOST = 'localhost';
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
    exec("sudo docker swarm init --advertise-addr 127.0.0.1", (err, _stdout, _stderr) => {
        if (err) {
            console.log(`error: ${err}`);

            const command = `sudo docker swarm leave --force`
            console.log(command);

            exec(command, (err, stdout, _stderr) => {
                if (err) {
                    console.log(err);
                    return;
                }
                console.log(stdout)
                initSwarmManager();
            })
            return;
        } 
        createSlaveService();
    });
}

// Ajout de 5 slaves de l'image hash extractor et initialise checkInactive toutes les 5 secondes
function createSlaveService() {
    console.log("Creating " + INACTIVE_SLAVES + " slaves using replicas");
    let command = "sudo docker service create --restart-condition='none' --network='host' --name " + INSTANCE_NAME
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
    let command = "sudo docker service scale " + INSTANCE_NAME + "=" + slavesTot;
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


initSwarmManager();

http.listen(PORT, HOST, () => {
    console.log(`Server launched on http://${HOST}:${PORT}`);
});
