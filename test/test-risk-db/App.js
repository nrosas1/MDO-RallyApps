/** 
	This app tests the CRUD operations for the risk-db.js resource. It assumes you have already set the database Project OID
	and tested the KeyValueDb file in the testing workspace
	
	Just copy/paste this in a custom app in Rally. test results are console.logged
*/
(function(){
	var RiskDb = Intel.SAFe.lib.resource.RiskDb,
		TEST_TOKEN = 'risk---testing-app---',
		passing = 0, failing = 0,
		RISK_TMPL = {
			ReleaseName: 'R1',
			PortfolioItemObjectID: 10,
			ProjectObjectID: 11,
			Description: 'Description',
			Impact: 'Impact',
			MitigationPlan: 'MitigationPlan',
			RiskLevel: 'High',
			Status: 'Open',
			OwnerObjectID: 14,
			SubmitterObjectID: 15,
			Checkpoint: 12
		};
	
	function runTest(testFn){
		return testFn()
			.then(function(){ passing++; })
			.fail(function(reason){ 
				failing++; 
				console.log('test ' + (passing + failing) + ' failed with message:', reason);
			});
	}
	
	Ext.define('Test.RiskDb', {
		extend: 'Rally.app.App',
		
		launch: function(){
			var me = this;
			me.setLoading('loading configuration');
			RiskDb.initialize()
				.then(function(){ me.setLoading(false); })
				.then(function(){ return me.runTests(); })
				.then(function(){ return me.cleanup(); })
				.fail(function(reason){ alert(JSON.stringify(reason, null, '  ')); })
				.done();
		},
		
		runTests: function(){
			var testFns = [
				/************************ TEST GET **********************************/
				function(){ //should get nothing but not fail
					return RiskDb.get(TEST_TOKEN + 'not-exist').then(function(risk){
						if(risk) return Q.reject();
					});
				},
				function(){ //should fail if not string argument
					var deferred = Q.defer();
					RiskDb.get()
						.then(deferred.reject)
						.fail(function(reason){
							if(reason === 'invalid RiskID') deferred.resolve();
							else deferred.reject();
						})
						.done();
					return deferred.promise;
				},
				function(){ //should not allow invalid RiskID prefix
					var deferred = Q.defer();
					RiskDb.get('invalid-prefix')
						.then(deferred.reject)
						.fail(function(reason){
							if(reason === 'invalid RiskID') deferred.resolve();
							else deferred.reject();
						})
						.done();
					return deferred.promise;
				},
				
				/************************ TEST CREATE **********************************/
				function(){ //should create risk
					return RiskDb.create(TEST_TOKEN + 'create1', RISK_TMPL)
						.then(function(risk){ 
							if(risk.RiskID !== (TEST_TOKEN + 'create1')) return Q.reject();
						});
				},
				function(){ //should not allow invalid RiskID prefix
					var deferred = Q.defer();
					RiskDb.create('invalid-prefix', RISK_TMPL)
						.then(deferred.reject)
						.fail(function(reason){
							if(reason === 'invalid RiskID') deferred.resolve();
							else deferred.reject();
						})
						.done();
					return deferred.promise;
				},
				function(){ //should not create duplicate risk
					var deferred = Q.defer();
					RiskDb.create(TEST_TOKEN + 'create1', RISK_TMPL)
						.then(deferred.reject)
						.fail(function(reason){
							if(reason === 'key already exists') deferred.resolve();
							else deferred.reject();
						})
						.done();
					return deferred.promise;
				},
				function(){ //should validate fields
					var deferred = Q.defer();
					RiskDb.create(TEST_TOKEN + 'create4', _.merge({}, RISK_TMPL, {Description: null}))
						.then(deferred.reject)
						.fail(function(reason){
							if(reason[0] === 'Description is invalid') deferred.resolve();
							else deferred.reject();
						})
						.done();
					return deferred.promise;
				},
				function(){ //should validate fields
					var deferred = Q.defer();
					RiskDb.create(TEST_TOKEN + 'create5', _.merge({}, RISK_TMPL, {Description: 3}))
						.then(deferred.reject)
						.fail(function(reason){
							if(reason[0] === 'Description is invalid') deferred.resolve();
							else deferred.reject();
						})
						.done();
					return deferred.promise;
				},
				function(){ //should validate fields
					var deferred = Q.defer();
					RiskDb.create(TEST_TOKEN + 'create6', _.merge({}, RISK_TMPL, {Description: {x:3}}))
						.then(deferred.reject)
						.fail(function(reason){
							if(reason[0] === 'Description is invalid') deferred.resolve();
							else deferred.reject();
						})
						.done();
					return deferred.promise;
				},
				function(){ //should validate fields
					var deferred = Q.defer();
					RiskDb.create(TEST_TOKEN + 'create7', _.merge({}, RISK_TMPL, {Status: 'Magic Johnson'}))
						.then(deferred.reject)
						.fail(function(reason){
							if(reason[0] === 'Status is invalid') deferred.resolve();
							else deferred.reject();
						})
						.done();
					return deferred.promise;
				},
				function(){ //should validate fields
					var deferred = Q.defer();
					RiskDb.create(TEST_TOKEN + 'create8')
						.then(deferred.reject)
						.fail(function(reason){
							if(reason.length === 11) deferred.resolve(); //all but projectID
							else deferred.reject();
						})
						.done();
					return deferred.promise;
				},
				function(){ //should validate fields
					var deferred = Q.defer();
					RiskDb.create(TEST_TOKEN + 'create9', 'magic object!')
						.then(deferred.reject)
						.fail(function(reason){
							if(reason.length === 11) deferred.resolve(); //all but projectID
							else deferred.reject();
						})
						.done();
					return deferred.promise;
				},
				function(){ //should validate fields
					var deferred = Q.defer();
					var newRisk = _.merge({}, RISK_TMPL);
					delete newRisk.Description;
					
					RiskDb.create(TEST_TOKEN + 'create10', newRisk)
						.then(deferred.reject)
						.fail(function(reason){
							if(reason[0] === 'Description is invalid') deferred.resolve();
							else deferred.reject();
						})
						.done();
					return deferred.promise;
				},
				function(){ //should remove extra fields
					var newRisk = _.merge({}, RISK_TMPL);
					newRisk.Magic = 'magic';
					
					return RiskDb.create(TEST_TOKEN + 'create11', newRisk)
						.then(function(riskJSON){
							if(riskJSON.Magic === 'magic') return Q.reject();
						});
				},
				function(){ //should not include extra fields
					var newRisk = _.merge({}, RISK_TMPL, {id: 3, _id: 4});
					
					return RiskDb.create(TEST_TOKEN + 'create12', newRisk)
						.then(function(riskJSON){
							if(riskJSON.id || riskJSON._id) return Q.reject();
						});
				},
				function(){ //should not strip html stuff in text fields
					var badString = '<img src="http://badurl.badurl" onerror="alert(\'hi\')"/>',
						newRisk = _.merge({}, RISK_TMPL, {Description: badString});
					
					return RiskDb.create(TEST_TOKEN + 'create13', newRisk)
						.then(function(riskJSON){
							if(riskJSON.Description !== badString) return Q.reject();
						});
				},
				
				/************************ TEST UPDATE **********************************/
				function(){ //should update risk
					return RiskDb.update(TEST_TOKEN + 'create1', _.merge({}, RISK_TMPL, {Description: 'magic'}))
						.then(function(risk){ 
							if(risk.Description !== 'magic') return Q.reject();
						});
				},
				function(){ //should not update non-existent risk
					var deferred = Q.defer();
					RiskDb.update(TEST_TOKEN + 'update2', _.merge({}, RISK_TMPL, {Description: 'magic'}))
						.then(deferred.reject)
						.fail(function(reason){
							if(reason === 'key does not exist') deferred.resolve();
							else deferred.reject();
						})
						.done();
					return deferred.promise;
				},
				function(){ //should allow no ProjectObjectID
					var newRisk = _.merge({}, RISK_TMPL);
					delete newRisk.ProjectObjectID;
					
					return RiskDb.update(TEST_TOKEN + 'create1', newRisk)
						.then(function(risk){ 
							if(typeof risk.ProjectObjectID !== 'undefined') return Q.reject();
						});
				},
				function(){ //should not allow invalid RiskID prefix
					var deferred = Q.defer();
					RiskDb.update('invalid-prefix', RISK_TMPL)
						.then(deferred.reject)
						.fail(function(reason){
							if(reason === 'invalid RiskID') deferred.resolve();
							else deferred.reject();
						})
						.done();
					return deferred.promise;
				},
				
				/************************ TEST DELETE **********************************/
				function(){ //should delete risk
					return RiskDb['delete'](TEST_TOKEN + 'create1').then(function(){ 
						return RiskDb.get(TEST_TOKEN + 'create1').then(function(risk){
							if(risk) return Q.reject();
						});
					});
				},
				function(){ //should no-op delete a non-existent risk
					return RiskDb['delete'](TEST_TOKEN + 'not-exist');
				},
				function(){ //should not allow invalid RiskID prefix
					var deferred = Q.defer();
					RiskDb['delete']('invalid-prefix')
						.then(deferred.reject)
						.fail(function(reason){
							if(reason === 'invalid RiskID') deferred.resolve();
							else deferred.reject();
						})
						.done();
					return deferred.promise;
				},
				
				/************************ TEST QUERY **********************************/
				function(){ //should only get matching risks
					return Q.all(_.times(20, function(n){
						return RiskDb.create(TEST_TOKEN + 'query' + (n+1), RISK_TMPL);
					}))
					.then(function(){
						return RiskDb.query(TEST_TOKEN + 'query1').then(function(risks){
							if(risks.length !== 11) return Q.reject();
						});
					});
				},
				function(){ //should not allow invalid RiskID prefix
					var deferred = Q.defer();
					RiskDb.query('invalid-prefix')
						.then(deferred.reject)
						.fail(function(reason){
							if(reason === 'invalid RiskID') deferred.resolve();
							else deferred.reject();
						})
						.done();
					return deferred.promise;
				}
			];
			
				/************************ RUN TESTS **********************************/
			return testFns
				.reduce(function(promise, testFn){ return promise.then(function(){ return runTest(testFn); }); }, Q())
				.then(function(){ console.log(passing + ' tests passed, ' + failing + ' tests failed'); });
		},
		
		cleanup: function(){
			return RiskDb.query(TEST_TOKEN).then(function(risks){
				return Q.all(risks.map(function(risk){
					return RiskDb['delete'](risk.RiskID);
				}));
			});
		}
	});
}());