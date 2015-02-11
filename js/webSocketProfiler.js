// TODO: wrapped websocket should be created internally, need to extend the pattern and intercept JmsConnectionFactory.createConnection more intelligently
// TODO: add final output summary that renders to table and invokes any registered final results handler
// TODO: calculate how long the profiler has been running when stop called, and emit final results that extrapolate use to 24 hours, X users etc
// TODO: capture outbound traffic also - easiest way to do this?
// TODO: add latency probe like in FX demo http://demo.kaazing.com/forex/ - NB. This might require a gateway echo service etc
// TODO: handle connectivity breaks
// TODO: document config, usage and dependencies
// TODO: tighten defensive coding in compatibility check stub implementation, initialisation, setters and Array maths helper

// TODO: Optional - This could be a standalone widget and render its own UI buttons
// TODO: Optional - what's the best live chart format for this?

// TODO: Optimise - remove as many dependencies as possible
// TODO: Optimise - draw table using DOM API rather than jQuery

/****************************************************************
 *   console object stub for IE8 with no dev tools open etc
 ****************************************************************/
if(typeof console === 'undefined') {
    console = { log: function() { } };
}


/****************************************************************
 *   create webSocketProfiler module within Kaazing namespace
 ****************************************************************/
Kaazing = window.Kaazing || {};

Kaazing.webSocketProfiler = (function () {

    /****************************************************************
     *   compatibility check
     ****************************************************************/
    var isCompatible =  !!(window.$ && window.WebSocketFactory && Array.prototype.reduce);

    // if incompatible return stub to prevent any subsequent application calls from throwing exceptions
    if (!isCompatible) {
        console.log('Kaazing WebSocket Profiler: Error! Unable to initialise due to missing dependencies.  Requires jQuery, Kaazing JMS client library and ES5');

        var stub = function () { console.log('Kaazing WebSocket Profiler: Error! Unsupported method call') };
        return {
            initialise: stub,
            setProfileFrequencyMilliseconds: stub,
            setIntervalSummaryTableContainerID: stub,
            setIntervalStatsHandler: stub,
            setResultsTableContainerID: stub,
            setResultsHandler: stub,
            start: stub,
            stop: stub
            //webSocketFactory: new WebSocketFactory() // TODO: obviously this ain't going to work!
        };
    }


    /****************************************************************
     *   Array maths helper
     ****************************************************************/
    var arrayMathUtility = {
        min: function (array) {
            var result = Math.min.apply( Math, array );
            return isFinite(result) ? result : 0;
        },
        max: function (array) {
            var result = Math.max.apply( Math, array );
            return isFinite(result) ? result : 0;
        },
        median: function (array) {
            var result,
                midpoint;

            array.sort( function(a,b) {return a - b;} );
            midpoint = Math.floor(array.length / 2);

            if (array.length % 2) {
                result = array[midpoint];
            } else {
                result = (array[midpoint-1] + array[midpoint]) / 2.0;
            }

            return isFinite(result) ? result : 0;
        },
        sum: function (array) {
            var result;

            if (array.length) {
                result = array.reduce(function (a, b) {
                    return a + b;
                });
            } else {
                result = 0;
            }

            return isFinite(result) ? result : 0;
        }
    };


    /****************************************************************
     *   private variables
     ****************************************************************/
    var webSocketFactory,
        webSocket,
        profileFrequencyMilliseconds,
        profileIntervalID,
        intervalPackets = [],
        cumulativePackets = 0,
        cumulativeBytes = 0,
        intervalSummaryTableContainerIDSelector,
        intervalSummaryHandler = null,
        resultsTableContainerIDSelector,
        resultsHandler = null,
        includeControlPackets = false,
        enableLatencyProbe = false,
        debug,
        isInitialised = false,
        bandwidthHistorySize,
        inboundBandwidthHistory = [],
        profileStartTime;


    /****************************************************************
     *   private methods
     ****************************************************************/
    var initialise = function (config) {
            debug = config.debug || false;
            if (debug) { console.log('Kaazing WebSocket Profiler: initialising'); }
            profileFrequencyMilliseconds = config.profileFrequencyMilliseconds || 2000;
            if (config.intervalSummaryTableContainerID) { intervalSummaryTableContainerIDSelector = '#' + config.intervalSummaryTableContainerID; }
            intervalSummaryHandler = config.intervalSummaryHandler;
            if (config.resultsTableContainerID) { resultsTableContainerIDSelector = '#' + config.resultsTableContainerID; }
            resultsHandler = config.resultsHandler;
            includeControlPackets = config.includeControlPackets || false;
            bandwidthHistorySize = config.bandwidthHistorySize || 0;
            enableLatencyProbe = config.enableLatencyProbe || false;
            isInitialised = true;
        },

        interceptWebSocketCreation = function (wsFactory, intercept) {
            var superCreate = WebSocketFactory.prototype.createWebSocket;

            wsFactory.__proto__.createWebSocket = (function () {
                return function (location, protocols) {
                    var webSocket = superCreate.call(wsFactory, location, protocols);
                    intercept(webSocket);
                    return webSocket;
                }
            })();
        },

        webSocketMessageEventListener = function (event) {
            var messageBytes = event.data.limit; // event.data is a Kaazing ByteBuffer
            if (includeControlPackets || messageBytes > 20) {
                cumulativePackets++;
                cumulativeBytes = cumulativeBytes + messageBytes;
                intervalPackets.push({
                    bytes: (messageBytes)
                });
            }
        },

        processIntervalPackets = function () {

            var sizes = intervalPackets.map(function (d) {
                return d.bytes
            });

            var packetsPerSecond = Math.round(1000 * intervalPackets.length / profileFrequencyMilliseconds);
            var totalBytes = arrayMathUtility.sum(sizes);
            var kilobytesPerSecond = Math.round(100 * totalBytes / profileFrequencyMilliseconds) / 100; // rounded to 2 decimal points

            if (bandwidthHistorySize) {
                if (inboundBandwidthHistory.length >= bandwidthHistorySize) {
                    inboundBandwidthHistory.shift();
                }

                inboundBandwidthHistory.push({
                    timeSinceStartMilliseconds: Math.floor(Date.now() - profileStartTime),
                    intervalKilobytesPerSecond: kilobytesPerSecond,
                    cumulativeKiloBytes: Math.round(100 * cumulativeBytes / 1000) / 100 // rounded to 2 decimal points
                });
            }

            var intervalStats = {
                inbound: {
                    intervalPackets: (intervalPackets.length),
                    intervalBytes: (totalBytes),
                    intervalMinPacketSizeBytes: arrayMathUtility.min(sizes),
                    intervalMaxPacketSizeBytes: arrayMathUtility.max(sizes),
                    intervalMedianPacketSizeBytes: Math.floor(arrayMathUtility.median(sizes)),
                    intervalMilliseconds: (profileFrequencyMilliseconds),
                    intervalPacketsPerSecond: (packetsPerSecond),
                    intervalKilobytesPerSecond: (kilobytesPerSecond),
                    bandWidthHistory: (inboundBandwidthHistory),
                    cumulativePackets: (cumulativePackets),
                    cumulativeBytes: (cumulativeBytes)
                },
                outbound: {
                    //intervalPackets: 'TODO',
                    //intervalBytes: 'TODO',
                    //intervalMinPacketSizeBytes: 'TODO',
                    //intervalMaxPacketSizeBytes: 'TODO',
                    //intervalMedianPacketSizeBytes: 'TODO',
                    //intervalMilliseconds: 'TODO',
                    //intervalPacketsPerSecond: 'TODO',
                    //intervalKilobytesPerSecond: 'TODO',
                    //bandWidthHistory: 'TODO',
                    //cumulativePackets: 'TODO',
                    //cumulativeBytes: 'TODO'
                }
            };

            // reset collated packets for next interval
            intervalPackets = [];

            return intervalStats;
        },

        buildIntervalSummaryTable = function () {

            var $container = $(intervalSummaryTableContainerIDSelector),
                $table,
                $thead,
                $tbody,
                $tr;

            if (!$container.find('table').length) {
                $table = $('<table>').addClass('table table-striped'); // on the off chance bootstrap is available
                $thead = $('<thead>');
                $tbody = $('<tbody>');

                $tr = $('<tr>');
                $tr.append($('<th>').text('Flow'));
                $tr.append($('<th>').text('Tot Packets'));
                $tr.append($('<th>').text('Tot Size (KB)'));
                $tr.append($('<th>').text('Avg Rate'));
                $tr.append($('<th>').text('Min Size (B)'));
                $tr.append($('<th>').text('Max Size (B)'));
                $tr.append($('<th>').text('Median Size (B)'));
                $tr.append($('<th>').text('Bandwidth'));
                $thead.append($tr);

                $tr = $('<tr>');
                $tr.append($('<td>').text('Inbound'));
                $tr.append($('<td>').attr('id', 'wspIntSumInboundTotPackets'));
                $tr.append($('<td>').attr('id', 'wspIntSumInboundTotKilobytes'));
                $tr.append($('<td>').attr('id', 'wspIntSumInboundPacketsPerSecond'));
                $tr.append($('<td>').attr('id', 'wspIntSumInboundMinPacketSize'));
                $tr.append($('<td>').attr('id', 'wspIntSumInboundMaxPacketSize'));
                $tr.append($('<td>').attr('id', 'wspIntSumInboundMedianPacketSize'));
                $tr.append($('<td>').attr('id', 'wspIntSumInboundKilobytesPerSecond'));
                $tbody.append($tr);

                //$tr = $('<tr>');
                //$tr.append($('<td>').text('Outbound'));
                //$tr.append($('<td>').attr('id', 'wspIntSumOutboundTotPackets'));
                //$tr.append($('<td>').attr('id', 'wspIntSumOutboundTotKilobytes'));
                //$tr.append($('<td>').attr('id', 'wspIntSumOutboundPacketsPerSecond'));
                //$tr.append($('<td>').attr('id', 'wspIntSumOutboundMinPacketSize'));
                //$tr.append($('<td>').attr('id', 'wspIntSumOutboundMaxPacketSize'));
                //$tr.append($('<td>').attr('id', 'wspIntSumOutboundMedianPacketSize'));
                //$tr.append($('<td>').attr('id', 'wspIntSumOutboundKilobytesPerSecond'));
                //$tbody.append($tr);

                $table.append($thead);
                $table.append($tbody);
                $container.append($table);
            }
        },

        updateIntervalSummaryTable = function (intervalStats) {
            $('#wspIntSumInboundTotPackets').text(intervalStats.inbound.cumulativePackets);
            $('#wspIntSumInboundTotKilobytes').text(intervalStats.inbound.cumulativeBytes / 1000);
            $('#wspIntSumInboundPacketsPerSecond').text(intervalStats.inbound.intervalPacketsPerSecond + ' msg/s');
            $('#wspIntSumInboundMinPacketSize').text(intervalStats.inbound.intervalMinPacketSizeBytes);
            $('#wspIntSumInboundMaxPacketSize').text(intervalStats.inbound.intervalMaxPacketSizeBytes);
            $('#wspIntSumInboundMedianPacketSize').text(intervalStats.inbound.intervalMedianPacketSizeBytes);
            $('#wspIntSumInboundKilobytesPerSecond').text(intervalStats.inbound.intervalKilobytesPerSecond + ' KB/s');

            //$('#wspIntSumOutboundTotPackets').text(intervalStats.outbound.cumulativePackets);
            //$('#wspIntSumOutboundTotKilobytes').text(intervalStats.outbound.cumulativeBytes / 1000);
            //$('#wspIntSumOutboundPacketsPerSecond').text(intervalStats.outbound.intervalPacketsPerSecond + ' msg/s');
            //$('#wspIntSumOutboundMinPacketSize').text(intervalStats.outbound.intervalMinPacketSizeBytes);
            //$('#wspIntSumOutboundMaxPacketSize').text(intervalStats.outbound.intervalMaxPacketSizeBytes);
            //$('#wspIntSumOutboundMedianPacketSize').text(intervalStats.outbound.intervalMedianPacketSizeBytes);
            //$('#wspIntSumOutboundKilobytesPerSecond').text(intervalStats.outbound.intervalKilobytesPerSecond + ' KB/s');
        },

        emitIntervalStats = function (intervalStats) {

            // call any interval stats handler registered by the application
            intervalSummaryHandler && intervalSummaryHandler(intervalStats);

            // update any table summary registered by the application
            if (intervalSummaryTableContainerIDSelector) {
                buildIntervalSummaryTable();
                updateIntervalSummaryTable(intervalStats);
            }
        },

        emitResults = function () {

        },

        profile = function () {
            emitIntervalStats(processIntervalPackets());
        },

        setProfileFrequencyMilliseconds = function (value) {
            profileFrequencyMilliseconds = value;
            if (profileIntervalID) { clearInterval(profileIntervalID); }
            profileIntervalID = setInterval(profile, profileFrequencyMilliseconds);
        },

        setIntervalSummaryTableContainerID = function (value) {
            intervalSummaryTableContainerIDSelector = '#' + value;
        },

        setIntervalStatsHandler = function (value) {
            intervalSummaryHandler = value;
        },

        setResultsTableContainerID = function (value) {
            resultsTableContainerIDSelector = '#' + value;
        },

        setResultsHandler = function (value) {
            resultsHandler = value;
        },

        start = function () {
            webSocket = webSocketFactory.wrappedWebSocket; // relies on the app having set this on the JmsConnectionFactory and this being called after connection established
            if (!isInitialised) {
                console.log('Kaazing WebSocket Profiler: Error! Profiler has not been initialised. Call initialise() before starting.');
                return -1;
            } else if (!webSocket) {
                console.log('Kaazing WebSocket Profiler: Error! Unable to start - no WebSocket connection available');
                return -2;
            } else {
                profileStartTime = Date.now();
                cumulativePackets = 0;
                cumulativeBytes = 0;
                intervalPackets = [];
                webSocket.addEventListener('message', webSocketMessageEventListener, false);
                webSocket.addEventListener('send', function () { alert('hello'); }, false);
                profile();
                profileIntervalID = setInterval(profile, profileFrequencyMilliseconds);
                if (debug) { console.log('Kaazing WebSocket Profiler: profiling started'); }
                return 0;
            }
        },

        stop = function () {
            if (debug) { console.log('Kaazing WebSocket Profiler: profiling stopped'); }
            if (webSocket) { webSocket.removeEventListener('message', webSocketMessageEventListener, false); }
            if (profileIntervalID) { clearInterval(profileIntervalID); }
            if (intervalSummaryTableContainerIDSelector) {
                //$(intervalSummaryTableContainerIDSelector).children().fadeOut(function () {
                //    $(intervalSummaryTableContainerIDSelector).empty();
                //});
            }
            // TODO: display final results, and scrollto?
        };


    /****************************************************************
     *   intercept WebSocket creation so we can attach listeners
     ****************************************************************/
    webSocketFactory = new WebSocketFactory();
    interceptWebSocketCreation(webSocketFactory, function (ws) {
        webSocketFactory.wrappedWebSocket = ws;
    });


    /****************************************************************
     *   public interface
     ****************************************************************/
    return {
        initialise: initialise,
        setProfileFrequencyMilliseconds: setProfileFrequencyMilliseconds,
        setIntervalSummaryTableContainerID: setIntervalSummaryTableContainerID,
        setIntervalStatsHandler: setIntervalStatsHandler,
        setResultsTableContainerID: setResultsTableContainerID,
        setResultsHandler: setResultsHandler,
        start: start,
        stop: stop,
        webSocketFactory: webSocketFactory
    };
}());