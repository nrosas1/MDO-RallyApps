<!DOCTYPE html>
<html>
<head>
    <title>Sanity Dashboard</title>

    <script type="text/javascript" src="/apps/2.0rc3/sdk.js"></script>
    <script type="text/javascript" src="https://code.jquery.com/jquery-2.1.1.js"></script>
    <script type="text/javascript" src="https://mdoproceffrpt/cdn/highcharts/highcharts-v4.0.4-modified.js"></script>
    <script type="text/javascript" src="https://code.highcharts.com/modules/heatmap.src.js"></script>
    <script type="text/javascript" src="https://cdnjs.cloudflare.com/ajax/libs/q.js/1.0.1/q.js"></script>

    <script type="text/javascript">
        Rally.onReady(function () {
                Ext.define('IntelRallyApp', {
	alias: 'widget.intelrallyapp',
  extend: 'Rally.app.App',
	
	/** these are the necessary models to load for the apps. you should call this */
	_loadModels: function(){
		var me=this, 
			promises = [],
			models = {
				Project: 'Project',
				UserStory: 'HierarchicalRequirement',
				Feature:'PortfolioItem/Feature',
				Milestone:'PortfolioItem/Milestone'
			};
		_.each(models, function(modelType, modelName){
			var deferred = Q.defer();
			Rally.data.WsapiModelFactory.getModel({ //load project
				type:modelType, 
				success: function(loadedModel){ 
					me[modelName] = loadedModel;
					deferred.resolve();
				}
			});
			promises.push(deferred.promise);
		});
		return Q.all(promises);
	},	
	_loadProject: function(oid){ 
		var me = this, deferred = Q.defer();
		if(!oid) return Q.resolve();
		else if(!me.Project){ 
			return me._loadModels().then(function(){ 
				return me._loadProject(oid); 
			});
		}
		else {
			me.Project.load(oid, {
				fetch: ['ObjectID', 'Releases', 'Children', 'Parent', 'Name'],
				context: {
					workspace: me.getContext().getWorkspace()._ref,
					project: null
				},
				callback: deferred.resolve
			});
			return deferred.promise;
		}
	},	
	_loadFeature: function(oid, projectRef){ //projectRef is optional
		var me = this, deferred = Q.defer();
		if(!oid) return Q.resolve();
		else if(!me.Feature){ 
			return me._loadModels().then(function(){ 
				return me._loadFeature(oid, projectRef); 
			});
		}
		else {
			me.Feature.load(oid, {
				fetch: ['Name', 'ObjectID', 'FormattedID', 'c_TeamCommits', 'c_Risks', 'Project', 'PlannedEndDate', 'Parent'],
				context: {
					workspace: me.getContext().getWorkspace()._ref,
					project: projectRef
				},
				callback: deferred.resolve
			});
			return deferred.promise;
		}
	},	
	_loadUserStory: function(oid, projectRef){ 
		var me = this, deferred = Q.defer();
		if(!oid) return Q.resolve();
		else if(!me.UserStory){ 
			return me._loadModels().then(function(){ 
				return me._loadUserStory(oid, projectRef); 
			});
		}
		else {
			me.UserStory.load(oid, {
				fetch: ['Name', 'ObjectID', 'Release', 'Project', 'Feature',
					'FormattedID', 'Predecessors', 'Successors', 'c_Dependencies', 'Iteration', 'PlanEstimate'],
				context: {
					workspace: me.getContext().getWorkspace()._ref,
					project: projectRef
				},
				callback: deferred.resolve
			});
			return deferred.promise;
		}
	},	
	_loadMilestone: function(oid, projectRef){ 
		var me = this, deferred = Q.defer();
		if(!oid) return Q.resolve();
		else if(!me.Milestone){ 
			return me._loadModels().then(function(){ 
				return me._loadMilestone(oid); 
			});
		}
		else {
			me.Milestone.load(oid, {
				fetch: ['ObjectID', 'Parent', 'Name'],
				context: {
					workspace: me.getContext().getWorkspace()._ref,
					project: projectRef
				},
				callback: deferred.resolve
			});
			return deferred.promise;
		}
	},
	
	/**************************************** SOME UTIL FUNCS ***************************************************/
	_loadRootProject: function(projectRecord){
		if(!projectRecord) return Q.reject('Invalid arguments: LRP');
		var me=this, 
			n = projectRecord.data.Name;
		if(n === 'All Scrums' || n === 'All Scrums Sandbox') return Q(projectRecord);
		else if(!projectRecord.data.Parent) return Q.reject('You do not have viewer access to "All Scrums"!');
		else {
			return me._loadProject(projectRecord.data.Parent.ObjectID).then(function(parentRecord){
				return me._loadRootProject(parentRecord);
			});
		}
	},	
	_loadTopProject: function(projectRecord){
		if(!projectRecord) return Q.reject('Invalid arguments: LTP');
		var me=this, 
			n = projectRecord.data.Name;
		if(!projectRecord.data.Parent) return Q(projectRecord);
		else {
			return me._loadProject(projectRecord.data.Parent.ObjectID).then(function(parentRecord){
				return me._loadTopProject(parentRecord);
			});
		}
	},	
	_projectInWhichTrain: function(projectRecord){ // returns train the projectRecord is in, otherwise null.
		if(!projectRecord) return Q.reject('Invalid arguments: PIWT');
		else {
			var me=this, split = projectRecord.data.Name.split(' ART');
			if(split.length>1) return Q(projectRecord);
			else { 
				var parent = projectRecord.data.Parent;
				if(!parent) return Q.reject('Project not in a train');
				else {
					return me._loadProject(parent.ObjectID).then(function(parentRecord){
						return me._projectInWhichTrain(parentRecord);
					});
				}
			}
		}
	},	
	_loadAllTrains: function(rootProjectRecord){
		if(!rootProjectRecord) return Q.reject('Invalid arguments: LAT');
		var me=this,
			store = Ext.create('Rally.data.wsapi.Store',{
				model: 'Project',
				remoteSort:false,
				limit:Infinity,
				fetch: ['Name', 'ObjectID'],
				context:{
					workspace: me.getContext().getWorkspace()._ref,
					project: null
				},
				filters:[{
						property:'Name',
						operator: 'contains',
						value: ' ART'
					},{
						property: 'Name',
						operator: (rootProjectRecord.data.Name === 'All Scrums Sandbox' ? 'contains' : '!contains'),
						value: 'Test'
					}
				]
			});
		return me._reloadStore(store).then(function(store){
			console.log('AllTrainRecords loaded', store.data.items);
			return Q(store);
		});
	},			
	_loadRandomUserStory: function(projectRef){ //get the most recent 5 in the project!!
		if(!projectRef) return Q.reject('Invalid arguments: LRUS');
		var me=this,
			store = Ext.create('Rally.data.wsapi.Store',{
				model: 'HierarchicalRequirement',
				limit:5,
				pageSize:5,
				fetch: ['Name', 'CreationDate', 'Project', 'ObjectID', 'FormattedID', 'Predecessors', 'Successors', 'c_Dependencies'],
				context:{
					workspace: me.getContext().getWorkspace()._ref,
					project: undefined
				},
				sorters: [{
					property: 'CreationDate', 
					direction:'DESC'
				}],
				filters:[{
					property:'Project',
					value: projectRef
				}]
			});
		return me._reloadStore(store).then(function(store){
			var records = store.data.items;
			if(records.length) return Q(records[Math.floor(Math.random()*records.length)]);
			else return Q(undefined);
		});
	},
	_loadRandomUserStoryFromRelease: function(projectRef, releaseName){ //get the most recent 5 in the project for a given releaseName!!
		if(!projectRef || !releaseName) return Q.reject('Invalid arguments: LRUSFR');
		var me=this,
			store = Ext.create('Rally.data.wsapi.Store',{
				model: 'HierarchicalRequirement',
				limit:5,
				pageSize:5,
				fetch: ['Name', 'CreationDate', 'Project', 'ObjectID', 'FormattedID', 'Predecessors', 'Successors', 'c_Dependencies'],
				context:{
					workspace: me.getContext().getWorkspace()._ref,
					project: undefined
				},
				sorters: [{
					property: 'CreationDate', 
					direction:'DESC'
				}],
				filters:[
					Ext.create('Rally.data.wsapi.Filter', { property: 'Project', value: projectRef }).and(
						Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: releaseName }).or(
						Ext.create('Rally.data.wsapi.Filter', { property: 'Feature.Release.Name', value: releaseName }))
					)
				]
			});
		return me._reloadStore(store).then(function(store){
			var records = store.data.items;
			if(records.length) return Q(records[Math.floor(Math.random()*records.length)]);
			else return Q(undefined);
		});
	},
	_loadUserStoryByFID: function(formattedID, projectRef){ //must supply both argument
		if(!formattedID || !projectRef) return Q.reject('Invalid arguments: LUSBFID');
		var me=this,
			store = Ext.create('Rally.data.wsapi.Store',{
				model: 'HierarchicalRequirement',
				limit:1,
				pageSize:1,
				fetch: ['Name', 'Project', 'ObjectID', 'FormattedID', 'Predecessors', 'Successors', 'c_Dependencies'],
				context:{
					workspace: me.getContext().getWorkspace()._ref,
					project: undefined
				},
				filters: [{
					property:'FormattedID',
					value:formattedID
				},{
					property:'Project',
					value: projectRef
				}]
			});
		return me._reloadStore(store).then(function(store){
			return Q(store.data.items.pop());
		});
	},	
	_loadProjectByName: function(name){
		if(!name) return Q.reject('Invalid arguments: LPBN');
		var me=this,
			store = Ext.create('Rally.data.wsapi.Store',{
				model: 'Project',
				limit:1,
				pageSize:1,
				fetch: ['Name', 'ObjectID'],
				context:{
					workspace: me.getContext().getWorkspace()._ref,
					project: null
				},
				filters: [
					{
						property:'Name',
						value:name
					}
				]
			});
		return me._reloadStore(store).then(function(store){
			return Q(store.data.items.pop());
		});
	},
	
	/********************************************** FEATURES  ********************************************/
	_getFeatureFilter: function(trainRecord, releaseRecord){
		if(!trainRecord || !releaseRecord) throw 'invalid arguments: GFF';
		var me=this,
			trainName = trainRecord.data.Name.split(' ART')[0],
			relSplit = releaseRecord.data.Name.split(' '),
			coreFilter = Ext.create('Rally.data.wsapi.Filter', {
				property:'Release.Name',
				value: releaseRecord.data.Name
			});
		trainName = relSplit.length == 2 ? relSplit[1] : trainName; //switches where features are if release is "Qxxx TrainName"
		if(trainRecord.data.Name == 'Test ART (P&E)'){
			return Ext.create('Rally.data.wsapi.Filter', {
				property:'Project.Name',
				value: 'Test ART (P&E)'
			}).and(coreFilter);
		}
		else {
			return Ext.create('Rally.data.wsapi.Filter', { //NOTE: they should NOT be in the POWG portfolio level, but we will cover that just in case
				property:'Project.Parent.Name',
				value: trainName + ' POWG Portfolios'
			}).or(Ext.create('Rally.data.wsapi.Filter', {
				property:'Project.Name',
				value: trainName + ' POWG Portfolios'
			})).and(coreFilter);
		}
	},
	
	/*************************************************** Products ********************************************/
	_getProductFilter: function(trainRecord){ //products can be in 2 different levels of the portfolio hierarchy
		if(!trainRecord) throw 'invalid arguments: GPF';
		var me=this,
			trainName = trainRecord.data.Name.split(' ART')[0];
		if(trainName === 'Test'){
			return Ext.create('Rally.data.wsapi.Filter', {
				property:'Project.Name',
				value: 'Test ART (P&E)'
			});
		}
		else {
			return Ext.create('Rally.data.wsapi.Filter', {//NOTE: they should NOT be in the POWG portfolio level, but we will cover that just in case
				property:'Project.Parent.Name',
				value: trainName + ' POWG Portfolios'
			}).or(Ext.create('Rally.data.wsapi.Filter', {
				property:'Project.Name',
				value: trainName + ' POWG Portfolios'
			}));
		}
	},	
	_loadProducts: function(trainRecord){
		if(!trainRecord) return Q.reject('Invalid arguments: LPROD');
		var me=this,
			store = Ext.create('Rally.data.wsapi.Store',{
				model: 'PortfolioItem/Product',
				limit:Infinity,
				remoteSort:false,
				fetch: ['Name'],
				context:{
					workspace: me.getContext().getWorkspace()._ref,
					project: null
				},
				filters:[me._getProductFilter(trainRecord)]
			});
		return me._reloadStore(store).then(function(store){
			console.log('Products loaded', store.data.items);
			return Q(store);
		});
	},
	
	/********************************************** Load Valid Projects ********************************************/	
	_addValidProjectsToList: function(projTree, hash){
		var me=this, 
			curProj = projTree.ProjectRecord;
		if(curProj.data.TeamMembers.Count >0) 
			hash[curProj.data.ObjectID] = curProj;
		for(var childProjRef in projTree){
			if(childProjRef !== 'ProjectRecord')
				me._addValidProjectsToList(projTree[childProjRef], hash);
		}
	},	
	_loadValidProjects: function(rootProjectRecord){ //all projects under root that have team Members
		if(!rootProjectRecord) return Q.reject('Invalid arguments: LVP');
		var me=this,
			validProjects = {}, 
			projTree = {};
		var store = Ext.create('Rally.data.wsapi.Store', {
			model: "Project",
			fetch: ['Name', 'Parent', 'ObjectID', 'TeamMembers'],
			limit:Infinity,
			context: {
				workspace: me.getContext().getWorkspace()._ref,
				project:null
			}
		});
		return me._reloadStore(store).then(function(store){
			var projects = store.data.items;
			for(var i=0, len=projects.length; i<len; ++i){
				var project = projects[i],
					thisRef = project.data.ObjectID, 
					parentRef = project.data.Parent ? project.data.Parent.ObjectID : undefined;
				if(!projTree[thisRef]) projTree[thisRef] = {};
				projTree[thisRef].ProjectRecord = project;
				if(parentRef){
					if(!projTree[parentRef]) projTree[parentRef] = {};
					projTree[parentRef][thisRef] = projTree[thisRef];
				}
			}
			me._addValidProjectsToList(projTree[rootProjectRecord.data.ObjectID], validProjects);
			console.log('valid projects', validProjects);
			return Q(validProjects);
		});	
	},	
	_allChildProjectToList: function(projTree, hash){
		var me=this, 
			curProj = projTree.ProjectRecord;
		hash[curProj.data.ObjectID] = curProj;
		for(var childProjRef in projTree){
			if(childProjRef !== 'ProjectRecord')
				me._allChildProjectToList(projTree[childProjRef], hash);
		}
	},
	_loadAllChildrenProjects: function(rootProjectRecord){
		if(!rootProjectRecord) return Q.reject('Invalid arguments: LACP');
		var me=this,
			childrenProjects = {}, 
			projTree = {};
		var store = Ext.create('Rally.data.wsapi.Store', {
			model: "Project",
			fetch: ['Name', 'Parent', 'ObjectID'],
			limit:Infinity,
			context: {
				workspace: me.getContext().getWorkspace()._ref,
				project:null
			}
		});
		return me._reloadStore(store).then(function(store){
			var projects = store.data.items;
			for(var i=0, len=projects.length; i<len; ++i){
				var project = projects[i],
					thisRef = project.data.ObjectID, 
					parentRef = project.data.Parent ? project.data.Parent.ObjectID : undefined;
				if(!projTree[thisRef]) projTree[thisRef] = {};
				projTree[thisRef].ProjectRecord = project;
				if(parentRef){
					if(!projTree[parentRef]) projTree[parentRef] = {};
					projTree[parentRef][thisRef] = projTree[thisRef];
				}
			}
			me._allChildProjectToList(projTree[rootProjectRecord.data.ObjectID], childrenProjects);
			console.log('childrenProjects', childrenProjects);
			return Q(childrenProjects);
		});	
	},	
	_allLeafProjectsToList: function(projTree, hash){
		var me=this, 
			curProj = projTree.ProjectRecord;
		if(curProj.data.Children.Count === 0) 
			hash[curProj.data.ObjectID] = curProj;
		for(var childProjRef in projTree){
			if(childProjRef !== 'ProjectRecord')
				me._allLeafProjectsToList(projTree[childProjRef], hash);
		}
	},	
	_loadAllLeafProjects: function(rootProjectRecord){
		if(!rootProjectRecord) return Q.reject('Invalid arguments: LALP');
		var me=this,
			childrenProjects = {}, 
			projTree = {};
		var store = Ext.create('Rally.data.wsapi.Store', {
			model: "Project",
			fetch: ['Name', 'Parent', 'ObjectID', 'Children'],
			limit:Infinity,
			context: {
				workspace: me.getContext().getWorkspace()._ref,
				project:null
			}
		});
		return me._reloadStore(store).then(function(store){
			var projects = store.data.items;
			for(var i=0, len=projects.length; i<len; ++i){
				var project = projects[i],
					thisRef = project.data.ObjectID, 
					parentRef = project.data.Parent ? project.data.Parent.ObjectID : undefined;
				if(!projTree[thisRef]) projTree[thisRef] = {};
				projTree[thisRef].ProjectRecord = project;
				if(parentRef){
					if(!projTree[parentRef]) projTree[parentRef] = {};
					projTree[parentRef][thisRef] = projTree[thisRef];
				}
			}
			me._allLeafProjectsToList(projTree[rootProjectRecord.data.ObjectID], childrenProjects);
			console.log('childrenProjects', childrenProjects);
			return Q(childrenProjects);
		});	
	},
	
	/********************************************** Generic store loading, returns promise ********************************************/
	
	_reloadStore: function(store){
		var deferred = Q.defer();
		store.load({
			callback: function(records, operation, success){
				if(!success) deferred.reject(operation.getError() || 'Could not load data');
				else deferred.resolve(store);
			}
		});
		return deferred.promise;
	}
});
                /************************* MODEL FOR WORKWEEK DROPDOWNS *********************************************/
Ext.define('WorkweekDropdown', {
	extend: 'Ext.data.Model',
	fields: [
		{name: 'Workweek', type:'string'},
		{name: 'DateVal', type:'number'}
	]
});
                /** this is used if you want to listen to events in the parent window (e.g. useful for rally apps that resize with browser screen
		vertically or things that need to know browser scroll position) 
	You also can artificially fire the events and have the listeners run
*/
Ext.define('WindowListener', {

	__initWindowEventListener: function(eventName){
		var me=this;
		if(!me._windowListeners) me._windowListeners = {};
		me._windowListeners[eventName] = [];
		
		window.parent['on' + eventName] = function(event){ 
			var listeners = me._windowListeners[eventName];
			for(var i=0, len=listeners.length; i<len; ++i)
				listeners[i](event);
		};
	},
	
	_addWindowEventListener: function(eventName, fn){
		var me=this;
		if(!me._windowListeners || !me._windowListeners[eventName]) 
			me.__initWindowEventListener(eventName);
		me._windowListeners[eventName].push(fn);
	},
	
	_fireParentWindowEvent: function(eventName){ //eg: resize or scroll
		var me=this;
		if(!me._windowListeners || !me._windowListeners[eventName]) return;
		var listeners = me._windowListeners[eventName];
		for(var i=0, len=listeners.length; i<len; ++i) listeners[i]();
	}
});
                /** 
	resizes the iframe to be a little bigger than the inner contents, so theres no ugly double vertical scroll bar 
**/

Ext.define('IframeResize', {
	requires: ['WindowListener'],
	
	/** resizes the iframe to be the height of all the items in it */
	_applyIframeResizeToContents: function(){ 
		var w = window, p = w.parent, pd = w.parent.document, l = w.location,
			iframe = pd.querySelector('iframe[src="' + l.pathname + l.search + '"]'),
			ip1 = iframe.parentNode,
			ip2 = iframe.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode, //this is apparently the one that matters
			height = 0, next = this.down();
		while(next){
			height += next.getHeight() + next.getEl().getMargin('tb')*1 + next.getEl().getPadding('tb')*1;
			next = next.next();
		}
		height += 150;
		ip1.style.height = height + 'px';
		ip2.style.height = height + 'px';
		iframe.style.height = height + 'px';
	},
	
	/** 
		This attaches a listener to the parent window resize event. When the parent window resizes, this resets the iframe height
		to that of the contents! Call this if you want the scrollbar to be on the outsize of the app (the window scrollbar)
	*/
	_initIframeResizeToContents: function(){
		var me=this;
		if(me._addWindowEventListener){
			me._addWindowEventListener('resize', function(){ me._applyIframeResizeToContents(); });
		}
	},
		
	/** 
		resizes the iframe to be the height of the window. its like rally autoheight app but better 
	*/
	_applyIframeResizeToWindow: function(){ 
		var loc = window.location,
			iframe = Ext.get(window.parent.document.querySelector('iframe[src="' + loc.pathname + loc.search + '"]')),
			i = iframe.dom,
			portlet = iframe.up('.x-portlet'),
			portalColumn = portlet.up('.x-portal-column'),
			dashboard = portlet.up('#mydash_portlet');
		height = window.parent.innerHeight - 70;
		height -= 200; //~120 on top and 60 on bottom and
		iframe.style.height = height + 'px';
		ip1.style.height = height + 'px';
		height += 30;
		ip2.style.height = height + 'px';
	},
	
		/** 
		This attaches a listener to the parent window resize event. When the parent window resizes, this resets the iframe height
		to that of the window! Call this if you want the scrollbar to be on the inside of the app (NOT the window scrollbar)
	*/
	_initIframeResizeToWindow: function(){
		var me=this;
		if(me._addWindowEventListener){
			me._addWindowEventListener('resize', function(){ me._applyIframeResizeToWindow(); });
		}
		me._applyIframeResizeToWindow();
	},
	
	/***************** ************* ********* GOOD STUFF BELOW ********************* ************* *********************/
	
	_fixRallyDashboard: function(){ //makes app as large as screen, without the stupid padding/margin
		var me=this,
			loc = window.location,
			iframe = Ext.get(window.parent.document.querySelector('iframe[src="' + loc.pathname + loc.search + '"]')),
			portlet = iframe.up('.x-portlet'), 
			portalColumn = portlet.up('.x-portal-column'), //has huge right margin (we don't explicitly need it here)
			dashboard = portlet.up('#mydash_portlet'), //has huge padding values
			i = iframe.dom,
			innerHeight = window.parent.innerHeight;
		//adjust widths
		while(true){
			i.style.width = (window.parent.innerWidth - 4) + 'px';
			i.style.padding = '0';
			i.style.margin = '0';
			if(i.id === 'mydash_portlet') break;
			i = i.parentNode;
		}
		
		//adjust heights
		dashboard.dom.style.height = (innerHeight - 65) + 'px';
		portlet.dom.style.height = (innerHeight - 105) + 'px';
		iframe.dom.parentNode.style.height = (innerHeight - 135) + 'px';
		iframe.dom.style.height = (innerHeight - 135) + 'px';
		
		//final touches
		dashboard.dom.style.padding = "0 2px 0 2px";
	},
	
	_initFixRallyDashboard: function(){ 
		var me=this;
		if(me._addWindowEventListener){
			me._addWindowEventListener('resize', function(){ me._fixRallyDashboard(); });
		}
		me._fixRallyDashboard();
	},

	_disableResizeHandle: function(){ //hides the draggable resize handle from under the app
		var me=this;
		var loc = window.location,
			iframe = Ext.get(window.parent.document.querySelector('iframe[src="' + loc.pathname + loc.search + '"]')),
			portlet = iframe.up('.x-portlet'),
			handle = portlet.down('.x-resizable-handle');
		if(handle){
			handle.hide();
			handle.dom.onshow = function(){
				if(handle) handle.hide();
			};
		}
	},
		
	_initDisableResizeHandle: function(){
		var me=this;
		if(me._addWindowEventListener){
			me._addWindowEventListener('resize', function(){ me._disableResizeHandle(); });
		}
		me._disableResizeHandle();
	}
	
});
                /**  
	THIS IS ONLY USEFUL AS A RALLYAPP MIXIN 
	gives a window-centered alert or confirm dialog box that isn't ugly. 
*/
Ext.define('PrettyAlert', {

	__getMessageBoxY: function(){ 
		var w = window, p = w.parent, pd = w.parent.document, l = w.location,
			iframe = pd.querySelector('iframe[src="' + l.pathname + l.search + '"]');
		
		var ph = p.getWindowHeight(), 
			ps = p.getScrollY(), 
			ofy = ps + iframe.getBoundingClientRect().top, //offset of top of the iframe ==== constant!!!
			iyOffset = Math.floor(ph/2 - ofy + ps - 50);
		return iyOffset<0 ? 0 : iyOffset;
	},
	
	_alert: function(title, str){		
		if(arguments.length<1) return;
		if(arguments.length===1){
			str = title;
			title = '';
		}
		Ext.MessageBox.alert(title, str).setY(this.__getMessageBoxY());
		setTimeout(function(){ //give some time to give the 'ok' or 'yes' button focus
			var x = Ext.MessageBox.down('button');
			while(x.isHidden()) x = x.nextSibling();
			x.focus();
		}, 20);
	},
	
	_confirm: function(title, str, fn){
		if(arguments.length<2) return;
		if(arguments.length===2){
			fn = str;
			str = title;
			title = '';
		}
		if(typeof fn !== 'function') fn = function(){};
		Ext.MessageBox.confirm(title, str, fn).setY(this.__getMessageBoxY());
		setTimeout(function(){
			var x = Ext.MessageBox.down('button');
			while(x.isHidden()) x = x.nextSibling();
			x.focus();
		}, 20);
	}
});
                (function(){
	var intel_ww = {},
		SECOND = 1000,
		MINUTE = 60*SECOND,
		HOUR = 60*MINUTE,
		DAY = 24*HOUR,
		WEEK = 7*DAY;
		
	Ext.define('IntelWorkweek', {
		/** 
			intel workweek utility module. you can pass in Date objects, strings, or numbers.
			do not pass in Unix UTC millis though, or you will get wrong answer (eg: dont use Date.UTC(...))
		**/
		
		/** calculates intel workweek, returns integer */
		_getWorkweek: function(_date){  //ww1 always contains jan 1st
			var date = new Date(_date),
				yearStart = new Date(date.getFullYear(), 0, 1),
				dayIndex = yearStart.getDay(),
				ww01Start = new Date(yearStart - dayIndex*DAY),
				utcDateMillis = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
				ww01Millis = Date.UTC(ww01Start.getFullYear(), ww01Start.getMonth(), ww01Start.getDate()),
				timeDiff = utcDateMillis - ww01Millis,
				ww = Math.floor(timeDiff/WEEK) + 1,
				leap = (date.getFullYear() % 4 === 0),
				weekCount = ((leap && dayIndex >= 5) || (!leap && dayIndex === 6 )) ? 53 : 52; //weeks in this year
			return weekCount < ww ? 1 : ww;
		},
		
		/** returns the number of intel workweeks in the year the date is in */
		_getWeekCount: function(_date){  // # of intel workweeks in the year the date is in
			var date = new Date(_date),
				leap = (date.getFullYear() % 4 === 0),
				day = new Date(date.getFullYear(), 0, 1).getDay();
			return ((leap && day >= 5) || (!leap && day === 6 )) ? 53 : 52;
		},
		
		_roundDateDownToWeekStart: function(_date){
			var date = new Date(_date),
				day = date.getDay(),
				monthDate = date.getDate(),
				month = date.getMonth(),
				year = date.getFullYear(),
				sundayMidday = new Date(new Date(year, month, monthDate)*1 - (day*DAY - 0.5*DAY)); //daylight savings ._.
			return new Date(sundayMidday.getFullYear(), sundayMidday.getMonth(), sundayMidday.getDate());
		},
		
		/**  gets list of date numbers for each week start between start and end date*/
		_getWorkweekDates: function(startDate, endDate){ //gets list of dates for each week. INCLUSIVE
			var startWeekDate = this._roundDateDownToWeekStart(startDate),
				endWeekDate = this._roundDateDownToWeekStart(endDate),
				startMillis = Date.UTC(startWeekDate.getFullYear(), startWeekDate.getMonth(), startWeekDate.getDate()),
				endMillis = Date.UTC(endWeekDate.getFullYear(), endWeekDate.getMonth(), endWeekDate.getDate()),
				totalWeeks = Math.floor((endMillis - startMillis) / WEEK)+1,
				weeks = new Array(totalWeeks);
			for(var i=0; i<totalWeeks; ++i) {
				var sundayMidday = new Date(startWeekDate*1 + (WEEK*i + HOUR*12));
				weeks[i] = new Date(sundayMidday.getFullYear(), sundayMidday.getMonth(), sundayMidday.getDate());
			}
			return weeks;
		},
		
		_workweekToDate: function(ww, year){ //gets the Date() object of this ww and year
			var yearStart = new Date(year, 0, 1),
				dayIndex = yearStart.getDay(),
				ww01StartMidday = new Date(yearStart - (dayIndex*DAY - 0.5*DAY)),
				sundayMidday = new Date(ww01StartMidday*1 + (ww-1)*WEEK);
			return new Date(sundayMidday.getFullYear(), sundayMidday.getMonth(), sundayMidday.getDate());
		},
		
		_getWorkWeeksForDropdown: function(releaseStartDate, releaseEndDate){ //assumes DropDown uses WorkweekDropdown model
			var workweeks = this._getWorkweekDates(releaseStartDate, releaseEndDate),
				data = new Array(workweeks.length);
			for(var i=0, len=workweeks.length; i<len; ++i){
				data[i] = { 
					Workweek: 'ww' + this._getWorkweek(workweeks[i]),
					DateVal: workweeks[i]*1
				};
			}
			return data;
		}	
	});
}());
                /** Mixin functions related to queries, you need to require Q as a dependency in your rally app
	Q can be found here: https://cdnjs.cloudflare.com/ajax/libs/q.js/1.0.1/q.js
	most functions return promises that resolve to stores
*/

Ext.define('ReleaseQuery', {

	_loadAllReleases: function(projectRecord){
		var deferred = Q.defer();
		Ext.create('Rally.data.wsapi.Store',{
			model: 'Release',
			limit:Infinity,
			autoLoad:true,
			fetch: ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate', 'Project'],
			context:{
				workspace: this.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[
				{
					property:'Project.ObjectID',
					value: projectRecord.data.ObjectID
				}
			],
			listeners: {
				load: {
					fn: function(releaseStore, releaseRecords){
						console.log('releases loaded:', releaseRecords);
						deferred.resolve(releaseStore);
					},
					single:true
				}
			}
		});
		return deferred.promise;
	},
	
	/** gets releases for this project that have release date >= now. returns promise that resolves to the releaseStore */
	_loadReleasesInTheFuture: function(projectRecord){
		var deferred = Q.defer();
		Ext.create('Rally.data.wsapi.Store',{
			model: 'Release',
			limit:Infinity,
			autoLoad:true,
			fetch: ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate', 'Project'],
			context:{
				workspace: this.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[
				{
					property:'Project.ObjectID',
					value: projectRecord.data.ObjectID
				},{
					property:'ReleaseDate',
					operator:'>=',
					value: new Date().toISOString()
				}
			],
			listeners: {
				load: {
					fn: function(releaseStore, releaseRecords){
						console.log('releases loaded:', releaseRecords);
						deferred.resolve(releaseStore);
					},
					single:true
				}
			}
		});
		return deferred.promise;
	},
	
	/** loads this release for each scrum whose name contains the second parament. returns promise with the release Store 
		the scrums that the releases belong to will have at least 1 team member, and the train's release is not included
		in the results.
	**/
	_loadReleasesWithName: function(releaseName, nameContains){ 
		var deferred = Q.defer();
		Ext.create('Rally.data.wsapi.Store',{
			model: 'Release',
			limit:Infinity,
			autoLoad:true,
			fetch: ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate', 'Project', 'TeamMembers'],
			context:{
				workspace: this.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[
				{
					property:'Name', //match the release
					value: releaseName
				},{
					property:'Project.Name', 
					operator:'contains',
					value:nameContains
				},{
					property:'Project.Children.Name', //has children 
					operator:'=',
					value:''
				},{
					property:'Project.Name', //but not the train release itsself
					operator:'!contains',
					value:' ART'
				}
			],
			listeners: {
				load: {
					fn: function(store, records){
						console.log('releasesWithName loaded:', records);
						deferred.resolve(store);
					},
					single:true
				}
			}
		});
		return deferred.promise;
	},
	
	_loadReleaseByNameForProject: function(releaseName, projectRecord){
		var deferred = Q.defer();
		Ext.create('Rally.data.wsapi.Store',{
			model: 'Release',
			limit:Infinity,
			autoLoad:true,
			fetch: ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate', 'Project'],
			context:{
				workspace: this.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[{
				property:'Name',
				value: releaseName
			},{
				property:'Project', 
				value:projectRecord.data._ref
			}],
			listeners: {
				load: {
					fn: function(store, records){
						deferred.resolve(records.pop());
					},
					single:true
				}
			}
		});
		return deferred.promise;
	},
	_loadReleasesByNameContainsForProject: function(releaseName, projectRecord){
		var deferred = Q.defer();
		Ext.create('Rally.data.wsapi.Store',{
			model: 'Release',
			limit:Infinity,
			autoLoad:true,
			fetch: ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate', 'Project'],
			context:{
				workspace: this.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[{
				property:'Name',
				operator:'contains',
				value: releaseName
			},{
				property:'Project', 
				value:projectRecord.data._ref
			}],
			listeners: {
				load: {
					fn: function(store, records){
						deferred.resolve(records);
					},
					single:true
				}
			}
		});
		return deferred.promise;
	},
	
		/** gets releases for this project that have release date >= givenDate. returns promise that resolves to the releaseStore */
	_loadReleasesAfterGivenDate: function(projectRecord, givenDate){
		var deferred = Q.defer();
		Ext.create('Rally.data.wsapi.Store',{
			model: 'Release',
			limit:Infinity,
			autoLoad:true,
			fetch: ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate', 'Project'],
			context:{
				workspace: this.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[
				{
					property:'Project.ObjectID',
					value: projectRecord.data.ObjectID
				},{
					property:'ReleaseDate',
					operator:'>=',
					value: new Date(givenDate).toISOString()
				}
			],
			listeners: {
				load: {
					fn: function(releaseStore, releaseRecords){
						console.log('releases loaded:', releaseRecords);
						deferred.resolve(releaseStore);
					},
					single:true
				}
			}
		});
		return deferred.promise;
	},
	
	/** gets the most likely release to scope to base on the following order:
		1) if this.AppPrefs.projs[pid] is set to a release ObjectID, and the ReleaseStore has that release (you need 
						to use preferences for this one)
		2) if we are in a release
		3) the closest release planning date to the current date
	*/
	_getScopedRelease: function(releaseRecords, projectOID, appPrefs){
		var me=this,
			d = new Date(),
			rs = releaseRecords,
			prefOID = appPrefs && appPrefs.projs && appPrefs.projs[projectOID] && appPrefs.projs[projectOID].Release;
		return (prefOID && _.find(rs, function(r){ return r.data.ObjectID == prefOID; })) ||
			_.find(rs, function(r){
				return (new Date(r.data.ReleaseDate) >= d) && (new Date(r.data.ReleaseStartDate) <= d);
			}) ||
			_.reduce(rs, function(best, r){
				if(best===null) return r;
				else {
					var d1 = new Date(best.data.ReleaseStartDate), d2 = new Date(r.data.ReleaseStartDate), now = new Date();
					return (Math.abs(d1-now) < Math.abs(d2-now)) ? best : r;
				}
			}, null);
	}
});
                /** this combo has filter-as-you-type and drops down on click. it also lets you navigate with arrow keys
	(although there is some arrow key scrolling bug) 
*/
Ext.define('Intel.form.field.ComboBox', {
	extend:'Ext.form.field.ComboBox',
	alias: ['widget.intelcombo', 'widget.intelcombobox'],
	
	constructor: function(options) {
		options = options || {};
		options = Ext.merge({
			enableKeyEvents:true,
			queryMode:'local',
			ignoreNoChange:true,
			allowBlank:false,
			listeners: {
				keyup: function(a,b){
					if(b.keyCode>=37 && b.keyCode <=40) return; //arrow keys
					var combo = this;
					combo.store.clearFilter();
					combo.store.filterBy(function(item){
						return item.data[combo.displayField].match(new RegExp(combo.getRawValue(), 'i')) !== null;
					});
				},
				focus: function(combo) {
					combo.store.clearFilter();
					combo.setValue('');
					combo.expand();
				}
			}
		}, options);
		this.callParent([options]);
	}
});
                Ext.define('Intel.form.field.FixedComboBox', {
	extend:'Ext.form.field.ComboBox',
	alias: ['widget.intelfixedcombo', 'widget.intelfixedcombobox'],
	
	constructor: function(options) {
		options = options || {};
		options = Ext.merge({
			editable: false,	
			allowBlank:false,
			queryMode:'local',
			listeners: {
				focus: function(combo) {
					combo.setValue('');
					combo.expand();
				}
			}
		}, options);
		this.callParent([options]);
	}	
});
                /** YOU MUST PASS IT 2 THINGS IN THE CONFIG
	1: releases (array of release records)
	2: currentRelease (what to show as initial value
*/
Ext.define('Intel.form.field.ReleasePicker', {
	extend: 'Intel.form.field.FixedComboBox',
	alias: ['widget.intelreleasepicker'],
	
	constructor: function(options){
		if(!options.releases || !options.currentRelease) return;
		
		options.displayField = 'Name';
		options.value = options.currentRelease.data.Name;
		options.store = Ext.create('Ext.data.Store', {
			fields: ['Name'],
			sorters: [function(o1, o2){ return o1.data.Name > o2.data.Name ? -1 : 1; }],
			data: _.map(options.releases, function(r){ return {Name: r.data.Name }; })
		});
		
		options.fieldLabel = options.fieldLabel || 'Release:';
		options.editable = options.editable || false;
		options.width = options.width || 240;
		options.labelWidth = options.labelWidth || 50;
		
		this.callParent([options]); //now that we have the extra stuff added
	}
});

                /************************** PRODUCTION *****************************/
console = { log: function(){} };	////DEBUG!!!	

/************************** Sanity Dashboard *****************************/
Ext.define('SanityDashboard', {
	extend: 'IntelRallyApp',
	cls:'app',
	mixins:[
		'WindowListener',
		'PrettyAlert',
		'IframeResize',
		'IntelWorkweek',
		'ReleaseQuery'
	],	
	minWidth:1100,
	items:[{ 
		xtype: 'container',
		id: 'controlsContainer',
		layout:'hbox'
	},{ 
		xtype: 'container',
		id: 'ribbon',
		cls:'ribbon',
		layout: 'column',
		items: [{
			xtype: 'container',
			width:445,
			id: 'pie'
		},{
			xtype: 'container',
			columnWidth:0.999,
			id: 'heatmap'
		}]
	},{
		xtype:'container',
		id:'gridsContainer',
		cls:'grids-container',
		layout: 'column',
		items: [{
			xtype: 'container',
			columnWidth:0.495,
			id: 'gridsLeft',
			cls:'grids-left'
		},{
			xtype: 'container',
			columnWidth:0.495,
			id: 'gridsRight',
			cls:'grids-right'
		}]
	}],
	_prefName: 'sanity-dashboard-pref',
	_colors: [
		'#5DA5DA', //(blue)
		'#FAA43A', //(orange)
		'#60BD68', //(green)
		'#F17CB0', //(pink)
		'#B2912F', //(brown)
		'#B276B2', //(purple)
		'#DECF3F', //(yellow)
		'#F15854', //(red)
		'#4D4D4D' //(gray)
	],
	
	/******************************************************* Reloading ********************************************************/	
	_removeAllItems: function(){
		var me = this;
		Ext.getCmp('controlsContainer').removeAll();
		Ext.getCmp('pie').removeAll();
		Ext.getCmp('heatmap').removeAll();
		Ext.getCmp('gridsLeft').removeAll();
		Ext.getCmp('gridsRight').removeAll();
	},
	_reloadEverything:function(){
		var me=this;
		me.setLoading('Loading Grids');
		me._removeAllItems();
		me._loadReleasePicker();
		me._loadTeamPicker();
		return me._buildGrids()
			.then(function(){ 
				me.setLoading('Loading Piechart and Heatmap');
				return me._buildRibbon();
			})
			.then(function(){
				me.setLoading(false); 
			})
			.fail(function(reason){
				me.setLoading(false);
				return Q.reject(reason);
			});
	},
	
	/************************************************** Preferences FUNCTIONS ***************************************************/	
	_loadPreferences: function(){ //parse all settings too
		var me=this,
			uid = me.getContext().getUser().ObjectID,
			deferred = Q.defer();
		Rally.data.PreferenceManager.load({
			appID: me.getAppId(),
      filterByName:me._prefName+ uid,
			success: function(prefs) {
				var appPrefs = prefs[me._prefName + uid];
				try{ appPrefs = JSON.parse(appPrefs); }
				catch(e){ appPrefs = { projs:{}};}
				console.log('loaded prefs', appPrefs);
				deferred.resolve(appPrefs);
			},
			failure: deferred.reject
		});
		return deferred.promise;
	},
	_savePreferences: function(prefs){ // stringify and save only the updated settings
		var me=this, s = {}, 
			uid = me.getContext().getUser().ObjectID,
			deferred = Q.defer();
		prefs = {projs: prefs.projs};
    s[me._prefName + uid] = JSON.stringify(prefs); 
    console.log('saving prefs', prefs);
		Rally.data.PreferenceManager.update({
			appID: this.getAppId(),
			settings: s,
			success: deferred.resolve,
			failure: deferred.reject
		});
		return deferred.promise;
	},
	
	/******************************************************* LAUNCH ********************************************************/
	launch: function() {
		var me=this; 
		me._initDisableResizeHandle();
		me._initFixRallyDashboard();
		me.setLoading('Loading Configuration');
		me._loadModels()
			.then(function(){
				var scopeProject = me.getContext().getProject();
				return me._loadProject(scopeProject.ObjectID);
			})
			.then(function(scopeProjectRecord){
				me.ProjectRecord = scopeProjectRecord;
				return me._projectInWhichTrain(me.ProjectRecord);
			})
			.fail(function(reason){
				if(reason != 'Project not in a train') return Q(reason); //its ok if its not in the train
			})
			.then(function(trainRecord){
				if(trainRecord){
					if(trainRecord.data.ObjectID != me.ProjectRecord.data.ObjectID) me._isScopedToTrain = false;
					else me._isScopedToTrain = true;
					me.TrainRecord = trainRecord;
					return me._loadAllLeafProjects(me.TrainRecord)
						.then(function(leafProjects){
							me.LeafProjects = leafProjects;
							if(me._isScopedToTrain) me.CurrentTeam = null;
							else me.CurrentTeam = me.ProjectRecord;
							return me._loadProducts(me.TrainRecord);
						})
						.then(function(productStore){
							me.Products = productStore.getRange();
							return me._loadPreferences();
						});
				}
				else {
					me.CurrentTeam = me.ProjectRecord;
					me._isScopedToTrain = false;
					return me._loadPreferences();
				}
			})
			.then(function(appPrefs){
				me.AppPrefs = appPrefs;
				var twelveWeeks = 1000*60*60*24*12;
				return me._loadReleasesAfterGivenDate(me.ProjectRecord, (new Date()*1 - twelveWeeks));
			})
			.then(function(releaseStore){
				me.ReleaseStore = releaseStore;
				var currentRelease = me._getScopedRelease(me.ReleaseStore.data.items, me.ProjectRecord.data.ObjectID, me.AppPrefs);
				if(currentRelease){
					me.ReleaseRecord = currentRelease;
					console.log('release loaded', currentRelease);
					return me._reloadEverything();
				}
				else return Q.reject('This project has no releases.');
			})
			.fail(function(reason){
				me.setLoading(false);
				me._alert('ERROR', reason || '');
			})
			.done();
	},

	/******************************************************* RELEASE PICKER ********************************************************/
	_releasePickerSelected: function(combo, records){
		var me=this, pid = me.ProjectRecord.data.ObjectID;
		if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
		me.setLoading(true);
		me.ReleaseRecord = me.ReleaseStore.findExactRecord('Name', records[0].data.Name);
		if(typeof me.AppPrefs.projs[pid] !== 'object') me.AppPrefs.projs[pid] = {};
		me.AppPrefs.projs[pid].Release = me.ReleaseRecord.data.ObjectID;
		me._savePreferences(me.AppPrefs)
			.then(function(){ return me._reloadEverything(); })
			.fail(function(reason){
				me._alert('ERROR', reason || '');
				me.setLoading(false);
			})
			.done();
	},
	_loadReleasePicker: function(){
		var me=this;
		Ext.getCmp('controlsContainer').add({
			xtype:'intelreleasepicker',
			labelWidth: 80,
			width: 240,
			releases: me.ReleaseStore.data.items,
			currentRelease: me.ReleaseRecord,
			listeners: {
				change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
				select: me._releasePickerSelected.bind(me)
			}
		});
	},	
	_teamPickerSelected: function(combo, records){
		var me=this,
			recName = records[0].data.Name;
		if((!me.CurrentTeam && recName == 'All') || (me.CurrentTeam && me.CurrentTeam.data.Name == recName)) return;
		if(recName == 'All') me.CurrentTeam = null;
		else me.CurrentTeam = _.find(me.LeafProjects, function(p){ return p.data.Name == recName; });
		return me._reloadEverything();
		
	},
	_loadTeamPicker: function(){
		var me=this;
		if(!me.TrainRecord) return; //don't show for non-train teams
		Ext.getCmp('controlsContainer').add({
			xtype:'intelcombobox',
			width: 200,
			padding:'0 0 0 40px',
			fieldLabel: 'Team:',
			labelWidth:50,
			store: Ext.create('Ext.data.Store', {
				fields: ['Name'],
				data: [{Name:'All'}].concat(_.map(_.sortBy(me.LeafProjects, 
					function(s){ return s.data.Name; }),
					function(p){ return {Name: p.data.Name}; }))
			}),
			displayField:'Name',
			value:me.CurrentTeam ? me.CurrentTeam.data.Name : 'All',
			listeners: {
				select: me._teamPickerSelected.bind(me)
			}
		});
	},
	
	/******************************************************* Render Ribbon ********************************************************/
	_hideHighchartsLinks: function(){
		$('.highcharts-container > svg > text:last-child').hide();
	},
	_getCountForTeamAndGrid: function(project, grid){
		var me=this,
			store = Ext.create('Rally.data.wsapi.Store',{
				model: 'UserStory',
				limit:1,
				pageSize:1,
				remoteSort:false,
				fetch: false,
				context:{
					workspace: me.getContext().getWorkspace()._ref,
					project: null
				},
				filters: me.CurrentTeam ?	
					grid.originalConfig.filters :
					[grid.originalConfig.filters[0].and(Ext.create('Rally.data.wsapi.Filter', { property: 'Project', value: project.data._ref }))]

			});
		if(!me.CurrentTeam || me.CurrentTeam.data.ObjectID == project.data.ObjectID) 
			return me._reloadStore(store).then(function(store){ return store.totalCount; });
		else return Q(0);
	},
	_getHeatMapConfig: function() { 
		var me=this,
			highestNum = 0,
			userStoryGrids = _.filter(Ext.getCmp('gridsContainer').query('rallygrid'), function(grid){ 
				return grid.originalConfig.model == 'UserStory'; 
			}).reverse(),
			chartData = [],
			promises = [];
		_.each(userStoryGrids, function(grid, gindex) {
			_.each(_.sortBy(me.LeafProjects, function(p){ return p.data.Name; }), function(project, pindex){
				promises.push(me._getCountForTeamAndGrid(project, grid).then(function(gridCount){
					highestNum = Math.max(gridCount, highestNum);
					return chartData.push([pindex, gindex, gridCount]);
				}));
			});
		});
		window._selectTeam = function(value){
			var team = _.find(me.LeafProjects, function(p){ return p.data.Name.split('-')[0].trim() === value; });
			if(me.CurrentTeam && team.data.ObjectID == me.CurrentTeam.data.ObjectID) me.CurrentTeam = null;
			else me.CurrentTeam = team;
			me._reloadEverything();
		};
		window._selectId = function(gridId){
			location.href = '#' + gridId;
		};
		return Q.all(promises).then(function(){
			return {       
				chart: {
					type: 'heatmap',
					height:340,
					marginTop: 10,
					marginLeft: 130,
					marginBottom: 80
				},
				title: { text: null },
				xAxis: {
					categories: _.sortBy(_.map(me.LeafProjects, 
						function(project){ return project.data.Name.split('-')[0].trim(); }),
						function(p){ return p; }),
					labels: {
						style: { width:100 },
						formatter: function(){
							var text = this.value;
							if(me.CurrentTeam && me.CurrentTeam.data.Name.indexOf(this.value) === 0) 
								text = '<span class="curteam">' + this.value + '</span>';
							return '<a class="heatmap-xlabel" onclick="_selectTeam(\'' + this.value +  '\');">' + text + '</a>';
						},
						useHTML:true,
						rotation: -45
					}
				},
				yAxis: {
					categories: _.map(userStoryGrids, function(grid){ return grid.originalConfig.title; }),
					title: null,
					labels: {
						formatter: function(){
							var text = this.value,
								index = _.indexOf(this.axis.categories, text),
								gridID = userStoryGrids[index].originalConfig.id,
								styleAttr='style="background-color:' + me._colors[userStoryGrids.length - index - 1] + '"';
							return '<div class="heatmap-ylabel"' + styleAttr + ' onclick="_selectId(\'' + gridID +  '\')">' + text + '</div>';
						},
						useHTML:true
					}
				},
				colorAxis: {
					min: 0,
					minColor: '#FFFFFF',
					maxColor: highestNum ? '#ec5b5b' : '#FFFFFF' //if they are all 0 make white
				},
				plotOptions: {
					series: {
						point: {
							events: {
								click: function(e){
									var point = this,
										team = _.sortBy(me.LeafProjects, function(p){ return p.data.Name; })[point.x],
										grid = userStoryGrids[point.y];
									if(!me.CurrentTeam || me.CurrentTeam.data.ObjectID != team.data.ObjectID){
										me.CurrentTeam = team;
										setTimeout(function(){
											me._reloadEverything().then(function(){ location.href = '#' + grid.originalConfig.id; }).done();
										}, 0);
									}
									else location.href = '#' + grid.originalConfig.id;
								}
							}
						}
					}
				},
				legend: { enabled:false },
				tooltip: { enabled:false },
				series: [{
					name: 'Errors per Violation per Team',
					borderWidth: 1,
					data: chartData,
					dataLabels: {
						enabled: true,
						color: 'black',
						style: {
							textShadow: 'none'
						}
					}
				}]  
			};
		});
	},
	_getPieChartConfig: function() { 
		var me=this,
			chartData = _.map(Ext.getCmp('gridsContainer').query('rallygrid'), function(grid) { 
				return {
					name: grid.originalConfig.title,
					y: grid.store.totalCount || 0,
					href: '#' + grid.originalConfig.id
				};
			});
		if(_.every(chartData, function(item){ return item.y === 0; })){
			chartData = [{
				name: 'Everything is correct!',
				y:1,
				color:'#60BD68'
			}];
		}
		return {
			chart: {
				height:345,
				marginLeft: -15,
				plotBackgroundColor: null,
				plotBorderWidth: 0,
				plotShadow: false
			},
			title: { text: null },
			tooltip: { enabled:false },
			plotOptions: {
				pie: {
					dataLabels: {
						enabled: true,
						distance:25,
						crop:false,
						overflow:'none',
						format:'<b>{point.name}</b>: {y}',
						style: { 
							cursor:'pointer',
							color: 'black'
						}
					},
					startAngle: 10,
					endAngle: 170,
					center: ['0%', '50%']
				}
			},
			series: [{
				type: 'pie',
				name: 'Grid Count',
				innerSize: '25%',
				size:260,
				point: {
					events: {
						click: function(e) {
							if(e.point.href) location.href = e.point.href;
							e.preventDefault();
						}
					}
				},
				data: chartData
			}]
		};
	},	
	_buildRibbon: function() {
		var me=this;
		Highcharts.setOptions({ colors: me._colors });
		$('#pie').highcharts(me._getPieChartConfig());
		if(!me.TrainRecord) me._hideHighchartsLinks(); //DONT show the heatmap for non-train teams
		else return me._getHeatMapConfig()
			.then(function(chartConfig){
				$('#heatmap').highcharts(chartConfig);
				me._hideHighchartsLinks();
			})
			.fail(function(reason){
				me._alert('ERROR', reason);
			});
	},
	
	/******************************************************* Render GRIDS ********************************************************/
	_addGrid: function(gridConfig){
		var me=this,
			gridTitleLink = '<a id="' + gridConfig.id + '">' + gridConfig.title + '</a>' +
			'<span style="float:right;font-weight:bold;font-size:0.8rem;"><a href="#controlsContainer">Top</a></span>',
			deferred = Q.defer(),
			grid = Ext.create('Rally.ui.grid.Grid', {
				title: gridTitleLink,
				columnCfgs: gridConfig.columns,
				showPagingToolbar: true,
				originalConfig:gridConfig,
				showRowActionsColumn: true,
				emptyText: ' ',
				enableBulkEdit: true,
				pagingToolbarCfg: {
					pageSizes: [10, 15, 25, 100],
					autoRender: true,
					resizable: false
				},
				storeConfig: {
					model: gridConfig.model,
					autoLoad:{start: 0, limit: 10},
					pageSize: 10,
					context: { workspace: me.getContext().getWorkspace()._ref, project:null },
					filters: gridConfig.filters,
					listeners: {
						load: function(store) {
							if(!store.getRange().length){
								var goodGrid = Ext.create('Rally.ui.grid.Grid', {
									xtype:'rallygrid',
									cls:' sanity-grid grid-healthy',
									title: gridTitleLink,
									originalConfig: gridConfig,
									emptyText: '0 Problems!',
									store: Ext.create('Rally.data.custom.Store', { data:[] }),
									showPagingToolbar: false,
									showRowActionsColumn: false
								});
								goodGrid.gridContainer = Ext.getCmp('grids' + gridConfig.side);
								deferred.resolve(goodGrid);
							} else{
								grid.addCls('grid-unhealthy sanity-grid');
								grid.gridContainer = Ext.getCmp('grids' + gridConfig.side);
								deferred.resolve(grid);
							}
						}  
					}
				}
			});
		return deferred.promise;
	},	
	_buildGrids: function() { 
		var me = this,
			releaseName = me.ReleaseRecord.data.Name,
			releaseDate = new Date(me.ReleaseRecord.data.ReleaseDate).toISOString(),
			releaseStartDate = new Date(me.ReleaseRecord.data.ReleaseStartDate).toISOString(),
			trainName = me.TrainRecord && me.TrainRecord.data.Name.split(' ART')[0],
			defaultUserStoryColumns = [{
					text:'FormattedID',
					dataIndex:'FormattedID', 
					editor:false
				},{
					text:'Name',
					dataIndex:'Name', 
					editor:false
				}].concat(!me.CurrentTeam ? [{
					text: 'Team', 
					dataIndex: 'Project',
					editor:false
				}] : []),
			defaultFeatureColumns = [{
					text:'FormattedID',
					dataIndex:'FormattedID', 
					editor:false
				},{
					text:'Name',
					dataIndex:'Name', 
					editor:false
				},{
					text:'PlannedEndDate',
					dataIndex:'PlannedEndDate', 
					editor:false
				}],
			releaseNameFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: releaseName }),
				//.or(Ext.create('Rally.data.wsapi.Filter', { property: 'Feature.Release.Name', value: releaseName })) //i guess we dont want this :(
			userStoryProjectFilter = me.CurrentTeam ? 
				Ext.create('Rally.data.wsapi.Filter', { property: 'Project.ObjectID', value: me.CurrentTeam.data.ObjectID }) : 
				Ext.create('Rally.data.wsapi.Filter', { property: 'Project.Name', operator:'contains', value: trainName}),
			featureProductFilter = _.reduce(me.Products, function(filter, product){
				var thisFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Parent.Parent.Name',  value:product.data.Name });
				return filter ? filter.or(thisFilter) : thisFilter;
			}, null),
			gridConfigs = [{
				showIfLeafProject:true,
				title: 'Blocked Stories',
				id: 'grid-blocked-stories',
				model: 'UserStory',
				columns: defaultUserStoryColumns.concat([{
					text:'Blocked',
					dataIndex:'Blocked'
				},{
					text:'BlockedReason',
					dataIndex:'BlockedReason',
					tdCls:'editor-cell'
				}]),
				side: 'Left',
				filters:[
					Ext.create('Rally.data.wsapi.Filter', { property: 'blocked', value: 'true' })
					.and(releaseNameFilter).and(userStoryProjectFilter)
				]
			},{
				showIfLeafProject:true,
				title: 'Unsized Stories',
				id: 'grid-unsized-stories',
				model: 'UserStory',
				columns: defaultUserStoryColumns.concat([{
					text:'PlanEstimate',
					dataIndex:'PlanEstimate',
					tdCls:'editor-cell'
				}]),
				side: 'Left',
				filters: [
					Ext.create('Rally.data.wsapi.Filter', { property: 'PlanEstimate', operator: '=', value: null })
					.and(releaseNameFilter).and(userStoryProjectFilter)
				]
			},{
				showIfLeafProject:true,
				title: 'Improperly Sized Stories',
				id: 'grid-improperly-sized-stories',
				model: 'UserStory',
				columns: defaultUserStoryColumns.concat([{
					text:'PlanEstimate',
					dataIndex:'PlanEstimate',
					tdCls:'editor-cell'
				}]),
				side: 'Left',
				filters: [
					Ext.create('Rally.data.wsapi.Filter', { property: 'Children.ObjectID', value: null }).and( //parent stories roll up so ignore
					Ext.create('Rally.data.wsapi.Filter', { property: 'PlanEstimate', operator: '!=', value: null })).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'PlanEstimate', operator: '!=', value: '1' })).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'PlanEstimate', operator: '!=', value: '2' })).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'PlanEstimate', operator: '!=', value: '4' })).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'PlanEstimate', operator: '!=', value: '8' })).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'PlanEstimate', operator: '!=', value: '16' }))
					.and(releaseNameFilter).and(userStoryProjectFilter)
				]
			},{
				showIfLeafProject:true,
				title: 'Stories in Release without Iteration',
				id: 'grid-stories-in-release-without-iteration',
				model: 'UserStory',
				columns: defaultUserStoryColumns.concat([{
					text:'Iteration',
					dataIndex:'Iteration',
					tdCls:'editor-cell'
				}]),
				side: 'Left',
				filters: [
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration', value: null })
					.and(releaseNameFilter).and(userStoryProjectFilter)
				]
			},{
				showIfLeafProject:true,
				title: 'Stories in Iteration not attached to Release',
				id: 'grid-stories-in-iteration-not-attached-to-release',
				model: 'UserStory',
				columns: defaultUserStoryColumns.concat([{
					text:'Iteration',
					dataIndex:'Iteration',
					tdCls:'editor-cell'
				},{
					text:'Release',
					dataIndex:'Release',
					tdCls:'editor-cell'
				}]),
				side: 'Right',
				filters: [
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.StartDate', operator:'<', value:releaseDate}).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.EndDate', operator:'>', value:releaseStartDate})).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: null })).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Feature.Release.Name', value: null }))
					.and(userStoryProjectFilter)
				]
			},{
				showIfLeafProject:true,
				title: 'Unaccepted Stories in Past Iterations',
				id: 'grid-unaccepted-stories-in-past-iterations',
				model: 'UserStory',
				columns: defaultUserStoryColumns.concat([{
					text:'Iteration',
					dataIndex:'Iteration',
					editor:false
				},{
					text:'ScheduleState',
					dataIndex:'ScheduleState',
					tdCls:'editor-cell'
				}]),
				side: 'Right',
				filters: [
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.EndDate', operator: '<', value: 'Today' }).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'ScheduleState', operator: '<', value: 'Accepted' }))
					.and(releaseNameFilter).and(userStoryProjectFilter)
				]
			},{
				showIfLeafProject:true,
				title: 'Stories with End Date past Feature End Date',
				id: 'grid-stories-with-end-past-feature-end',
				model: 'UserStory',
				columns: defaultUserStoryColumns.concat([{
					text:'Iteration',
					dataIndex:'Iteration',
					editor:false
				},{
					text:'Feature',
					dataIndex:'Feature',
					editor:false
				}]),
				side: 'Right',
				filters: [
					Ext.create('Rally.data.wsapi.Filter', { property: 'Feature.Name', operator: '!=', value: null }).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.EndDate', operator: '>', value: releaseDate}))
					.and(releaseNameFilter).and(userStoryProjectFilter)
				]
			},{
				showIfLeafProject:false,
				title: 'Features with no stories',
				id: 'grid-features-with-no-stories',
				model: 'PortfolioItem/Feature',
				columns: defaultFeatureColumns,
				side: 'Right',
				filters: [featureProductFilter ?
					Ext.create('Rally.data.wsapi.Filter', { property: 'UserStories.ObjectID', value: null  }).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: releaseName }))
					.and(featureProductFilter) : null
				]
			}];

		return Q.all(_.map(gridConfigs, function(gridConfig){
			if(me.CurrentTeam && !gridConfig.showIfLeafProject) return Q();
			else return me._addGrid(gridConfig);
		}))
		.then(function(grids){
			_.each(grids, function(grid){ if(grid) grid.gridContainer.add(grid); });
			console.log('All grids have loaded');
		})
		.fail(function(reason){ 
			me._alert('ERROR:', reason);
		});
	}
});

            Rally.launchApp('SanityDashboard', {
                name:"Sanity Dashboard",
	            parentRepos:""
            });

        });
    </script>


    <style type="text/css">
        .app {
  margin: 0;
  padding: 0;
  width: 100%;
  overflow-x: hidden !important;
}
.ribbon {
  margin: 10px 0 0 0;
  padding: 0;
  width: 98%;
  height: 350px;
  border: 1px solid #AAA;
}
.grids-container {
  margin: 10px 0 0 0;
  padding: 0;
  position: relative !important;
  width: 98%;
}
.grids-container .grids-left {
  margin-right: 5px;
  position: absolute !important;
  left: 0;
}
.grids-container .grids-right {
  margin-left: 5px;
  position: absolute !important;
  right: 0;
}
.sanity-grid {
  border: 2px solid #AAA;
  padding: 0;
  margin: 0 0 5px 0;
}
.grid-healthy.sanity-grid .x-panel-header {
  font-weight: bold;
  background-color: rgba(0, 255, 0, 0.4) !important;
}
.grid-unhealthy.sanity-grid .x-panel-header {
  font-weight: bold;
  background-color: rgba(255, 0, 0, 0.4) !important;
}
.sanity-grid .grid-pager {
  margin: 3px !important;
}
/*	.sanity-grid .page-size-links {
		visibility:hidden !important; } */
.sanity-grid .editor-cell,
.sanity-grid .editor-cell * {
  cursor: pointer !important;
}
.sanity-grid.rally-grid .x-grid-row-over .editable.rally-edit-cell:not(.editor-cell):hover {
  background-image: none;
}
.highcharts-container {
  overflow: visible !important;
}
.my-heatmap-tooltip {
  z-index: 10000;
  border-radius: 2px;
  padding: 5px;
  border: 1px solid gray;
  background: lightgray;
}
.heatmap-xlabel {
  white-space: nowrap;
  z-index: 100;
  cursor: pointer;
}
.heatmap-xlabel:hover {
  color: blue;
}
.heatmap-xlabel .curteam {
  font-weight: bolder;
  font-size: 1.1em;
}
.heatmap-ylabel {
  white-space: normal;
  width: 124px;
  height: 35px;
  text-align: center;
  display: flex;
  border-bottom-left-radius: 5px;
  border-top-left-radius: 5px;
  justify-content: center;
  align-items: center;
  font-size: 0.65rem;
  cursor: pointer;
  padding: 0 2px 0 2px;
  margin: 0;
}

    </style>
</head>
<body>
</body>
</html>
