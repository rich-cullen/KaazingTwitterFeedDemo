/****************************************************************
 *   Kaazing WebSocket Profiler
 ****************************************************************/
// TODO: wrapped websocket should be created internally, need to extend the pattern and intercept JmsConnectionFactory.createConnection more intelligently
// TODO: capture outbound traffic also - easiest way to do this?
// TODO: add latency probe like in FX demo http://demo.kaazing.com/forex/ - NB. This might require a gateway echo service etc
// TODO: handle connectivity breaks
// TODO: tighten defensive coding in compatibility check stub implementation, initialisation, setters and Array maths helper
// TODO: Optional - This could be a standalone widget and render its own UI buttons - would we want to include bootstrap in that case?
// TODO: Optional - draw table using DOM API rather than jQuery

// TODO: When finished - document config, usage and dependencies

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
            //webSocketFactory: new WebSocketFactory() // TODO: obviously this ain't going to work if there's now WebSocketFactory
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
        profileStartTime,
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
        inboundBandwidthHistory = [];


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

        generateIntervalStats = function () {

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
                    cumulativeKilobytes: Math.round(100 * cumulativeBytes / 1000) / 100 // rounded to 2 decimal points
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
                $caption,
                $thead,
                $tbody,
                $tr,
                generateEmptyIntervalSummaryRow;

            if (!$container.find('table').length) {
                $table = $('<table>').addClass('table table-striped'); // if bootstrap css is available
                $caption = $('<caption>').text('Network Profiler Session & Interval Summary');
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

                generateEmptyIntervalSummaryRow = function (flowDirection) {
                    $tr = $('<tr>');
                    $tr.append($('<td>').text(flowDirection + 'bound'));
                    $tr.append($('<td>').attr('id', 'kwpIntSum' + flowDirection + 'TotPackets'));
                    $tr.append($('<td>').attr('id', 'kwpIntSum' + flowDirection + 'TotKilobytes'));
                    $tr.append($('<td>').attr('id', 'kwpIntSum' + flowDirection + 'PacketsPerSecond'));
                    $tr.append($('<td>').attr('id', 'kwpIntSum' + flowDirection + 'MinPacketSize'));
                    $tr.append($('<td>').attr('id', 'kwpIntSum' + flowDirection + 'MaxPacketSize'));
                    $tr.append($('<td>').attr('id', 'kwpIntSum' + flowDirection + 'MedianPacketSize'));
                    $tr.append($('<td>').attr('id', 'kwpIntSum' + flowDirection + 'KilobytesPerSecond'));
                    return $tr
                };

                $tbody.append(generateEmptyIntervalSummaryRow('In'));
                $tbody.append(generateEmptyIntervalSummaryRow('Out'));

                $table.append($caption);
                $table.append($thead);
                $table.append($tbody);
                $container.append($table);
            }
        },

        updateIntervalSummaryTable = function (intervalStats) {
            $('#kwpIntSumInTotPackets').text(intervalStats.inbound.cumulativePackets);
            $('#kwpIntSumInTotKilobytes').text(intervalStats.inbound.cumulativeBytes / 1000);
            $('#kwpIntSumInPacketsPerSecond').text(intervalStats.inbound.intervalPacketsPerSecond + ' msg/s');
            $('#kwpIntSumInMinPacketSize').text(intervalStats.inbound.intervalMinPacketSizeBytes);
            $('#kwpIntSumInMaxPacketSize').text(intervalStats.inbound.intervalMaxPacketSizeBytes);
            $('#kwpIntSumInMedianPacketSize').text(intervalStats.inbound.intervalMedianPacketSizeBytes);
            $('#kwpIntSumInKilobytesPerSecond').text(intervalStats.inbound.intervalKilobytesPerSecond + ' KB/s');

            //$('#kwpIntSumOutboundTotPackets').text(intervalStats.outbound.cumulativePackets);
            //$('#kwpIntSumOutboundTotKilobytes').text(intervalStats.outbound.cumulativeBytes / 1000);
            //$('#kwpIntSumOutboundPacketsPerSecond').text(intervalStats.outbound.intervalPacketsPerSecond + ' msg/s');
            //$('#kwpIntSumOutboundMinPacketSize').text(intervalStats.outbound.intervalMinPacketSizeBytes);
            //$('#kwpIntSumOutboundMaxPacketSize').text(intervalStats.outbound.intervalMaxPacketSizeBytes);
            //$('#kwpIntSumOutboundMedianPacketSize').text(intervalStats.outbound.intervalMedianPacketSizeBytes);
            //$('#kwpIntSumOutboundKilobytesPerSecond').text(intervalStats.outbound.intervalKilobytesPerSecond + ' KB/s');
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

        profile = function () {
            emitIntervalStats(generateIntervalStats());
        },

        generateResults = function (profileSessionDurationMilliseconds) {
            var factorHour = 3600000 / profileSessionDurationMilliseconds,
                factorDay = 86400000 / profileSessionDurationMilliseconds;

            return  {
                profileSessionDurationSeconds: Math.floor(profileSessionDurationMilliseconds / 1000),
                packetsProfileSession: cumulativePackets,
                packetsPerHour: Math.floor(cumulativePackets * factorHour),
                packetsPerDay: Math.floor(cumulativePackets * factorDay),
                megabytesProfileSession: Math.round(1000 * cumulativeBytes / 1000000) / 1000, // rounded to 3 decimal points
                megabytesPerHour: Math.round(1000 * (cumulativeBytes * factorHour) / 1000000) / 1000, // rounded to 3 decimal points
                megabytesPerDay: Math.round(1000 * (cumulativeBytes * factorDay) / 1000000) / 1000 // rounded to 3 decimal points
            }
        },

        buildResultsTable = function () {
            var $container = $(resultsTableContainerIDSelector),
                $table,
                $caption,
                $thead,
                $tbody,
                $tr,
                generateEmptyResultsRow = function (userCount) {
                    $tr = $('<tr>');
                    $tr.append($('<td>').text(userCount));
                    $tr.append($('<td>').attr('id', 'kwpResultsIn' + userCount + 'UserProfileSessionMegabytes'));
                    $tr.append($('<td>').attr('id', 'kwpResultsIn' + userCount + 'UserHourMegabytes'));
                    $tr.append($('<td>').attr('id', 'kwpResultsIn' + userCount + 'UserDayMegabytes'));
                    return $tr;
                };

            if (!$container.find('table').length) {
                $table = $('<table>').addClass('table table-striped'); // if bootstrap css is available
                $caption = $('<caption>').text('Inbound Data Network Utilisation Projection');
                $thead = $('<thead>');
                $tbody = $('<tbody>');

                $tr = $('<tr>');
                $tr.append($('<th>').text('Clients'));
                $tr.append($('<th>').attr('id', 'kwpResultsInPerSessionHeader').text('Per Session'));
                $tr.append($('<th>').text('Per Hour'));
                $tr.append($('<th>').text('Per Day'));
                $thead.append($tr);

                $tbody.append(generateEmptyResultsRow(1));
                $tbody.append(generateEmptyResultsRow(500));
                $tbody.append(generateEmptyResultsRow(1000));

                $table.append($caption);
                $table.append($thead);
                $table.append($tbody);
                $container.append($table);
            }
        },

        updateResultsTable = function (results) {
            var populateResultsRow = function (userCount) {
                $('#kwpResultsIn' + userCount + 'UserProfileSessionMegabytes').text(results.megabytesProfileSession * userCount + ' (MB)'); // TODO: round
                $('#kwpResultsIn' + userCount + 'UserHourMegabytes').text(results.megabytesPerHour * userCount + ' (MB)');
                $('#kwpResultsIn' + userCount + 'UserDayMegabytes').text(results.megabytesPerDay * userCount + ' (MB)');
            };

            $('#kwpResultsInPerSessionHeader').text('Per Session (' + results.profileSessionDurationSeconds + ' seconds)');
            populateResultsRow(1);
            populateResultsRow(500);
            populateResultsRow(1000);
        },

        emitResults = function (results) {

            // call any results handler registered by the application
            resultsHandler && resultsHandler(results);

            // update any table summary registered by the application
            if (resultsTableContainerIDSelector) {
                buildResultsTable();
                updateResultsTable(results);
            }
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
            webSocket = webSocketFactory.wrappedWebSocket; // NB. relies app already setting this as the JmsConnectionFactory's WebSocketFactory, and then calling start() AFTER connection is established
            if (!isInitialised) {
                console.log('Kaazing WebSocket Profiler: Error! Profiler has not been initialised. Call initialise() before starting.');
                return -1;
            } else if (!webSocket) {
                console.log('Kaazing WebSocket Profiler: Error! Unable to start - no WebSocket connection available');
                return -2;
            } else {

                // remove results from any previous profiling session
                if (resultsTableContainerIDSelector) {
                    $(resultsTableContainerIDSelector).children().fadeOut(function () {
                        $(resultsTableContainerIDSelector).empty();
                    });
                }

                profileStartTime = Date.now();
                cumulativePackets = 0;
                cumulativeBytes = 0;
                intervalPackets = [];
                webSocket.addEventListener('message', webSocketMessageEventListener, false);
                profile();
                profileIntervalID = setInterval(profile, profileFrequencyMilliseconds);
                if (debug) { console.log('Kaazing WebSocket Profiler: profiling started'); }
                return 0;
            }
        },

        stop = function () {
            if (webSocket) { webSocket.removeEventListener('message', webSocketMessageEventListener, false); }
            if (profileIntervalID) { clearInterval(profileIntervalID); }
            emitResults(generateResults(Date.now() - profileStartTime));
            if (debug) { console.log('Kaazing WebSocket Profiler: profiling stopped'); }
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