/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/.
*
*        Copyright 2018 Marco De Nicolo
*/

var express = require('express');
var session = require('express-session');
var bodyParser = require('body-parser');
var osc = require('osc');
var pgp = require('pg-promise')(/*options*/);
var db = pgp('postgres://user:password@127.0.0.1:5432/RCGS'); //change user and password
var fs = require('fs');
var bcrypt = require('bcrypt');
var app = express();
var server = require('http').createServer(app);
/*var options = {
    key: fs.readFileSync('test/fixtures/keys/agent2-key.pem'),
    cert: fs.readFileSync('test/fixtures/keys/agent2-cert.cert')
};
var https = require('https').createServer(options,app);*/
var io = require('socket.io')(server);
app.use(express.static(__dirname + "/public"));
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies
app.use(session({secret: "cat324$lol",
                resave: false,
                saveUninitialized: true}));
app.set('views','./public');
app.set('view engine', 'pug');

function updateAll(ip) {
    if(GH.has(ip))
        GH.get(ip).oscClient.send({ address: "/getSensors", args: [] });
}

var remoteConnections = new Map(); //remote_addr, GH_ip
var clients = new Map(); //GH_ip,[socket1,socket2,socket3]

io.on('connection', function(client) {
    /* handle connection */
    var cl_ip = client.request.connection.remoteAddress;
    var gh_ip, lev;
    if(remoteConnections.has(cl_ip)) {
        gh_ip = remoteConnections.get(cl_ip).ip
        lev = remoteConnections.get(cl_ip).lev;
        if(!clients.has(gh_ip))
            clients.set(gh_ip, [client]);
        else
            clients.get(gh_ip).push(client);
    }
    console.log("connect", cl_ip);
    if(lev){
        client.on("setmaxtemp",function(data){
            if(GH.has(gh_ip))
                GH.get(gh_ip).oscClient.send({address:"/setMaxTemperature", args: [{type: "f", value: data}]});
        });
        client.on("setmintemp",function(data){
            if(GH.has(gh_ip))
                GH.get(gh_ip).oscClient.send({address:"/setMinTemperature", args: [{type: "f", value: data}]});
        });
        client.on("setmaxehumi",function(data){
            if(GH.has(gh_ip))
                GH.get(gh_ip).oscClient.send({address:"/setMaxEnvHumidity", args: [{type: "i", value: data}]});
        });
        client.on("setminehumi",function(data){
            if(GH.has(gh_ip))
                GH.get(gh_ip).oscClient.send({address:"/setMinEnvHumidity", args: [{type: "i", value: data}]});
        });
        client.on("setmaxghumi",function(data){
            if(GH.has(gh_ip))
                GH.get(gh_ip).oscClient.send({address:"/setMaxGroundHumidity", args: [{type: "i", value: data}]});
        });
        client.on("setminghumi",function(data){
            if(GH.has(gh_ip))
                GH.get(gh_ip).oscClient.send({address:"/setMinGroundHumidity", args: [{type: "i", value: data}]});
        });
        client.on("light",function(data){
            if(GH.has(gh_ip)){
                GH.get(gh_ip).oscClient.send({address:"/light", args: [{type: "i", value: data}]});
                updateAll(gh_ip);
            }
        });
        client.on("fan",function(data){
            if(GH.has(gh_ip)){
                GH.get(gh_ip).oscClient.send({address:"/startFan", args: [{type: "i", value: data}]});
                updateAll(gh_ip);
            }
        });
        client.on("valve",function(data){
            if(GH.has(gh_ip)){
                GH.get(gh_ip).oscClient.send({address:"/startIrrigation", args: [{type: "i", value: data}]});
                updateAll(gh_ip);
            }
        });
        client.on("setIrrigationTime",function(data){
            if(GH.has(gh_ip)){
                GH.get(gh_ip).oscClient.send({address:"/autoIrrigation", args: [{type: "i", value: data}]});
                updateAll(gh_ip);
            }
        });
	client.on("autoLight",function(data){
            if(GH.has(gh_ip)){
                GH.get(gh_ip).oscClient.send({address:"/autoLight", args: [{type: "i", value: data}]});
                updateAll(gh_ip);
            }
        });
        client.on("addTT",function(data){
            if(GH.has(gh_ip)){
                GH.get(gh_ip).oscClient.send({address:"/addIrrigationTime", args: [{type: "i", value: data[0]},{type: "i", value: data[1]},{type: "i", value: data[2]}]});
                updateAll(gh_ip);
            }
        });
        client.on("remTT",function(data){
            if(GH.has(gh_ip)){
                GH.get(gh_ip).oscClient.send({address:"/removeIrrigationTime", args: [{type: "i", value: data}]});
                updateAll(gh_ip);
            }
        });
    }
    client.on("disconnect",function(){
        console.log("disconnect", cl_ip);
        remoteConnections.delete(cl_ip);
        if(clients.has(gh_ip))
            clients.get(gh_ip).filter(function(cli){ return cli.request.connection.remoteAddress!=cl_ip; });
    });
});

var GH = new Map();
/*search for greenhouses*/
var BroadOSC = new osc.UDPPort({
    localAddress: "0.0.0.0",
    localPort: 57122,
    remoteAddress: "192.168.1.255",
    remotePort: 7400,
    broadcast: true
});
var getIPAddresses = function () {
    var os = require("os"),
        interfaces = os.networkInterfaces(),
        ipAddresses = [];

    for (var deviceName in interfaces) {
        var addresses = interfaces[deviceName];
        for (var i = 0; i < addresses.length; i++) {
            var addressInfo = addresses[i];
            if (addressInfo.family === "IPv4" && !addressInfo.internal) {
                ipAddresses.push(addressInfo.address);
            }
        }
    }

    return ipAddresses;
};
BroadOSC.on("ready", function(){
    var ipAddresses = getIPAddresses();
    console.log("I'm: ");
    ipAddresses.forEach(function (address) {
        console.log(" Host:", address);
    });
    BroadOSC.send({ address: "/oscPing", args: [] });
});
BroadOSC.on("message", function(oscMsg){
    if(oscMsg.address == "/ok"){
        var ip = oscMsg.args[0];
        if(!GH.has(ip)){
            console.log("New Greenhouse detected: ",ip);
            var oscClient = new osc.UDPPort({
                localAddress: "0.0.0.0",
                localPort: 57123,
                remoteAddress: ip,
                remotePort: 7400
            });
            oscClient.on("message", function (oscMsg) {
                if(GH.has(ip)) {
                    switch (oscMsg.address) {
                        case "/temperature":
                            if(clients.has(ip))
                                clients.get(ip).forEach(function(client){client.emit("temperature",oscMsg.args[0].toFixed(1))});
                            GH.get(ip).sensors.temperature = oscMsg.args[0].toFixed(1);
                            console.log("temperature: ", oscMsg.args[0].toFixed(1));
                            break;
                        case "/envHumidity":
                            if(clients.has(ip))
                                clients.get(ip).forEach(function(client){client.emit("envHumidity",oscMsg.args[0])});
                            GH.get(ip).sensors.envHumidity = oscMsg.args[0];
                            console.log("envHumidity: ", oscMsg.args[0]);
                            break;
                        case "/groundHumidity":
                            var lev;
                            switch(oscMsg.args[0]) {
                                case 3:
                                    lev = "HIGH";
                                    break;
                                case 2:
                                    lev = "MEDIUM";
                                    break;
                                case 1:
                                    lev = "LOW";
                                    break;
                                default:
                                    lev = "VERY LOW";
                            }
                            if(clients.has(ip))
                                clients.get(ip).forEach(function(client){client.emit("groundHumidity",lev)});
                            GH.get(ip).sensors.groundHumidity = lev;
                            console.log("groundHumidity: ", lev);
                            break;
                        case "/waterLevel":
                            var lev;
                            switch(oscMsg.args[0]) {
                                case 3:
                                    lev = "HIGH";
                                    break;
                                case 2:
                                    lev = "MEDIUM";
                                    break;
                                case 1:
                                    lev = "LOW";
                                    break;
                                default:
                                    lev = "EMPTY";
                            }
                            if(clients.has(ip))
                                clients.get(ip).forEach(function(client){client.emit("waterLevel",lev)});
                            GH.get(ip).sensors.waterLevel = lev;
                            console.log("waterLevel: ", lev);
                            break;
                        case "/lightSensor":
                            if(clients.has(ip))
                                clients.get(ip).forEach(function(client){client.emit("lightSensor",oscMsg.args[0])});
                            GH.get(ip).sensors.lightSensor = oscMsg.args[0];
                            console.log("lightSensor: ", oscMsg.args[0]);
                            break;
                        case "/lightState":
                            if(clients.has(ip))
                                clients.get(ip).forEach(function(client){client.emit("lightState",oscMsg.args[0])});
                            GH.get(ip).sensors.lightState = oscMsg.args[0];
                            console.log("lightState: ", oscMsg.args[0]);
                            break;
                        case "/valveState":
                            if(clients.has(ip))
                                clients.get(ip).forEach(function(client){client.emit("valveState",oscMsg.args[0])});
                            GH.get(ip).sensors.valveState = oscMsg.args[0];
                            console.log("valveState: ", oscMsg.args[0]);
                            break;
                        case "/fanState":
                            if(clients.has(ip))
                                clients.get(ip).forEach(function(client){client.emit("fanState",oscMsg.args[0])});
                            GH.get(ip).sensors.fanState = oscMsg.args[0];
                            console.log("fanState: ", oscMsg.args[0]);
                            break;
                        case "/irrigationState":
                            if(clients.has(ip))
                                clients.get(ip).forEach(function(client){client.emit("irrigationState",oscMsg.args[0])});
                            GH.get(ip).sensors.irrigationState = oscMsg.args[0];
                            console.log("irrigationState: ", oscMsg.args[0]);
                            break;
			case "/maxTemperature":
                            if(clients.has(ip))
                                clients.get(ip).forEach(function(client){client.emit("maxTemperature",oscMsg.args[0].toFixed(1))});
                            GH.get(ip).sensors.maxTemperature = oscMsg.args[0].toFixed(1);
                            console.log("maxTemperature: ", oscMsg.args[0].toFixed(1));
                            break;
			case "/minTemperature":
                            if(clients.has(ip))
                                clients.get(ip).forEach(function(client){client.emit("minTemperature",oscMsg.args[0].toFixed(1))});
                            GH.get(ip).sensors.minTemperature = oscMsg.args[0].toFixed(1);
                            console.log("minTemperature: ", oscMsg.args[0].toFixed(1));
                            break;
			case "/maxEnvHumidity":
                            if(clients.has(ip))
                                clients.get(ip).forEach(function(client){client.emit("maxEnvHumidity",oscMsg.args[0])});
                            GH.get(ip).sensors.maxEnvHumidity = oscMsg.args[0];
                            console.log("maxEnvHumidity: ", oscMsg.args[0]);
                            break;
			case "/minEnvHumidity":
                            if(clients.has(ip))
                                clients.get(ip).forEach(function(client){client.emit("minEnvHumidity",oscMsg.args[0])});
                            GH.get(ip).sensors.minEnvHumidity = oscMsg.args[0];
                            console.log("minEnvHumidity: ", oscMsg.args[0]);
                            break;
			case "/maxGroundHumidity":
                            if(clients.has(ip))
                                clients.get(ip).forEach(function(client){client.emit("maxGroundHumidity",oscMsg.args[0])});
                            GH.get(ip).sensors.maxGroundHumidity = oscMsg.args[0];
                            console.log("maxGroundHumidity: ", oscMsg.args[0]);
                            break;
			case "/minGroundHumidity":
                            if(clients.has(ip))
                                clients.get(ip).forEach(function(client){client.emit("minGroundHumidity",oscMsg.args[0])});
                            GH.get(ip).sensors.minGroundHumidity = oscMsg.args[0];
                            console.log("minGroundHumidity: ", oscMsg.args[0]);
                            break;
			case "/autoLight":
                            if(clients.has(ip))
                                clients.get(ip).forEach(function(client){client.emit("autoLight",oscMsg.args[0])});
                            GH.get(ip).sensors.autoLight = oscMsg.args[0];
                            console.log("autoLight: ", oscMsg.args[0]);
                            break;
                        case "/weekTimeTable":
                            var tt = [];
                            for(var i=0; i<oscMsg.args.length; i+=4) {
                                var tt_obj = {index: oscMsg.args[i], day: oscMsg.args[i+1], hour: oscMsg.args[i+2], minute: oscMsg.args[i+3]};
                                tt.push(tt_obj);
                            }
                            if(clients.has(ip))
                                clients.get(ip).forEach(function(client){client.emit("weekTimeTable",tt)});
                            GH.get(ip).sensors.weekTimeTable = tt;
                            console.log("weekTimeTable: ", tt);
                            break;
                    }
                }
            });
            oscClient.open();
            GH.set(ip,{sensors:{},oscClient});
            updateAll(ip);
        }
    }
});
BroadOSC.open();

app.get('/',function(req,res){

    if(typeof req.session.logged == "undefined")
        req.session.logged = 0;
    if(req.session.logged == 2){
        updateAll(req.session.gh_ip);
        if(GH.has(req.session.gh_ip)) {
            remoteConnections.set(req.ip, {ip: req.session.gh_ip, lev:req.session.user_level});
            res.render('viewer',{sensors: GH.get(req.session.gh_ip).sensors, lev: req.session.user_level});
        }
        else
            res.render('viewer',{});
    } else if(req.session.logged == 1) {
       res.sendFile(__dirname + '/public/connect.html');
    } else {
       res.sendFile(__dirname + '/public/login.html');
    }
});

app.post('/', function(req, res) {

    if(typeof req.body.login != "undefined" && typeof req.body.user != "undefined" && typeof req.body.password != "undefined") {
        var name = req.body.user;
        var password = req.body.password;
        db.one('SELECT * FROM users WHERE (name=$1 OR mail=$1)',name)
        .then(function (data) {
            bcrypt.compare(password, data.password, function(err, ok) {
                if(ok) {
                    req.session.logged = 1;
                    req.session.user_level = data.user_level;
                    res.sendFile(__dirname + '/public/connect.html');
                }
            });
        })
        .catch(function (error) { console.log(error);
            res.sendFile(__dirname + '/public/login.html');
        });
    }
    else if(typeof req.body.connect != "undefined" && typeof req.body.ip != "undefined"){
        remoteConnections.set(req.ip, {ip: req.body.ip, lev: req.session.user_level});
        req.session.logged = 2;
        req.session.gh_ip = req.body.ip;
        updateAll(req.body.ip);
        if(GH.has(req.body.ip))
            res.render('viewer',{sensors: GH.get(req.body.ip).sensors, lev: req.session.user_level});
        else
            res.render('viewer',{});
    }
    else if(typeof req.body.logout != "undefined"){
        req.session.logged = 0;
        res.sendFile(__dirname + '/public/login.html');
    }
});
server.listen(8080);
//https.listen(443);

function job() {
    BroadOSC.send({ address: "/oscPing", args: [] });
    GH.forEach(function(val,key){updateAll(key);});
    console.log('update!');
}
setInterval(job,30000);
