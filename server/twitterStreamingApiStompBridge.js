// Simple Twitter/STOMP bridge that listens to Twitter stream and publishes STOMP messages every X milliseconds
// NB. Based very loosely on Stephen Blum's Twitter/PubNub bridge https://gist.github.com/stephenlb/36aef15a165d5bad0d82


// initialisation
var twit = require('twit'), // https://github.com/ttezel/twit
    stomp = require('stomp'), // https://github.com/benjaminws/stomp-js
    nconf = require('nconf'), // https://github.com/flatiron/nconf
    stompClient,
    twitterStream,
    publishDestination = '/topic/twitter_stream',
    publishIntervalMilliseconds = 100,
    latest_tweet = {},
    twitterStreamingApiFilterParams = { // https://dev.twitter.com/streaming/overview/request-parameters#locations
        // locations : '-170, 25, -65, 70' // roughly geofence USA
        locations : '-15, 35, 45, 65' // roughly geofence western Europe
        // locations : '-180, -90, 180, 90' // entire globe
    };


// config
nconf.file( {
    file: __dirname + '/twitterStreamingApiStompBridgeConfig.json'
});

var twitterConfig = {
        consumer_key: nconf.get('TWITTER_CONSUMER_KEY'),
        consumer_secret: nconf.get('TWITTER_CONSUMER_SECRET'),
        access_token: nconf.get('TWITTER_ACCESS_TOKEN'),
        access_token_secret: nconf.get('TWITTER_ACCESS_TOKEN_SECRET')
    };

var activeMqConfig = {
        host: nconf.get('ACTIVEMQ_HOST'),
        port: nconf.get('ACTIVEMQ_PORT'),
        debug: nconf.get('ACTIVEMQ_DEBUG'),
        login: nconf.get('ACTIVEMQ_USERNAME'),
        passcode: nconf.get('ACTIVEMQ_PASSWORD'),
    };


// handle CTRL+C gracefully
process.on('SIGINT', function() {
    tidyUp();
    process.exit(0);
});


// main prog
connectToMessageBroker();
connectToTwitterPublicStream();
setInterval(publishMessage, publishIntervalMilliseconds);


// function definitions
function connectToMessageBroker() {
    console.log('Connecting to message broker...');

    stompClient = new stomp.Stomp(activeMqConfig);

    stompClient.on('connected', function () {
        console.log('Connected to message broker');
    });

    stompClient.on('error', function (error_frame) {
        console.log(error_frame.body);
        tidyUp();
        process.exit(0);
    });

    stompClient.connect();
}

function connectToTwitterPublicStream() {
    console.log('Connecting to Twitter public stream...');

    var twitter = new twit(twitterConfig);

    twitterStream = twitter.stream('statuses/filter', twitterStreamingApiFilterParams);
    console.log('Connected to Twitter public stream');

    twitterStream.on('tweet', function(tweet) {
            latest_tweet = tweet;
        });
}

function publishMessage() {
    if (isEmptyObject(latest_tweet)) return;

    stompClient.send({
        destination: publishDestination,
        body: JSON.stringify(latest_tweet),
        persistent: false
    }, false); // true = request receipt (which will trigger 'receipt' event)

    latest_tweet = {};
}

function tidyUp() {
    if (stompClient) {
        stompClient.disconnect();
        console.log('Disconnected from message broker');
    }

    if (twitterStream) {
        twitterStream.stop();
        console.log('Disconnected from Twitter stream');
    }
}

// utility functions
function isEmptyObject(obj) {
    return !Object.keys(obj).length;
}