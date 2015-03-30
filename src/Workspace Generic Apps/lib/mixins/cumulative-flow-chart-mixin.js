/** This is a mixin for using highcharts with rally data data after it is run through the lookback calculator */
(function(){
	var Ext = window.Ext4 || window.Ext;

	var ChartsTooltipDatemap = {}; //closure variable that maps the x values to date strings -- per chart

	Ext.define('CumulativeFlowChartMixin', {
		requires:['IntelRallyApp', 'IntelWorkweek'],

		_defaultCumulativeFlowChartConfig: {
			chart: {
				defaultSeriesType: "area",
				zoomType: "xy"
			},
			colors: [
				'#ABABAB', 
				'#E57E3A', 
				'#E5D038', 
				'#0080FF', 
				'#3A874F', 
				'#26FF00',
				'#000000'
			],	
			xAxis: {
				tickmarkPlacement: "on",
				title: {
					text: "Days",
					margin: 10
				},
				labels: {
					y: 20
				}
			},
			yAxis: {
				title: {
					text: "Points"
				},
				labels: {
					x: -5,
					y: 4
				}
			},			
			tooltip: {
				formatter: function () {
					var sum = 0,
						datemap = ChartsTooltipDatemap[this.series.chart.container.id];
					for(var i=4; i>= this.series.index; --i) 
						sum += this.series.chart.series[i].data[this.point.x].y;
					return "<b>" + this.x + '</b>' + (datemap ? ' (' + datemap[this.point.x] + ')' : '') + 
						"<br /><b>" + this.series.name + "</b>: " + ((100*this.y>>0)/100) +
						(this.series.index <=4 ? "<br /><b>Total</b>: " + ((100*sum>>0)/100) : '');
				}
			},
			plotOptions: {
				series: {
					marker: {
						enabled: false,
						states: {
							hover: {
								enabled: true
							}
						}
					},
					groupPadding: 0.01
				},
				area: {
					stacking: 'normal',
					lineColor: '#666666',
					lineWidth: 2,
					marker: {
						enabled: false
					}
				}
			}
		},
		_getCumulativeFlowChartColors: function(){
			var me=this,
				colors = me._defaultCumulativeFlowChartConfig.colors,
				scheduleStates = me.ScheduleStates;
			if(scheduleStates.length >= 5) return {colors: colors};
			else return {colors: colors.slice(0, scheduleStates.length).concat(colors.slice(scheduleStates.length + 1))};
		},
		_getValidTrendTypes: function(){
			return [
				'FromZero', 
				'FromStartAccepted', 
				'FromStartWork', 
				'LastWeek', 
				'LastSprint', 
				'LinearRegression', 
				'LinearRegressionFromStartAccepted',
				'LinearRegressionFromStartWork'
			];
		},
		__addProjectedTrendline: function(data, options){
			var me=this,
				totalPoints = options.totalPoints,
				trendType = options.trendType,
				validTypes = me._getValidTrendTypes(),
				slope, intercept, X, Y, 
				scheduleStateSeries  = _.filter(data.series, function(s){ return me.ScheduleStates.indexOf(s.name) > -1; }),
				scheduleStatesSumList = _.times(scheduleStateSeries[0].length, function(n){ 
					return _.reduce(scheduleStateSeries, function(sum, s){ return sum + (s.data[n] || 0); }, 0);
				});
			trendType = _.find(validTypes, function(type){ return type == trendType; }) || validTypes[0];
				
			//initialize projected trendline
			var topScheduleState = me.ScheduleStates.slice(-1)[0],
				topScheduleStateSeries = _.find(data.series, function(s){ return s.name === topScheduleState; }), i, len,
				projectedTrend = {type:'spline', dashStyle:'Solid', name:'Projected', data:topScheduleStateSeries.data.slice()},
				begin=0,
				end=projectedTrend.data.length-1;
		
			if(trendType == 'FromZero'){
				for(i=end;i>=begin;--i) //start at the END, not at begin+1 (can go from 0 to 10 to 0. so start at last 0)
					if(projectedTrend.data[i]!==0){
						end = i; break; }
				slope = (end===begin) ? 0 : (projectedTrend.data[end] - projectedTrend.data[begin])/(end-begin);
				projectedTrend.data = _.map(projectedTrend.data, function(p, j){ 
					return (100*(projectedTrend.data[begin] + (j-begin)*slope)>>0)/100;
				});	
			}
			if(trendType == 'FromStartAccepted'){
				for(i=1;i<projectedTrend.data.length;++i)
					if(projectedTrend.data[i]!==null && projectedTrend.data[i] !==0){
						begin = i-1; break; }
				for(i=end;i>=begin;--i) //start at the END, not at begin+1 (can go from 0 to 10 to 0. so start at last 0)
					if(projectedTrend.data[i]!==0){
						end = i; break; }
				slope = (end===begin) ? 0 : (projectedTrend.data[end] - projectedTrend.data[begin])/(end-begin);
				projectedTrend.data = _.map(projectedTrend.data, function(p, j){ 
					var pt = (100*(projectedTrend.data[begin] + (j-begin)*slope)>>0)/100;
					return pt < 0 ? 0 : pt;
				});
			}
			if(trendType == 'FromStartWork'){
				for(i=1;i<scheduleStatesSumList.length;++i)
					if(scheduleStatesSumList[i]!==null && scheduleStatesSumList[i] !==0){
						begin = i-1; break; }
				for(i=end;i>=begin;--i) //start at the END, not at begin+1 (can go from 0 to 10 to 0. so start at last 0)
					if(projectedTrend.data[i]!==0){
						end = i; break; }
				slope = (end===begin) ? 0 : (projectedTrend.data[end] - projectedTrend.data[begin])/(end-begin);
				projectedTrend.data = _.map(projectedTrend.data, function(p, j){ 
					var pt = (100*(projectedTrend.data[begin] + (j-begin)*slope)>>0)/100;
					return pt < 0 ? 0 : pt;
				});
			}
			if(trendType == 'LastWeek'){
				for(i=end;i>=begin;--i) //start at the END, not at begin+1 (can go from 0 to 10 to 0. so start at last 0)
					if(projectedTrend.data[i]!==0){
						end = i; break; }
				begin = (end - 5 < 0 ? 0 : end - 5);
				slope = (end===begin) ? 0 : (projectedTrend.data[end] - projectedTrend.data[begin])/(end-begin);
				projectedTrend.data = _.map(projectedTrend.data, function(p, j){ 
					var pt = (100*(projectedTrend.data[begin] + (j-begin)*slope)>>0)/100;
					return pt < 0 ? 0 : pt;
				});	
			}
			if(trendType == 'LastSprint'){
				for(i=end;i>=begin;--i) //start at the END, not at begin+1 (can go from 0 to 10 to 0. so start at last 0)
					if(projectedTrend.data[i]!==0){
						end = i; break; }
				begin = (end - 10 < 0 ? 0 : end - 10);
				slope = (end===begin) ? 0 : (projectedTrend.data[end] - projectedTrend.data[begin])/(end-begin);
				projectedTrend.data = _.map(projectedTrend.data, function(p, j){ 
					var pt = (100*(projectedTrend.data[begin] + (j-begin)*slope)>>0)/100;
					return pt < 0 ? 0 : pt;
				});	
			}
			if(trendType == 'LinearRegression'){
				//(Xt*X)^-1*Xt*Y = b 
				for(i=end;i>=begin;--i) //start at the END, not at begin+1 (can go from 0 to 10 to 0. so start at last 0)
					if(projectedTrend.data[i]!==0){
						end = i; break; }
				X = $M(_.map(projectedTrend.data.slice(0, end), function(p, j){ return [1, j]; }));
				Y = $M(_.map(projectedTrend.data.slice(0, end), function(p){ return p; }));
				b = X.transpose().multiply(X).inverse().multiply(X.transpose().multiply(Y));
				slope = b.elements[1][0];
				intercept = b.elements[0][0];

				projectedTrend.data = _.map(projectedTrend.data, function(p, j){ 
					var pt = (100*(intercept + j*slope)>>0)/100;
					return pt < 0 ? 0 : pt;
				});	
			}
			if(trendType == 'LinearRegressionFromStartAccepted'){
				//(Xt*X)^-1*Xt*Y = b 
				for(i=1;i<projectedTrend.data.length;++i)
					if(projectedTrend.data[i]!==null && projectedTrend.data[i] !==0){
						begin = i-1; break; }
				for(i=end;i>=begin;--i) //start at the END, not at begin+1 (can go from 0 to 10 to 0. so start at last 0)
					if(projectedTrend.data[i]!==0){
						end = i; break; }
				X = $M(_.map(projectedTrend.data.slice(begin, end), function(p, j){ return [1, j]; }));
				Y = $M(_.map(projectedTrend.data.slice(begin, end), function(p){ return p; }));
				b = X.transpose().multiply(X).inverse().multiply(X.transpose().multiply(Y));
				slope = b.elements[1][0];
				intercept = b.elements[0][0];

				projectedTrend.data = _.map(projectedTrend.data, function(p, j){ 
					var pt = (100*(intercept + (j-begin)*slope)>>0)/100;
					return pt < 0 ? 0 : pt;
				});	
			}
			if(trendType == 'LinearRegressionFromStartWork'){
				for(i=1;i<scheduleStatesSumList.length;++i)
					if(scheduleStatesSumList[i]!==null && scheduleStatesSumList[i] !==0){
						begin = i-1; break; }
				for(i=end;i>=begin;--i) //start at the END, not at begin+1 (can go from 0 to 10 to 0. so start at last 0)
					if(projectedTrend.data[i]!==0){
						end = i; break; }
				X = $M(_.map(projectedTrend.data.slice(begin, end), function(p, j){ return [1, j]; }));
				Y = $M(_.map(projectedTrend.data.slice(begin, end), function(p){ return p; }));
				b = X.transpose().multiply(X).inverse().multiply(X.transpose().multiply(Y));
				slope = b.elements[1][0];
				intercept = b.elements[0][0];

				projectedTrend.data = _.map(projectedTrend.data, function(p, j){ 
					var pt = (100*(intercept + (j-begin)*slope)>>0)/100;
					return pt < 0 ? 0 : pt;
				});	
			}
			
			//apply label to correct point if needed IGNORE FIRST POINT!
			for(i=1,len=projectedTrend.data.length; i<len;++i){
				if(projectedTrend.data[i] >= totalPoints){
					projectedTrend.data[i] = {
						color:'red',
						marker:{
							enabled:true,
							lineWidth:4,
							symbol:'circle',
							fillColor:'red',
							lineColor:'red'
						},
						y: projectedTrend.data[i]
					};
					break;
				}	
			}
			return projectedTrend;
		},
		_updateCumulativeFlowChartData: function(data, options){
			_.merge({}, options);
			var me = this, 
				now = new Date(),
				trendType = options.trendType,
				hideTrends = options.hideTrends,
				datemap = [];

			//get ideal trendline if release has started
			var totalPoints = (new Date(data.categories[0]) > now ? 0 : 
					_.reduce(data.series, function(sum, s){return sum + (s.data[s.data.length-1] || 0); 
				}, 0) || 0),
				idealTrend, ratio;
				
			if(!hideTrends){
				idealTrend = {type:'spline', dashStyle:'Solid', name:'Ideal', data:new Array(data.categories.length)};
				ratio = (totalPoints/(data.categories.length-1)) || 0; //for NaN
				idealTrend.data = _.map(idealTrend.data, function(e, i){ return Math.round(100*(0 + i*ratio))/100; });
			}
			
			//zero future points, convert to workweeks, and set datemap
			_.each(data.categories, function(c, i, a){
				var d = new Date(c);
				a[i] = 'ww' + me._getWorkweek(d);
				datemap[i] = c;
				if(d>now){
					_.each(data.series, function(s, j){
						s.data = s.data.slice(0, i).concat(_.map(new Array(a.length - i), function(){ return 0; }));
					});
				}
			});

			if(!hideTrends){
				var projectedTrend = me.__addProjectedTrendline(data, {totalPoints: totalPoints, trendType: trendType});
				data.series.push(projectedTrend);
				data.series.push(idealTrend);
			}		
			data.datemap = datemap;
			
			return data;
		},
		_getCumulativeFlowChartTicks: function(startDate, endDate, width){
			var pixelTickWidth = 40,
				ticks = width/pixelTickWidth>>0,
				oneDay = 1000*60*60*24,
				days = (endDate*1 - startDate*1)/(oneDay*5/7)>>0, //only workdays
				interval = ((days/ticks>>0)/5>>0)*5;
			return (interval < 5) ? 5 : interval; //make it weekly at the minimum
		},
		_setCumulativeFlowChartDatemap: function(chartContainerId, datemap){
			ChartsTooltipDatemap[chartContainerId] = datemap;
		}
	});
}());