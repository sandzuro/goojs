"use strict";

define([
	'goo/addons/terrainpack/TerrainHandler'
], function(
	TerrainHandler
	) {

	var ConfiguredArea = function(version, goo, resourcePath, areaData, TerrainTypes, readyCallback, terrainSettings, terrainEditSettings) {
		this.version = version;
		this.cullState = true;
		this.terrainHandler = new TerrainHandler(goo, 256, 4, resourcePath, terrainSettings);

		this.resourcePath = resourcePath;
		this.terrainEditSettings = terrainEditSettings;
		this.editorActive = false;

		this.setGroundConfig(areaData.ground);
		this.setPlantsConfig(areaData.plants);
		this.setForestConfig(areaData.forest);

		var terrainData = this.buildTerrainData(areaData, TerrainTypes);

	//	console.log("Terrain ConfData: ", terrainData);
		readyCallback(this, terrainData, terrainEditSettings)
	};

	ConfiguredArea.prototype.setTerrainQuery = function(query) {
		this.terrainQuery = query;
	};

	ConfiguredArea.prototype.getTerrainQuery = function() {
		return this.terrainQuery;
	};

	ConfiguredArea.prototype.setGroundConfig = function(groundConfig) {
		this.groundConfig = groundConfig;
	};

	ConfiguredArea.prototype.setForestConfig = function(forestConfig) {
		this.forestConfig = forestConfig;
	};

	ConfiguredArea.prototype.setPlantsConfig = function(plantsConfig) {
		this.plantsConfig = plantsConfig;
	};

	ConfiguredArea.prototype.buildTerrainData = function(terrainData, TerrainTypes) {

		terrainData.ground = this.groundConfig;
		terrainData.forest = this.forestConfig;
		terrainData.plants = this.plantsConfig;

		return terrainData;
	};

	ConfiguredArea.prototype.readShaderUniform = function(uniform) {
//		console.log("Read uniform: ", uniform);
		for (var i = 0; i < this.terrainHandler.terrain.terrainMaterials.length; i++) {
			console.log(this.terrainHandler.terrain.terrainMaterials[i]);
			return this.terrainHandler.terrain.terrainMaterials[i].shader.uniforms[uniform];
		}
	};



	ConfiguredArea.prototype.tuneShaderUniform = function(uniform, value) {
		for (var i = 0; i < this.terrainHandler.terrain.terrainMaterials.length; i++) {
			this.terrainHandler.terrain.terrainMaterials[i].shader.uniforms[uniform] = value;
		}
	};

	ConfiguredArea.prototype.setCullStateEnabled = function(value) {
		this.cullState = value;
		this.terrainHandler.terrain.setMaterialProperty('culling', value);
		for (var i = 0; i < this.terrainHandler.terrain.terrainMaterials.length; i++) {
			this.terrainHandler.terrain.terrainMaterials[i].cullState.enabled = value
		}
	};

	ConfiguredArea.prototype.setWireframeVisibility = function(value) {
		for (var i = 0; i < this.terrainHandler.terrain.terrainMaterials.length; i++) {
			this.terrainHandler.terrain.terrainMaterials[i].wireframe = value
		}
	};




	ConfiguredArea.prototype.getTerrainEditSettings = function() {
		return this.terrainEditSettings;
	};



	ConfiguredArea.prototype.getEditedTerrainData = function() {
		return this.terrainHandler.terrain.getTerrainData();
	};

	ConfiguredArea.prototype.fetchProjectData = function(callback) {
		this.terrainHandler.loadTerrainData(this.resourcePath).then(function (data) {
			callback(data);
		});
	};

	ConfiguredArea.prototype.handleLoadedData = function(loadedData) {

		if (loadedData.Meta) {
//			console.log("Loaded metadata:", loadedData.Meta);
			if (loadedData.Meta.version != this.version) {

				console.error("Version missmatch. Data v:", loadedData.Meta.version, "Client v:", this.version);
				alert("Version missmatch. Data v:"+ loadedData.Meta.version+ " Client v:"+ this.version+"            ----- Loading defaults.")
				return;
			}
		}

		if (loadedData.local) {
			this.terrainHandler.terrainBuffer = this.terrainHandler.terrainDataManager.decodeBase64(loadedData['height_map.raw']);
			this.terrainHandler.splatBuffer = this.terrainHandler.terrainDataManager.decodeBase64(loadedData['splat_map.raw']);
		} else {
			this.terrainHandler.terrainBuffer = loadedData['height_map.raw'];
			this.terrainHandler.splatBuffer = loadedData['splat_map.raw'];
		}

		if (loadedData.Materials) {
			for (var index in loadedData.Materials) {
				if (index == 'culling') {
//					console.log("Loaded cull state: ", loadedData.Materials[index])
					this.setCullStateEnabled(loadedData.Materials[index]);
				} else {
					this.terrainHandler.terrain.setShaderUniform(index, loadedData.Materials[index]);
				}
			}
		}
	};

	ConfiguredArea.prototype.applyConfiguredTerrain = function(terrainData, readyCallback, terrainEditSettings) {
//		console.log("Apply Conf Terrain", terrainData)
		var loadedData;
		var dataHandler = function(data) {
			this.handleLoadedData(data);
			loadedData = data;
		}.bind(this);

		this.terrainHandler.preload(terrainData, dataHandler).then(function() {

			//	console.log("FOREST LOD MAP:", this.forestLodMap);
//			console.log("LOADED TERRAIN ", this.terrainHandler.terrain);

			var queryCallback = function(terrainQuery) {
//				console.log("query Callback", terrainQuery)
				readyCallback(terrainQuery, loadedData);
			};

			this.terrainHandler.initLevel(terrainData, terrainEditSettings, queryCallback);

		}.bind(this));

	};

	var checked = false;
	var tries = 0;
	ConfiguredArea.prototype.updateTerrain = function(tpf, cameraEntity) {
		if (checked) {
			this.terrainHandler.update(cameraEntity);
		} else {
			try {
				this.terrainHandler.update(cameraEntity);
				checked = true;
				document.getElementById("sys_hint").innerHTML = "Terrain ready after "+tries+" tries";

			}
			catch (err) {
				//	console.log("Terrain not yet ready", err);
				document.getElementById("sys_hint").innerHTML = "Terrain not yet ready... try: "+tries;
				tries+=1;
			}
		}
	};



	ConfiguredArea.prototype.toggleEditing = function() {
		this.terrainHandler.toggleEditMode();
		this.terrainHandler.updatePhysics();

		this.editorActive = !this.editorActive;

		//	this.terrainHandler.useLightmap(); // disables
	};

	return ConfiguredArea;

});