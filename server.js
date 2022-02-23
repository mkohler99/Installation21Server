//Change this when deploying to production
// path to LetsEncrypt Certs
var path = '/etc/letsencrypt/live/oasis-sandbox.com';


//Setup Express as HTTPS Middleware
var app = require('express')();
var https = require('https');
var fs = require('fs');
// create server
var server = https.createServer({
  key: fs.readFileSync(path + '/privkey.pem', 'utf8'),
  cert: fs.readFileSync(path + '/cert.pem', 'utf8'),
  ca: fs.readFileSync(path + '/chain.pem', 'utf8')
}, app);
// start listening
server.listen(3000, function () {
  console.log('listening on secure port *:3000');
});
//Setup Socket.IO Client
const io = require("socket.io")({
  cors: {
	origin: '*',
  }
});
//Run Socket.IO Server
io.listen(server);



//Imports from Other Files
var { obstructions } = require('./constants');
var { items } = require('./constants');
var { eventList } = require('./constants');



//Global Game Variables
var currentRoom = "Backend1234";
const horizontalSectors = 60;
const verticalSectors = 24;
const horizontalStartPositions = 59;
const verticalStartPositions = 11;
const idleTimeout = 300000;
const garbageCollectionTime = 10000;
const itemCleanupTime = 4000;
const deletionTimeout = 4000;
var passcode = "AABBCC";
var oldpasscode = "AABBCC";
var numberOfBombs = 10;
var numberOfPickups = 15;
var numberOfEvents = 5;
var imaginaryData = {
	"players": {
		/*"X101": [
			{
			"name":"Lena",
			"xPos":"0",
			"yPos":"0",
			"lastChanged":"0",
		}
		]*/
	}
};

//Setup Interval timers
var garbageTick = setInterval(garbageTickFunction, garbageCollectionTime);
var itemTick = setInterval(itemTickFunction, itemCleanupTime);

//Setup game state
var itemsToSetup = 0;
while (itemsToSetup < numberOfBombs) {
	createItem("bomb");
	itemsToSetup += 1;
}
var itemsToSetup = 0;
while (itemsToSetup < numberOfPickups) {
	createItem("pickup");
	itemsToSetup += 1;
}
var itemsToSetup = 0;
while (itemsToSetup < numberOfEvents) {
	createItem("event");
	itemsToSetup += 1;
}


//Main Socket.IO Client handling Function
io.on('connection', client => {
	//io.to(client.id).emit('getHandle',client.id);
  var connectionID = client.id;
	
  
  clientRoom = "Client1234"

  client.on('queryState', handleQuery);
  client.on('queryBGState', handleBGQuery);
  client.on('queryItemState', handleItemQuery);
  client.on('TDConnect', handleTDConnect);
  client.on('joinTDChannel', handleJoinTDChannel);
  client.on('leaveTDChannel', handleLeaveTDChannel);
  client.on('pingMessage', handlePingMessage);
  client.on('movePlayer', handleMoveMessage);
  client.on('checkCode', handleCodeCheck);
  console.log("Browser Session:", connectionID, "connected.");
  
  client.on('disconnecting', () => {
	  const rooms = Object.keys(client.rooms);
	  console.log(rooms)
	});
	client.on('disconnect', () => {
	  console.log(client.theClientID," disconnected!");
	  deleteObject(client.theClientID);
	});
  
//Socket.IO Event Handlers

	function handleCodeCheck(gameCode) {
		console.log(gameCode);
		if((gameCode != passcode) && (gameCode!=oldpasscode) && (gameCode!="LENA")){
			  console.log("Invalid game code!");
			  io.to(connectionID).emit('codeRejected');
			  return;
		  } else {
			  io.to(connectionID).emit('codeAccepted');
		  }	
	}
  
  function handleJoinTDChannel(newObjectData){
		//console.log("Created Object");
		currentTime = Date.now();
		newObject = JSON.parse(newObjectData);
		clientID = Object.keys(newObject)[0];
		console.log(newObject[0])
		client.theClientID = connectionID;
		imaginaryData.players = Object.assign(newObject,imaginaryData.players);
		//console.log(imaginaryData);
		randomPosition(clientID);
		client.join(clientRoom);
		imaginaryData.players[clientID][0].angle = 0;
		imaginaryData.players[clientID][0].previousAngle = 0;
		imaginaryData.players[clientID][0].lives = 3;
		if(imaginaryData.players[clientID][0].shipID == 99){
			imaginaryData.players[clientID][0].lives = 9;
		} 
		imaginaryData.players[clientID][0].lastChanged = currentTime;
		imaginaryData.players[clientID][0].state = 1;
		imaginaryData.players[clientID][0].score = 0;
		changeScore(clientID,0);
	}
	
	function handleLeaveTDChannel(){
		client.leave(clientRoom);
		clientIDToLeave = client.theClientID;
		deleteObject(clientIDToLeave);
		//console.log(imaginaryData);
		
	}
	
	function handlePingMessage(data) {
		var theID = client.theClientID;
		randomPosition(theID);
	}
	
	function handleMoveMessage(direction) {
		var theID = client.theClientID;
		
		if(!theID){
			console.log("Sanity check Failed! tried to move client that does not exist");
			return;
		}
		currentTime = Date.now();
		var newXPosition = imaginaryData.players[theID][0].xPos
		var newYPosition = imaginaryData.players[theID][0].yPos
		var playerType = imaginaryData.players[theID][0].shipID
		var newAngle = imaginaryData.players[theID][0].angle;
		var oldAngle = imaginaryData.players[theID][0].previousAngle;
		var randomizeFlip = Math.round(Math.random());
		
		if(direction === 'LEFT'){
			newXPosition = imaginaryData.players[theID][0].xPos - 1;
			//Compute Rotation
			switch (oldAngle) {
				case 0:
					//Player was facing up
					newAngle = newAngle -1;
					break;
				case 1:
					//Player was facing right
					if(randomizeFlip == 0) {
						newAngle = newAngle +2;
					} else {
						newAngle = newAngle -2;
					}
					break;
				case 2: 
					//Player was facing down
					newAngle = newAngle + 1;
					break;
				case 3:
					//Player was facing left
					break;
			}
			//set previous angle
			oldAngle = 3;
			//Its OK to set the angle even if you hit a wall
			imaginaryData.players[theID][0].lastChanged = currentTime;
			imaginaryData.players[theID][0].previousAngle = oldAngle;
			imaginaryData.players[theID][0].angle = newAngle;
			//console.log(imaginaryData.players[theID][0].angle);
			if(newXPosition<=0){
				//Crashed into Left Wall
				return;
			}
		}
		if(direction === 'RIGHT'){
			newXPosition = imaginaryData.players[theID][0].xPos + 1;
			//Compute Rotation
			switch (oldAngle) {
				case 0:
					//Player was facing up
					newAngle = newAngle +1;
					break;
				case 1:
					//Player was facing right
					break;
				case 2: 
					//Player was facing down
					newAngle = newAngle - 1;
					break;
				case 3:
					//Player was facing left
					if(randomizeFlip == 0) {
						newAngle = newAngle +2;
					} else {
						newAngle = newAngle -2;
					}
					break;
			}
			//set previous angle
			oldAngle = 1;
			//Its OK to set the angle even if you hit a wall
			imaginaryData.players[theID][0].lastChanged = currentTime;
			imaginaryData.players[theID][0].previousAngle = oldAngle;
			imaginaryData.players[theID][0].angle = newAngle;
			//console.log(imaginaryData.players[theID][0].angle);
			if(newXPosition>horizontalSectors){
				//Crashed into Right Wall
				return;
			}
		}
		if(direction === 'UP'){
			newYPosition = imaginaryData.players[theID][0].yPos + 1;
			//Compute Rotation
			switch (oldAngle) {
				case 0:
					//Player was facing up
					break;
				case 1:
					//Player was facing right
					newAngle = newAngle -1;
					break;
				case 2: 
					//Player was facing down
					if(randomizeFlip == 0) {
						newAngle = newAngle +2;
					} else {
						newAngle = newAngle -2;
					}
					break;
				case 3:
					//Player was facing left
					newAngle = newAngle +1;
					break;
			}
			//set previous angle
			oldAngle = 0;
			//Its OK to set the angle even if you hit a wall
			imaginaryData.players[theID][0].lastChanged = currentTime;
		
			imaginaryData.players[theID][0].previousAngle = oldAngle;
			imaginaryData.players[theID][0].angle = newAngle;
			//console.log(imaginaryData.players[theID][0].angle);
			if(newYPosition>verticalSectors){
				//Crashed into Upper Wall
				return;
			}
		}
		if(direction === 'DOWN'){
			newYPosition = imaginaryData.players[theID][0].yPos - 1;
			//Compute Rotation
			switch (oldAngle) {
				case 0:
					//Player was facing up
					if(randomizeFlip == 0) {
						newAngle = newAngle +2;
					} else {
						newAngle = newAngle -2;
					}
					break;
				case 1:
					//Player was facing right
					newAngle = newAngle +1;
					break;
				case 2: 
					//Player was facing down
					break;
				case 3:
					//Player was facing left
					newAngle = newAngle -1;
					break;
			}
			//set previous angle
			oldAngle = 2;
			//Its OK to set the angle even if you hit a wall
			
			imaginaryData.players[theID][0].lastChanged = currentTime;
			imaginaryData.players[theID][0].previousAngle = oldAngle;
			imaginaryData.players[theID][0].angle = newAngle;
			//console.log(imaginaryData.players[theID][0].angle);
			if(newYPosition<=0){
				//Crashed into BOTTOM Wall
				return;
			}
		}
		
		
		if(imaginaryData.players[theID][0].shipID == 99){
			imaginaryData.players[theID][0].previousAngle = 0;
			imaginaryData.players[theID][0].angle = 0;
		}
		
		//Search for obstructions that prevent movement
		
		switch(hitCheck(newXPosition,newYPosition)){
			  case 1:
				  console.log("Obstruction hit")
				return;
				break;
			  case 2:
				console.log("we found....something")
				break;
			  default:
			}
		
		//Search for an item and run its effect
		var foundPlayer = handlePlayerCollision(newXPosition,newYPosition,imaginaryData.players[theID][0].shipID);
		
		var foundItem = itemCheck(newXPosition,newYPosition)
		
		if(foundPlayer == 99){
			console.log("player bumped into the admin")
			imaginaryData.players[theID][0].lives -= 3;
			imaginaryData.players[theID][0].score -= 500000;
			io.to(theID).emit('playerUpdate',imaginaryData.players[theID][0].lives,imaginaryData.players[theID][0].score);
			if(imaginaryData.players[theID][0].lives <= 0){
				console.log("Player has died");
				io.to(theID).emit('forceDisconnect');
				deleteObject(theID);
			}
		}

		
		
		if(foundItem>0 && foundItem<=5){
			console.log("Item 1-5 Bomb")
			imaginaryData.players[theID][0].lives -= 1;
			handleItem(foundItem,theID);
			if(imaginaryData.players[theID][0].lives <= 0){
				console.log("Player has died");
				io.to(theID).emit('forceDisconnect');
				deleteObject(theID);
				createItem("bomb")
			}
		}
		if(foundItem>=6 && foundItem <=10){
			console.log("ITEM 6-10 Extra Life");
			handleItem(foundItem,theID);
			imaginaryData.players[theID][0].lives += 1;	
		}
		if(foundItem>=11 && foundItem <=59){
			console.log("Found Pickup Number",foundItem,"!");
			handleItem(foundItem,theID);
		}
		if(foundItem>=60){
			sendEventToRender(foundItem);
			handleItem(foundItem,theID);
		}
		//Only MOVE the player if they dont hit an obstruction
		imaginaryData.players[theID][0].xPos = newXPosition;
		imaginaryData.players[theID][0].yPos = newYPosition;
		//console.log(imaginaryData.players[theID][0].xPos);
		//console.log(imaginaryData.players[theID][0].yPos);
		console.log("Moving ",theID, " ", direction, " Position: ",newXPosition, " , ", newYPosition, " Angle: ",newAngle*-90);
		io.to(theID).emit('playerUpdate',imaginaryData.players[theID][0].lives,imaginaryData.players[theID][0].score);
	}
	



	
//Handle renderer requests 
  function handleTDConnect(data){
	  //console.log("Touch Designer Connected", roomCode);
	  roomCode = data[0];
	  qrPassword = data[1];
	  client.join(roomCode);
	  if(qrPassword!=passcode){
		  console.log("Renderer changed Code")
		  oldpasscode = passcode;
		  passcode = qrPassword;
		  console.log("Old:",oldpasscode,"New:",passcode);
	  }
  }
  function handleQuery(touchdata) {
	  //console.log("received query from TD: ",touchdata)
	  io.to(currentRoom).emit('tdResponse',JSON.stringify(imaginaryData));
  }
  function handleBGQuery(touchdata) {
		//console.log("received query from TD: ",touchdata)
		io.to(currentRoom).emit('tdBGResponse',JSON.stringify(obstructions));
	}
  function handleItemQuery(touchdata) {
		//console.log("received Item query from TD: ",touchdata)
		io.to(currentRoom).emit('tdItemResponse',JSON.stringify(items));
	}
});



//ITEM FUNCTIONS
function createItem(type){
	var randomPosObject = generateRandomViableSpace();
	randomX = randomPosObject[0];
	randomY = randomPosObject[1];
	newItem = {};
	newItem.UUID = Math.random().toString(36).substr(2, 9);
	newItem.description = "";
	newItem.type = 1;
	newItem.active = 1;
	newItem.animState = 0;
	newItem.xPos = randomX;
	newItem.yPos = randomY;
	newItem.fxType = 0;
	console.log(newItem);
	
	//console.log(items);
	if(type == "bomb"){
		console.log("Creating New Bomb");
		newItem.type = randomIntFromInterval(1, 5);
		newItem.fxType = 1;
	} else if (type == "pickup") {
		console.log("Creating a pickup")
		newItem.type = randomIntFromInterval(6, 59)
		newItem.fxType = randomIntFromInterval(2, 4);
	} else if (type == "event") {
		console.log("Creating an event item")
		newItem.type = randomIntFromInterval(60, 85);
		newItem.fxType = 5;
	}
	items.push(newItem)
}



function sendEventToRender(theEventID){
	console.log("Sending event",theEventID,"to renderer");
	io.to(currentRoom).emit('tdEvent',theEventID);
}



function changeScore(theClientID, scoreAmount) {
	imaginaryData.players[theClientID][0].score += scoreAmount;
	console.log("Changed score of",theClientID, "to", imaginaryData.players[theClientID][0].score);
	
	io.to(theClientID).emit('playerUpdate',imaginaryData.players[theClientID][0].lives,imaginaryData.players[theClientID][0].score);
	
}



function handleItem(theEventID,theClientID){
	console.log("Sending Event",theEventID,"to player",theClientID);
	var eventString = ""
	var roomString = ""
	var eventEffect = 0
	var theEvent = eventList[theEventID];
	if(theEvent){
		eventString = theEvent.eventString;
		roomString = theEvent.roomString;
		eventScore = theEvent.eventScore;
		if(roomString !=""){
			io.to(clientRoom).emit('itemEvent',roomString,eventEffect);
		}
		io.to(theClientID).emit('itemEvent',eventString,eventEffect);
		changeScore(theClientID,eventScore);
	}
}



function itemCheck(playerXPos,playerYPos) {
	var itemFound = 0;
	items.forEach(function (item, index) {
		  if(item.xPos == playerXPos && item.yPos == playerYPos){
			  //Register Hit with player
			  itemFound = item.type;
			  //Make The Item Inactive Here
			  item.active = 0;
			  item.animState = 1;			   
		  }
		});
		return itemFound;
}



function itemTickFunction(a){
	//Deal With Items
	for (let i = 0; i < items.length; i++) { 
		if(items[i].active == 0) {
			//console.log('Deleted Dead Item');
			if(items[i].type == 1){
				items.splice(i,1)
				createItem("bomb");
			} else if (items[i].type >= 60) {
				items.splice(i,1)
				createItem("event");
			} else {
				items.splice(i,1)
				createItem("pickup");
			}
			return; 
		}
	}	
}



//Helper Functions
function getRandomInt(max) {
	  return Math.floor(Math.random() * max);
	}
	
function hitCheck(playerXPos,playerYPos) {
	var hitFound = 0;
	obstructions.forEach(function (item, index) {
		  if(item.xPos == playerXPos && item.yPos == playerYPos){
			  hitFound = item.type;
		  }
		});
		return hitFound;
}



function randomPosition(clientID) {

	if(!clientID){
		console.log("Sanity check Failed, non existend object moved");
		return;
	}
	console.log("randomizing Position for :",clientID);
	currentTime = Date.now();
	var randomPosObject = generateRandomViableSpace();
	randomX = randomPosObject[0];
	randomY = randomPosObject[1];
	imaginaryData.players[clientID][0].xPos = randomX;
	imaginaryData.players[clientID][0].yPos = randomY;
	imaginaryData.players[clientID][0].lastChanged = currentTime;
}



function generateRandomViableSpace() {
	valid = false;
	var x;
	var y;
	while(valid == false){
		x= randomIntFromInterval(1, 60)
		y = randomIntFromInterval(1, 24)
		if((y >= 1 && y <= 12)||((y >= 13 && y <= 16) && (x >= 21 && x <= 60))||((y >= 17 && y <= 20) && ((x >= 29 && x <= 40) || (x >= 53 && x <= 60)))||((y >= 21 && y <= 24) && (x >= 33 && x <= 40))) {
			//Found a viable space, next we need to check if its occupied
			isOccupied = false;
			items.forEach(function (item, index) {
				  if(item.xPos == x && item.yPos == y){
					  isOccupied = true;
				  }
				});
				if(isOccupied == false){
					//Space is viable and unoccupied
					valid == true;
					console.log("Found valid space at ",x,",",y);
					return([x,y]);
				} else {
					//console.log("Space has item, trying again");
				}			
		} else {
			console.log("Space was not viable")
		}	
	}		
}



function randomIntFromInterval(min, max) { // min and max included 
	  return Math.floor(Math.random() * (max - min + 1) + min)
	}
	
	
	
	//Object Management Functions
	function deleteObject(clientIDToDelete) {
		console.log(clientIDToDelete, "Will be destroyed!");
		if(imaginaryData.players[clientIDToDelete]){
			imaginaryData.players[clientIDToDelete][0].state = 0;
		} else {
			console.log("Sanity failed! object was already deleted!")
		}
		
			
		setTimeout(() => {
				//console.log('Object Cleanup Completed!');
				delete imaginaryData.players[clientIDToDelete];	
			}, deletionTimeout)
	}
	
	
	
	function garbageTickFunction(a)
	{
		//console.log("Looking for abandoned sessions");
		currentTime = Date.now();
		for (const [key, value] of Object.entries(imaginaryData.players)) {
			if(value[0].state != 0){
				changeScore(key,100);
			}
			objectLifetime = currentTime-(value[0].lastChanged);
			  //console.log(key, "is of age ", objectLifetime );
			  if(objectLifetime > idleTimeout){
				  //If an object has been around for too long, we will kick them
				  io.to(key).emit('forceDisconnect');
			  }
			}
	}
	
	function handlePlayerCollision(xPos,yPos,shipID){
			var playerFound = -1;
			var foundGUID = ""
			for (const [key, value] of Object.entries(imaginaryData.players)) {
				if(value[0].xPos == xPos && value[0].yPos == yPos){
					playerFound = value[0].shipID
					foundGUID = key;
				}	
		}
		if(shipID == 99 && playerFound >=0 && playerFound <99){
			console.log("Admin Collided with someone")
				damagePlayer(foundGUID)
			}
		return playerFound;
	}
		
		function damagePlayer(theClientID){
			console.log("Damaging player:",theClientID)
			imaginaryData.players[theClientID][0].lives -= 3;
			if(imaginaryData.players[theClientID][0].lives <= 0){
				console.log("Player has died");
				io.to(theClientID).emit('forceDisconnect');
				deleteObject(theClientID);
			}
		}






