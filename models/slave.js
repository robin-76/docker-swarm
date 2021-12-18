class Slave {
    constructor(name, ws) {
        this.name = name;
        this.ws = ws;
        this.active = false;
    }
}

module.exports = Slave