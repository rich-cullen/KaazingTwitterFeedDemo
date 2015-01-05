$(function () {

    // console object stub for IE8 with no dev tools open etc
    if(typeof console === 'undefined') {
        console = { log: function() { } };
    }

    // 'globals'
    var connection,
        session,
        consumer,
        twitterTopicName = 'twitter_stream',
        countries = [],
        countryCodes = [],
        countryTweetsBarChart,
        barChartData,
        barChartOptions,
        barChartSteps,
        barChartStepWidth,
        barChartStartValue,
        isBarChartBeingRecalibrated = false,
        countryTweetsPieChart,
        $btnStart = $('#btnStart'),
        $btnStop = $('#btnStop');


    // event listeners
    $btnStart.on('click', function (event) {
        subscribeToTopic(twitterTopicName);
        $btnStart.attr('disabled', 'disabled').removeClass('btn-success');
        $btnStop.removeAttr('disabled').addClass('btn-danger');
        toastr.success('Actively monitoring Twitter feed');
    });

    $btnStop.on('click', function (event) {
        if (consumer) {
            consumer.close(function () { console.log('Consumer closed'); });
        }
        $btnStop.attr('disabled', 'disabled').removeClass('btn-danger');
        $btnStart.removeAttr('disabled').addClass('btn-success');
        toastr.warning('Twitter feed monitoring suspended');
    });


    // main prog
    initialiseCountryData();
    initialiseToastr();
    initialiseBarChart();
    initialisePieChart();
    connectToKaazing();


    // function definitions
    function initialiseCountryData() {
        countries = [
            {
                code : 'GB',
                name : 'United Kingdom',
                tweets : 0
            },
            {
                code : 'FR',
                name : 'France',
                tweets : 0
            },
            {
                code : 'DE',
                name : 'Germany',
                tweets : 0
            },
            {
                code : 'CH',
                name : 'Switzerland',
                tweets : 0
            },
            {
                code : 'ES',
                name : 'Spain',
                tweets : 0
            },
            {
                code : 'BE',
                name : 'Belgium',
                tweets : 0
            },
            {
                code : 'IE',
                name : 'Ireland',
                tweets : 0
            },
            {
                code : 'NL',
                name : 'Netherlands',
                tweets : 0
            },
            {
                code : 'SE',
                name : 'Sweden',
                tweets : 0
            },
        ]

        countryCodes = getCountryCodes();
    }

    function initialiseToastr() {
        // toastr.options.positionClass = 'toast-bottom-right';
    }

    function initialiseBarChart() {
        barChartSteps = 10;
        barChartStepWidth = 2;
        barChartStartValue = 0;
        setBarChartOptions(barChartSteps, barChartStepWidth, barChartStartValue);
        setBarChartData(getCountryNames(), getCountryTweetTotals());
        renderBarChart();
    }

    function setBarChartOptions(steps, stepWidth, startValue) {
        barChartOptions = {
            scaleOverride : true,
            scaleSteps : steps,
            scaleStepWidth : stepWidth,
            scaleStartValue : startValue
        }
    }

    function setBarChartData(labels, data) {
        barChartData = {
            labels: labels,
            datasets: [
                {
                    label: 'Tweets by country',
                    fillColor: 'rgba(151,187,205,0.5)',
                    strokeColor: 'rgba(151,187,205,0.8)',
                    highlightFill: 'rgba(151,187,205,0.75)',
                    highlightStroke: 'rgba(151,187,205,1)',
                    data: data
                }
            ]
        }
    }

    function renderBarChart() {
        var ctx = $('#countryTweetsBarChart').get(0).getContext('2d');
        countryTweetsBarChart = new Chart(ctx).Bar(barChartData, barChartOptions);
    }

    function initialisePieChart() {

        var pieChartData = [],
            segment = {};

        for (var i = 0, j = countries.length; i < j; i++) {
            segment = {};
            segment.value = countries[i].tweets;
            segment.color = generateRandomRgbaCode();
            segment.highlight = segment.color.substring(0, segment.color.length -2) + '8)'; // bit hacky but change alpha from 0.5 to 0.8
            segment.label = countries[i].name;
            pieChartData.push(segment);
        }

        var pieChartOptions = {
            legendTemplate : '<ul class="<%=name.toLowerCase()%>-legend list-unstyled"><% for (var i=0; i<segments.length; i++){%><li><span style="background-color:<%=segments[i].fillColor%>">&nbsp;&nbsp;&nbsp;&nbsp;</span>&nbsp;&nbsp;&nbsp;&nbsp;<%if(segments[i].label){%><%=segments[i].label%><%}%></li><%}%></ul>'
        };

        renderPieChart(pieChartData, pieChartOptions);
    }

    function renderPieChart(data, options) {
        var ctx = $('#countryTweetsPieChart').get(0).getContext('2d');
        countryTweetsPieChart = new Chart(ctx).Pie(data, options);
        $('#countryTweetsPieChartLegend').html(countryTweetsPieChart.generateLegend()); // TODO: Style this
    }

    function connectToKaazing() {

        var jmsConnectionFactory = new JmsConnectionFactory('ws://' + location.hostname + ':8001/jms'),
            username = '',
            password = '';

        console.log('Connecting to Kaazing Gateway...');

        try {
            var connectionFuture = jmsConnectionFactory.createConnection(username, password, function () {
                if (!connectionFuture.exception) {
                    try {
                        connection = connectionFuture.getValue();
                        connection.setExceptionListener(handleException);
                        session = connection.createSession(false, Session.AUTO_ACKNOWLEDGE);
                        connection.start(onConnection);
                    }
                    catch (e) {
                        handleException(e);
                    }
                }
                else {
                    handleException(connectionFuture.exception);
                }
            });
        }
        catch (e) {
            handleException(e);
        }
    }

    function handleException(e) {
        toastr.error('Exception - ' + e, 'Application error!');
        console.log('EXCEPTION: ' + e);
    }

    function onConnection() {
        $btnStart.removeAttr('disabled').addClass('btn-success');
        toastr.success('Connection to Kaazing Gateway initiated successfully'); //, 'Gateway Connection Initiated');
        console.log('Connected');          
    }

    function subscribeToTopic(topicName) {
        var destination = session.createTopic('/topic/' + topicName);
        consumer = session.createConsumer(destination);
        consumer.setMessageListener(onMessage);
        console.log('Subscribed to topic: ' + twitterTopicName);
    }

    function onMessage(textMessage) {
        var tweet = JSON.parse(textMessage.getText());

        if (!tweet || !tweet.place) return;

        var countryIndex = $.inArray(tweet.place.country_code, countryCodes); // check this is a country we're interested in
        if (countryIndex == -1) return;

        // check if any redrawing already underway before attempting to update tables, otherwise ignore tweet
        if (!isBarChartBeingRecalibrated) {
            countries[countryIndex].tweets++;
            updateBarChart(countryIndex);
            updatePieChart(countryIndex);
            console.log(tweet.place.country_code + ': @' + tweet.user.screen_name + ': ' + tweet.text);
        }
    }
    
    function updateBarChart(countryIndex) {
        var bar = countryTweetsBarChart.datasets[0].bars[countryIndex];
        bar.value++;

        if (bar.value > (barChartSteps * barChartStepWidth)) { // we've gone off the chart - recalibrate and redraw

            // NB. the following clearup is required to prevent rendering issues but may cause individual clients to display different results due to redraw time etc
            isBarChartBeingRecalibrated = true;
            countryTweetsBarChart.destroy();
            $('#countryTweetsBarChart').remove();
            $('#countryTweetsBarChartContainer').append('<canvas id="countryTweetsBarChart" width="600" height="300"></canvas>');

            // redraw bar chart from scratch
            var canvas = $('#countryTweetsBarChart').get(0);
            var context = canvas.getContext('2d');
            
            $('#countryTweetsBarChart').fadeOut(function () {
                setBarChartData(getCountryNames(), getCountryTweetTotals());
                barChartStepWidth = barChartStepWidth * 2;
                setBarChartOptions(barChartSteps, barChartStepWidth, barChartStartValue);
                renderBarChart();
                $('#countryTweetsBarChart').fadeIn();
                isBarChartBeingRecalibrated = false;
            });
            
        } else {
            countryTweetsBarChart.update(); // no recalibration required, just update
        }
    }

    function updatePieChart(countryIndex) {
        var segment = countryTweetsPieChart.segments[countryIndex];
        segment.value++;
        countryTweetsPieChart.update();
    }

    // helpers
    function getCountryCodes() {
        var countryCodes = [];
        for (var i = 0, j = countries.length; i < j; i++) {
            countryCodes.push(countries[i].code);
        }
        return countryCodes;
    }

    function getCountryNames() {
        var countryNames = [];
        for (var i = 0, j = countries.length; i < j; i++) {
            countryNames.push(countries[i].name);
        }
        return countryNames;
    }

    function getCountryTweetTotals() {
        var countryTotals= [];
        for (var i = 0, j = countries.length; i < j; i++) {
            countryTotals.push(countries[i].tweets);
        }
        return countryTotals;
    }

    function generateRandomRgbaCode() {
        return 'rgba(' + Math.floor(Math.random() * 255) + ',' + Math.floor(Math.random() * 255) + ',' + Math.floor(Math.random() * 255) + ',0.5)';
    }
});