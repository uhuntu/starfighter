/*jshint node:true*/
var argv = require('optimist').argv;
var playerUUID = "notFound";
var noPlayerFound = true;
var playerPosX = null;
var playerPosY = null;

var gameSize = 1600; // 1000;
var minPos = 200;
var maxPos = 1600; // 800;
var botX = 500;
var botY = 500;
var vecX = null;
var vecY = null;
var botAngle = 0;

var distances = {};
var level = 1;
var port = (process.env.VCAP_APP_PORT || 3001);
var mqtt = require('mqtt');
var http = require('http');
var client;
var DISTANCE_CUTOFF = 1600; // 1000;
var topicBit = "/0/0/0/";

for (var i in process.argv) {
	if (process.argv[i].indexOf("--level") == 0) {
		level = process.argv[i].split("=")[1];
	}
}

var intervals = [];

function setPosition() {
	var boundary = 200;
	minPos = boundary;
	maxPos = gameSize - boundary;

	botX = minPos + Math.random() * (maxPos - minPos);
	botY = minPos + Math.random() * (maxPos - minPos);
	botAngle = Math.random * Math.PI * 2;
}

function setRandomVector() {
	var theta = Math.random() * Math.PI * 2;
	vecX = Math.cos(theta);
	vecY = Math.sin(theta);
}

function move() {
	if (playerPosX == null || playerPosY == null) {
		if (vecX && vecY) {
			botX += vecX;
			botY += vecY;
		}
	} else {
		if (botX > playerPosX) {
			botX -= level;
		}
		if (botX < playerPosX) {
			botX += level;
		}
		if (botY > playerPosY) {
			botY -= level;
		}
		if (botY < playerPosY) {
			botY += level;
		}
	}
	
//	console.log("maxPos = " + maxPos);

	if (botX < minPos) { botX = minPos; }
	if (botX > maxPos) { botX = maxPos; }
	if (botY < minPos) { botY = minPos; }
	if (botY > maxPos) { botY = maxPos; }
}

function changeAngle() {
	if (playerPosX == null || playerPosY == null) {
		botAngle += 0.1; if (botAngle > 2 * Math.PI) { botAngle -= 2 * Math.PI; }
		return;
	}
	var x = botX - playerPosX;
	var y = botY - playerPosY;

	var theta = Math.atan2(y, x);
	theta += (180 / Math.PI) * 2;
	botAngle = theta;
}

function startShip() {

	var my_uuid = Math.random().toString(36).slice(2).substring(0,10); // Math.random().toString(36).substring(2, 7);
	client = mqtt.connect("mqtt://10.11.108.10");
	client.subscribe("starfighter/config/+");
	client.subscribe("starfighter/players/+/ship");
	client.subscribe("starfighter/players/ship/+/+/+/+");
	client.subscribe("starfighter/players/+/event");
	var my_name = "BlueMix Hunter";
	var my_shield = 1.0;

	setTimeout(function() {
		var alive = true;
		setPosition();
		intervals.push(setInterval(function() {
			if (alive) {
				move();
				changeAngle();
				var update = JSON.stringify({
					uuid: my_uuid,
					time: (new Date()).getTime(),
					name: my_name,
					type: "AI",
					worldPos: {
						x: botX,
						y: botY
					},
					lastHitTime: (new Date()).getTime(),
					lastUpdate: (new Date()).getTime(),
					velocity: {
						x: 0.0,
						y: 0.0
					},
					angle: botAngle,
					AI: true,
					shield: my_shield
				});
				client.publish("starfighter/players/ship" + topicBit + my_uuid, update);
			}
		}, 50));

		var interval = 500;
		var bullets = 1;
		if (level == 2) {
			bullets = 3;
			interval = 500;
		}
		if (level == 3) {
			bullets = 4;
			interval = 200;
		}
		if (level == 4) {
			bullets = 5;
			interval = 300;
		}
		intervals.push(setInterval(function() {
			if (alive) {
				var shootData = {
					uuid: my_uuid,
					action: "shoot",
					bullets: bullets
				};
				client.publish("starfighter/players/" + my_uuid + "/event", JSON.stringify(shootData));
			}
		}, interval));

		intervals.push(setInterval(function() {
			// set random vector when no ship in range
			setRandomVector();
		}, 10000 + Math.random() * 10000));
	}, 1000);

	client.on('message', function(topic, payload) {
//		console.log(topic, String(payload));
		if (topic.match("starfighter/players/" + my_uuid + "/event") != null) {
			var uuid = topic.split("/")[2];
			var data = JSON.parse(payload);
			if (data.action == "hit" && alive) {
				console.log("hit by " + data.by + " for " + data.damage + " damage!");
				my_shield -= data.damage;
				if (my_shield < 0) {
					alive = false;
					my_shield = 0;
					var bonus = 100 * Math.pow(3, level - 1);
					var destroyedData = {
						uuid: my_uuid,
						name: my_name,
						action: "destroyed",
						bonus: bonus,
						by: data.by
					};
					client.publish("starfighter/players/" + my_uuid + "/event", JSON.stringify(destroyedData));
					setTimeout(stopShip, 100);
				}
			}
		} else if (topic.match("starfighter/players/ship/.*") != null) {
//			console.log(topic, String(payload));
			var s = topic.split('/');
			topicBit = "/" + s[3] + "/" + s[4] + "/" + s[5] + "/";
//			console.log(topicBit);
			var playerData = JSON.parse(payload);
			if (playerData.name.substring(0, 0) != "Bot" && playerData.name.substring(0,7) != "BlueMix" && playerData.uuid != my_uuid) {

				console.log("playerData.worldPos.x = " + playerData.worldPos.x);
				console.log("playerData.worldPos.y = " + playerData.worldPos.y);
				console.log("botX = " + botX);
				console.log("botY = " + botY);

				distances[playerData.uuid] = Math.sqrt(Math.pow(playerData.worldPos.x - botX, 2) + Math.pow(playerData.worldPos.y - botY, 2));

				console.log("distances[playerData.uuid] = " + distances[playerData.uuid]);

				if (distances[playerData.uuid] > DISTANCE_CUTOFF) {
					if (playerUUID == playerData.uuid) {
						playerUUID = null;
						playerPosX = null;
						playerPosY = null;
					}
					delete distances[playerData.uuid];
				}
				var minDist = 1000000;
				var minUuid = "";
				for (var i in distances) {
					if (distances[i] < minDist) {
						minDist = distances[i];
						minUuid = i;
					}
				}
				if (playerUUID != minUuid) {
					playerUUID = minUuid;
					console.log("swithing to target " + minUuid);
				}

				console.log("playerUUID = " + playerUUID);

				if (playerData.uuid == playerUUID) {
					playerPosX = playerData.worldPos.x;
					playerPosY = playerData.worldPos.y;
				}
			}
		} else if (topic.match("starfighter/players/.*/event") != null) {
			var playerData = JSON.parse(payload);
			if (playerData.action && (playerData.action == "destroyed" || playerData.action == "left")) {
				if (distances[playerData.uuid]) {
					if (playerUUID == playerData.uuid) {
						playerUUID = null;
						playerPosX = null;
						playerPosY = null;
					}
					delete distances[playerData.uuid];
				}
			}
		} else if (topic.match("starfighter/config/gameSize") != null) {
			gameSize = payload;
		}
	});
}

function stopShip() {
	for (var i in intervals) {
		clearInterval(intervals[i]);
	}
	client.end();

	level++
	if (level > 2) {
		level = 1;
	}
	setTimeout(startShip, 5000);
}

http.createServer(function(req, res) {
	res.writeHead(200, {
		'Content-Type': 'text/plain'
	});
	res.end('I am a Node Starfighter Hunter\n');
}).listen(port);
console.log("listening on " + port + "\r\n");
console.log("starting the ship" + "\r\n");
startShip();

