Ext.define('CustomApp', {
    extend: 'Rally.app.App',
	
	/****************************************************** SHOW ERROR/TEXT MESSAGE ********************************************************/
	_showError: function(text){
		if(this.errMessage) this.remove(this.errMessage);
		this.errMessage = this.add({xtype:'text', text:text});
	},
	
	/************************************************** DATA LOADING/Parsing METHODS **********************************************/
	
	_loadAllProjects: function(cb){
		var me = this, TSMap = {}, // {trainName: {train:<trainRecord>, scrums:[<scrumRecords>]}}
			trainName, split;
		function loadChildren(project, _cb){
			Ext.create('Rally.data.wsapi.Store',{
				model: 'Project',
				autoLoad:true,
				remoteSort:false,
				limit:Infinity,
				fetch: ['ObjectID', 'Parent', 'Name', 'TeamMembers'],
				context:{
					workspace: me.getContext().getWorkspace()._ref,
					project: null
				},
				filters:[{
						property:'Parent.ObjectID',
						value: project.get('ObjectID')
					}
				],
				listeners: {
					load: {
						fn: function(projectStore, projectRecords){
							if(projectRecords.length === 0) {
								split = project.get('Name').split(' - ');
								if(split.length>1){
									trainName = split[1].split('-')[0];
									if(TSMap[trainName]) TSMap[trainName].scrums.push(project);
								}
								_cb();
							} else {
								split = project.get('Name').split(' ART ');
								if(split.length > 1){
									trainName = split[0];
									if(!TSMap[trainName]) TSMap[trainName] = {train:null, scrums:[]};
									TSMap[trainName].train = project;
								}
								var finished = 0;
								var done = function(){ if(++finished === projectRecords.length) _cb(); };
								projectRecords.forEach(function(c){ loadChildren(c, done); });
							}
						},
						single:true
					}
				}
			});
		}
		Ext.create('Rally.data.wsapi.Store',{
			model: 'Project',
			autoLoad:true,
			remoteSort:false,
			pageSize:1,
			limit:1,
			fetch: ['Name', 'ObjectID'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[{
					property:'Name',
					value: 'All Scrums'
				}
			],
			listeners:{
				load:{
					fn: function(ps, recs){
						loadChildren(recs[0], function(){ 
							me.TSMap = TSMap;
							console.log('TSMap loaded', TSMap);
							cb(); 
						});
					},
					single:true
				}
			}
		});
	},
	
	/* 
		(string), <object/record/item>, [array]
		TSMap = {
			(trainName): {
				train: <trainRecord>
				scrums: {
					(type): {
						self: [<scrumRecords in train>]
						dep: {
							(otherTrianName): [<scrumRecords dependencies in other train>]
						}
					}
				}
			}
		}
	*/			
	_applyTeamNameFilters: function(cb){
		var me = this, oldTSMap = me.TSMap, newTSMap = {}, map = me._isMap,
			contains = function(str, sub){ return str.indexOf(sub) > -1; },
			tn, dep, type, name, trains;
		for(tn in oldTSMap){
			newTSMap[tn] = {train:oldTSMap[tn].train, scrums:{}};
			for(type in map){ newTSMap[tn].scrums[type] = {self:[], dep:{/*other tn, same type*/}}; } }
		for(tn in oldTSMap){
			oldTSMap[tn].scrums.forEach(function(scrum){
				name = scrum.get('Name');
				trains = _.filter(name.split(' - ')[1].split('-').slice(1), function(s){ return !s.match(/[\(\)\s]/); });
				for(var type in map){
					if(_.find(map[type].is, function(t){ return contains(name, t); })){
						if(!_.find(map[type].isnot, function(t){ return contains(name, t); })){
							newTSMap[tn].scrums[type].self.push(scrum);
							trains.forEach(function(tn2){ 
								dep = newTSMap[tn2].scrums[type].dep; 
								if(!dep[tn]) dep[tn] = []; 
								dep[tn].push(scrum);
							});
							return;
						}
					}
				}
			});
		}
		me.TSMap = newTSMap;
		console.log('new TSMap loaded', newTSMap);
		cb();
	},

	_isMap: {
		TMM : { is : ['TMM', 'EVG', 'Evergreen'], isnot : [] },
		TVPV : { is : ['TVPV', 'Trace'], isnot : [] },
		Fuse : { is : ['Fuse', 'FOG'], isnot : [] },
		Func : { is : ['Func', 'GFX', 'Writing', 'FTW', 'SBFT', 'Core', 'UnCore', 'IPU'], isnot : ['Boot'] },
		Scan : { is : ['Scan', 'ATPG', 'Struct', 'DFX'], isnot : ['Infra'] },
		Cache : { is : ['Cache', 'Array'], isnot : [] },
		Reset : { is : ['Reset', 'HTD', 'Simode'], isnot : [] },
		'P/T' : { is : ['Power', 'PTA'], isnot : ['Performance'] },
		PLL : { is : ['PLL'], isnot : [] },
		SIO : { is : ['IO', 'Serial', 'Analog '], isnot : ['MIO', 'Memory', 'Func'] },
		MIO : { is : ['MIO', 'DDR', 'Memory'], isnot : [] },
		'S/C TPI' : { is : ['TP DevOps', 'Program', 'Sort'], isnot : ['BinC', 'TPV'] },
		'MPV/PPV' : { is : ['PPV', 'TPV', 'MPV'], isnot : [] },
		'Yield/BS' : { is : ['Yield', 'Binsplit', 'PHI', 'Binning', 'BinC', 'Performance', 'ISSG'], isnot : [] }
	},
	
	_orgMap: {
		SCI	: ['TMM', 'TVPV', 'Fuse'],
		DCD	: ['Reset', 'Scan', 'Func', 'Cache'],
		ACD	: ['P/T', 'PLL', 'SIO','MIO'],
		TPI	: ['S/C TPI'],
		MPV	: ['MPV/PPV'],
		PHI	: ['Yield/BS']
	},
	
	/************************************************** SAVING AND LOADING TO THE APP PREFS **********************************************/
	
	_defaultGroupings: [['Alpha', 'Charlie'], ['Bravo', 'Delta'], ['Romeo', 'Golf'], ['Hotel', 'Foxtrot'], ['Juliet', 'Kilo']],

	_getSettings: function(cb){ //parse all settings too
		var me = this;
		Rally.data.PreferenceManager.load({
			appID: me.getAppId(),
			success: function(settings) {
				for(var key in settings){
					try{ settings[key] = JSON.parse(settings[key]); }
					catch(e){ delete settings[key]; }
				}
				console.log(settings);
				cb(settings);
			}
		});
	},
	
	_saveSettings: function(cb){ // stringify all settings too
		var me = this, 
			settings = Ext.clone(me.Settings);
		for(var key in settings) 
			settings[key] = JSON.stringify(settings[key]);	
		Rally.data.PreferenceManager.update({
			appID: me.getAppId(),
			settings: settings,
			success: cb,
			scope:me
		});
	},
		
	_getGroupings: function(){ //gets groupings from settings and adds extra trains to it
		var me = this;
		var groupings = me.Settings.groupings || me._defaultGroupings.slice(0);
		//var groupings = me._defaultGroupings.slice(0); //to reset default
		_.each(Object.keys(me.TSMap), function(tn){ //make sure all trains are accounted for
			if(!_.find(groupings, function(group){ return group.indexOf(tn) > -1; }))
				groupings.push([tn]);
		});
		return groupings;
	},
	
	_setGroupings: function(groupings, cb){ //sets settings groupings
		var me = this;
		me.Settings.groupings = groupings;
		me._saveSettings(cb);
	},
	
	_getExpected: function(tnsInGroup, type){
		var me = this, name = tnsInGroup.sort().join('-');
		return me.Settings[name] ? (me.Settings[name][type] || 0)*1 : 0;
	},
	
	_setExpected: function(tnsInGroup, type, expected, cb){
		var me = this, name = tnsInGroup.sort().join('-');
		if(!me.Settings[name]) me.Settings[name] = {};
		me.Settings[name][type] = expected;
		me._saveSettings(cb);
	},
	
	/******************************************************* LAUNCH/UPDATE APP********************************************************/
	launch: function(){
		var me = this;
		me._showError('Loading Data...');
		me._loadAllProjects(function(){	
			me._applyTeamNameFilters(function(){
				me._getSettings(function(settings){
					me.Settings = settings;
					me.TrainGroupings = me._getGroupings();
					//me._setGroupings(me.TrainGroupings); //for resetting groups
					me.removeAll();
					me._loadGrid();
				});
			});
		});
	},
	
	/******************************************************* RENDER ********************************************************/
	_clearToolTip: function(){
		var me = this;
		if(me.tooltip){
			me.tooltip.panel.hide();
			me.tooltip.triangle.hide();
			me.tooltip.panel.destroy();
			me.tooltip.triangle.destroy();
			delete me.tooltip;
		}
	},
	
	_loadGrid: function(){
		var me = this;
	
		/*********************************************************** Helpers **********************************************/
		function selfCount(self){
			return _.reduce(self, function(sum, scrum){ return sum + scrum.get('TeamMembers').Count; }, 0);
		}
		
		function countString(dep, self){
			return ((self || '') + ((dep.length) ? (self ? ' + ' : '') + dep : '')) || 0;
		}
		
		function getGroupCount(group){
			var tns = _.map(group, function(g){ return g.tn; }), 
				dep = {},
				self = _.reduce(group, function(sum, tr){
					var s = tr.scrums;
					_.each(Object.keys(s.dep), function(tn){ if(tns.indexOf(tn) === -1) dep[tn]=1; });
					return sum + selfCount(tr.scrums.self);
				}, 0);
			return {dep:dep, self:self};
		}	
		
		function getSumOfExpecteds(row){
			return _.reduce(_.filter(Object.keys(row.data), function(key){ return key.match(/Expected/); }), function(sum, key){
				return sum + 1*row.data[key];
			}, 0);
		}
		
		function getSumOfGroupCounts(row){
			return _.reduce(row.data.Groups, function(sum, group){ return sum + getGroupCount(group).self; }, 0);
		}
		
		function columnWrap(val){
			return '<div style="white-space:normal !important;">'+ val +'</div>';
		}

		/*********************************************************** Store/Data creation **********************************************/
		var rowData = _.map(Object.keys(me._isMap), function(type){
			return _.reduce(me.TrainGroupings, function(rowData, tnsInGroup, i){
				rowData['Expected/' + tnsInGroup.sort().join('-')] = me._getExpected(tnsInGroup, type);
				rowData.Groups[i] = [];
				_.each(tnsInGroup, function(tn){ 
					rowData[tn] = me.TSMap[tn].scrums[type]; 
					rowData.Groups[i].push({tn:tn, train:me.TSMap[tn].train, scrums:me.TSMap[tn].scrums[type]});
				});
				return rowData;
			},{
				Org: _.find(Object.keys(me._orgMap), function(org){ 
					return me._orgMap[org].indexOf(type) > -1; 
				}),
				Type: type,
				Groups: {}
			});
		});	
		console.log('rows created', rowData);
		
		me.CustomStore = Ext.create('Ext.data.Store', {
			data: rowData,
			model: Ext.define('TmpModel'+Math.floor(100000*Math.random()), {
				extend:'Ext.data.Model', 
				fields: Object.keys(rowData[0])
			}),
			autoSync:true,
			limit:Infinity,
			proxy: 'memory'
		});
		
		/*********************************************************** Grid config **********************************************/
		
		//TODO: next, color coding cells, add tooltip, add drag-n-drop to switch groupings, dont make it look ugly
		
		var columnCfgs = _.reduce(me.TrainGroupings, function(cfgs, tnsInGroup, i){ 
			return cfgs.concat([{ //dnd target is the super columns yo
				text:tnsInGroup.join('/ '),
				columns: [{
					text:'Expected',
					dataIndex:'Expected/' + tnsInGroup.sort().join('-'),
					tnsInGroup:tnsInGroup,
					editor:'textfield',
					menuDisabled:true,
					tdCls: 'intel-editor-cell intel-alt-color' + ((i % 2)+1),
					summaryRenderer: function(value, summaryData, summaryRecord, row, col, store) {
						return _.reduce(store.getRange(), function(sum, r){ 
							return sum + 1*r.get('Expected/' + tnsInGroup.sort().join('-'));
						}, 0);
					}
				}].concat(tnsInGroup.length>1 ? [{
					text:tnsInGroup.join('/ '),
					menuDisabled:true,
					dataIndex:'Groups',
					tnsInGroup:tnsInGroup,
					canHasTooltip:true,
					tdCls: 'intel-alt-color' + ((i % 2)+1),
					renderer:function(groups){
						var group = groups[i],
							ret = getGroupCount(group), self = ret.self,
							dep = Object.keys(ret.dep).join(', ');
						return columnWrap(countString(dep, self));
					},
					summaryRenderer: function(value, summaryData, summaryRecord, row, col, store) {
						var groups = _.map(store.getRange(), function(r){ return r.get('Groups')[i]; });
						var self = 0, dep = {};
						_.each(groups, function(group){ 
							ret = getGroupCount(group);
							self += ret.self;
							Ext.apply(dep, ret.dep);
						});
						dep = Object.keys(dep).join(', ');
						return columnWrap(countString(dep, self));
					}
				}] : []).concat(_.map(tnsInGroup, function(tn){
					return { 
						dataIndex:tn,
						canHasTooltip:true,
						text:tn,
						menuDisabled:true,
						tdCls: 'intel-alt-color' + ((i % 2)+1),
						renderer:function(scrums){ 
							var dep = Object.keys(scrums.dep).join(', '), 
								self = selfCount(scrums.self);
							return columnWrap(countString(dep, self));
						},
						summaryRenderer: function(value, summaryData, summaryRecord, row, col, store) {
							var tn = me.Grid.columns[col].dataIndex;
							var self = 0, dep = {};
							_.each(store.getRange(), function(row){
								self += selfCount(row.data[tn].self);
								Ext.apply(dep, row.data[tn].dep);
							});
							dep = Object.keys(dep).join(', ');
							return columnWrap(countString(dep, self));
						}
					};
				})).concat([{
					text:'Short/Over',
					menuDisabled:true,
					dataIndex:'Groups',
					tdCls: 'intel-alt-color' + ((i % 2)+1),
					renderer:function(groups, meta, record){ 
						var expected = me._getExpected(tnsInGroup, record.data.Type), 
							group = groups[i],
							ret = getGroupCount(group), 
							self = ret.self,
							diff = self-expected;
						meta.tdCls += (diff >= 0 ? ' intel-green-cell' : ' intel-red-cell');
						return diff;
					},
					summaryRenderer: function(value, summaryData, summaryRecord, row, col, store) {
						var pairs = _.map(store.getRange(), function(r){ return {type:r.get('Type'), group:r.get('Groups')[i]}; });
						var self = 0, expected = 0;
						_.each(pairs, function(pair){ 
							self += getGroupCount(pair.group).self;
							expected += me._getExpected(_.map(pair.group, function(g){return g.tn; }), pair.type); 
						});
						return self-expected;
					}
				}])
			}]);
		},[{ 
			dataIndex:'Org', 
			text:'Orgs',
			sortable:false,
			resizable:false
		},{ 
			dataIndex:'Type', 
			text:'Teams',
			sortable:false,
			resizable:false
		}]).concat([{ //last
			text:'Total Short/Over',
			sortable:false,
			resizable:false,
			renderer: function(v, meta, row){
				var expected = getSumOfExpecteds(row),
					self = getSumOfGroupCounts(row), 
					diff = self-expected;
				meta.tdCls += (diff >= 0 ? ' intel-green-cell' : ' intel-red-cell');
				return diff;
			},
			summaryRenderer: function(value, summaryData, summaryRecord, row, col, store) {
				var rows = store.getRange(), self=0, expected=0;
				_.each(rows, function(row){ 
					expected += getSumOfExpecteds(row);
					self += getSumOfGroupCounts(row);
				});
				return self-expected;
			}
		},{
			text:'Target Size',
			sortable:false,
			resizable:false,
			renderer: function(v, m, row){
				return getSumOfExpecteds(row);
			},
			summaryRenderer: function(value, summaryData, summaryRecord, row, col, store) {
				return _.reduce(store.getRange(), function(sum, row){ return sum + getSumOfExpecteds(row); }, 0);
			}
		}]);
		
		me.Grid = me.add({
			xtype: 'rallygrid',
			height:500,
			scroll:'horizontal',
			resizable:false,
			columnCfgs: columnCfgs,
			columnLines:true,
			plugins: [
				Ext.create('Ext.grid.plugin.CellEditing', {
					triggerEvent:'cellclick'
				})
			],
			features: [{
				ftype: 'summary'
			}],
			listeners: {
				edit: function(editor, e){
					var row = e.record,
						tnsInGroup = e.column.tnsInGroup,
						value = e.value,
						originalValue = me._getExpected(tnsInGroup, row.data.Type);
					if(originalValue !== value && !isNaN(value)){
						me.Grid.setLoading(true);
						me._setExpected(tnsInGroup, row.data.Type, value*1, function(){
							me.Grid.setLoading(false);
							row.commit();
						});
					} else {
						row.set(e.field, originalValue);
						row.commit();
					}
				},
				viewready: function (grid) {
					var view = grid.view;			
					grid.mon(view, {
						uievent: function (type, view, cell, rowIdx, colIdx, e) {
							if(type !== 'mousedown') return;
							var row = me.CustomStore.getAt(rowIdx),
								column = me.Grid.getColumnManager().columns[colIdx],
								pos = cell.getBoundingClientRect(),
								html = '', panelWidth=240;
							if(me.tooltip){
								me.tooltip.panel.hide();
								me.tooltip.triangle.hide();
								me.tooltip.panel.destroy();
								me.tooltip.triangle.destroy();
								if(me.tooltip.rowIdx == rowIdx && me.tooltip.colIdx == colIdx) {
									delete me.tooltip;
									return;
								}
							}
							if(column.canHasTooltip){
								var getTooltipInfo = function(type, tn){
									var info = me.TSMap[tn].scrums[type], depTns = Object.keys(info.dep),
										theHTML = '<p><b>Train: </b>' + tn + '<ol>';
									if(info.self.length){
										theHTML += '<p><b>Teams:</b><p><ol>';
										_.each(info.self, function(scrum){
											theHTML += '<li>' + scrum.get('Name') + '</li>';
										});
										theHTML += '</ol>';
									}
									if(depTns.length){
										theHTML += '<p><b>Dependencies:</b><p><ol>';
										_.each(depTns, function(tn2){ 
											_.each(info.dep[tn2], function(scrum){
												theHTML += '<li>' + scrum.get('Name') + '</li>';
											});
										});
										theHTML += '</ol>';
									}
									return theHTML + '</ol>';
								};
								if(column.dataIndex==='Groups')
									_.each(column.tnsInGroup, function(tn){
										html += getTooltipInfo(row.data.Type, tn);
									});
								else html = getTooltipInfo(row.data.Type, column.dataIndex);
								
								me.tooltip = {
									rowIdx:rowIdx,
									colIdx:colIdx,
									panel: Ext.widget('container', {
										floating:true,
										width: panelWidth,
										cls: 'intel-tooltip',
										focusOnToFront:false,
										shadow:false,
										renderTo:Ext.getBody(),
										html:html,
										listeners:{
											afterrender: function(panel){
												panel.setPosition(pos.left-panelWidth, pos.top);
											}
										}
									}),
									triangle: Ext.widget('container', {
										floating:true,
										width:0, height:0,
										cls: 'intel-tooltip-triangle',
										focusOnToFront:false,
										shadow:false,
										renderTo:Ext.getBody(),
										listeners:{
											afterrender: function(panel){
												panel.setPosition(pos.left -10, pos.top);
											}
										}
									})	
								};
							}
						}
					});
				}
			},
			showRowActionsColumn:false,
			showPagingToolbar:false,
			enableEditing:false,
			selType:'rowmodel',
			selModel:{
				listeners: {
					beforeselect: function(){ return false; }
				}
			},
			context: me.getContext(),
			store: me.CustomStore
		});	
	},
	
	listeners: { //app listeners yo
		afterrender: function() {
			var me = this;
			me.getEl().on('scroll', function(){
				me._clearToolTip();
			});
		}
    }
});