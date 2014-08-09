var http = require("http");
var express = require('express');
var mysql = require('mysql');
var URL_PARSER = require('url');
var BODY_PARSER = require('body-parser');
var MYSQL = require('mysql');

var ELIZA = require('/home/ec2-user/git/battle-hacks/eliza/elizabot/elizabot.js').get();

var DATABASE = MYSQL.createConnection({
  host: "battlehacks.cb52ktblegm4.us-west-2.rds.amazonaws.com",
  user: "battlehacker",
  password: "battlehacker",
  database: "battlehacks"
});
DATABASE.connect();

var TWILIO_ID = "AC10a570344dac81f70d411dd590ac0e57";
var TWILIO_TOKEN = "c27ad4d332c5e60c37ad93e673b93d9f";
var TWILIO = require('twilio')(TWILIO_ID, TWILIO_TOKEN);

var CMD_ELIZA = "eliza";
var CMD_END_ELIZA = "stop eliza";

var MSG_WELCOME = "Hi! I'm your new pen pal. What's your name?";
var MSG_NAME_SET = "Great to meet you $USER! What do you want to call me?";
var MSG_CHAR_NAME_SET = "Sounds good!";
var MSG_ELIZA = "Eliza";

var QUERY_CREATE_USER = "INSERT INTO users (phoneNumber, lastPrompt) VALUES (?, ?)";
var QUERY_SET_NAME = "UPDATE users SET name=?, lastPrompt=? where phoneNumber=?";
var QUERY_SET_CHAR_NAME = "UPDATE users SET charName=?, lastPrompt=? where phoneNumber=?";
var QUERY_LAST_PROMPT = "SELECT lastPrompt FROM users where phoneNumber=?";
var QUERY_SET_LAST_PROMPT = "UPDATE users SET lastPrompt=? WHERE phoneNumber=?";
var QUERY_GET_CHAR_DATA = "SELECT * FROM users where phoneNumber=?";
var QUERY_UPDATE_TIME_SENSITVE_ITEMS = "UPDATE users SET charSavings=?, lastUpdate=CURDATE()"

var app = express();
app.set('views', __dirname + '/views')
app.set('view engine', 'ejs');
app.use(BODY_PARSER.json());

app.get("/res/*", function(req, res) {
  console.log("sending: " + req.url);
  res.sendFile("/home/ec2-user/git/battle-hacks" + req.url);
});

app.get("/", function (req, res) {
  res.render('index');
});

app.post("/initialize", function(req, res) {
  console.log("initialize");
  console.log("  number:" + req.body.number);
  var number = sanitizePhoneNumber(req.body.number);
  createUser(number);
});

app.get("/incomingSms", function(req, res) {
  var queryData = URL_PARSER.parse(req.url, true).query;

  var number = queryData.From.replace("+", "");

  DATABASE.query(QUERY_LAST_PROMPT, [number], function(err, rows) {
    if (err || rows.length != 1) {
      createUser(number);
    } else {
      handleResponse(rows[0].lastPrompt, queryData.Body, number);
    }
  });
});

app.get("/character", function(req, res) {
  var number = URL_PARSER.parse(req.url, true).query.phoneNumber;
  getCharData(number, function(data) {
    res.render('character', data);
  });
});

app.listen(80);

var getCharData = function(number, callback) {
  var number = URL_PARSER.parse(req.url, true).query.phoneNumber;
  DATABASE.query(QUERY_GET_CHAR_DATA, [number], function(err, rows) {
    if (err || rows.length != 1) {
      console.log("no char found for:" + number);
      res.render('error', {message: "Character not found"});
      return;
    }
    charData = {
      name: rows[0].charName,
      income: rows[0].charDailyIncome,
      savings: rows[0].charSavings,
      health: rows[0].charHealth,
      transportation: rows[0].charTransporation,
    }
    callback(charData);
  });
}

var createUser = function(number) {
  console.log("creating user:" + number);

  DATABASE.query(QUERY_CREATE_USER, [number, MSG_WELCOME], function(err) {
    if (err) {
      console.log("error:" + err);
    } else {
      sendMessage(MSG_WELCOME, number);
    }
  });
}

var sendMessage = function(message, number) {
  TWILIO.sms.messages.create({
    to: number,
    from: "5084030215",
    body: message,
  }, function() {
    console.log("sent message to:" + number);
  });
}

var handleResponse = function(lastPrompt, response, number) {
  if (lastPrompt === MSG_WELCOME) {
    DATABASE.query(QUERY_SET_NAME, [response, MSG_NAME_SET, number], function(err){
      if (err) {
        console.log("error setting name");
      } else {
        sendMessage(MSG_NAME_SET.replace("$USER", response), number);
      }
    });
  } else if (lastPrompt === MSG_NAME_SET) {
    DATABASE.query(QUERY_SET_CHAR_NAME, [response, MSG_CHAR_NAME_SET, number], function(err) {
      if (err) {
        console.log("error setting char name");
      } else {
        sendMessage(MSG_CHAR_NAME_SET, number);
      }
    });
  } else if (lastPrompt === MSG_ELIZA) {
    handleElizaRequest(response, number);
  } else {
    handleGenericRequest(response, number);
    console.log("strange prompt:" + lastPrompt);
  }
}

var handleGenericRequest = function(message, number) {
  message = message.toLowerCase();
  if (message.toLowerCase() === CMD_ELIZA) {
    DATABASE.query(QUERY_SET_LAST_PROMPT, [MSG_ELIZA, number], function(err) {
      sendMessage("Eliza here!", number);
    });
  } else if (message === CMD_END_ELIZA) {
    DATABASE.query(QUERY_SET_LAST_PROMPT, ["", number], function(err) {
      sendMessage("Bye!", number);
    });
  } else {
    sendMessage("Sorry, didn't understand that.", number);
  }
}

var handleElizaRequest = function(message, number) {
  if (message.toLowerCase() === CMD_END_ELIZA) {
    handleGenericRequest(message, number);
    return;
  }
  var reply = ELIZA.transform(message);
  sendMessage(reply, number);
}

var sanitizePhoneNumber = function(num) {
  num = num.replace(/\D/g, num);
  return num;
}
