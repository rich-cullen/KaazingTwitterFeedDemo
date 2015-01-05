# Kaazing Twitter Feed Demo

This is a simple Twitter Streaming API demo. The server listens to Twitter via the Twitter Streaming API and republishes Tweets at periodic intervals to an instance of Apache ActiveMQ. The client connects to ActiveMQ via Kaazing Gateway JMS edition v4.0.x, subscribes to the Twitter stream and displays various metrics in the dashboard.

## Running locally

1. Start ActiveMQ

2. Start Kaazing Gateway v4.0.x

3. Run a web server from the directory containing this README.md and index.html

```Shell
cd /Users/rcullen/dev/demos/KaazingTwitterFeedDemo
python -m SimpleHTTPServer 8080
```

4. Browse to http://localhost:8080/

5. Start the server in Node.js

Check the config is ok in server/twitterStreamingApiStompBridgeConfig.json then...

```Shell
node server/twitterStreamingApiStompBridge.js
```

6. Enjoy!