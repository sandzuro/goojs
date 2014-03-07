define([
	'goo/entities/EntityUtils',
	'goo/entities/components/Component',
	'goo/math/Quaternion',
	'goo/addons/ammo/calculateTriangleMeshShape',
	'goo/shapes/Box',
	'goo/shapes/Quad',
	'goo/shapes/Sphere',
	'goo/renderer/Material',
	'goo/shapes/ShapeCreator',
	'goo/renderer/shaders/ShaderLib',
	'goo/renderer/bounds/BoundingBox',
	'goo/renderer/bounds/BoundingSphere'
],
/** @lends */
function(
	EntityUtils, Component, Quaternion, calculateTriangleMeshShape, Box, Quad, Sphere, Material, ShapeCreator, ShaderLib, BoundingBox, BoundingSphere
) {
	"use strict";

	var Ammo = window.Ammo; // make jslint happy

	/**
	 * @class Adds Ammo physics to a Goo entity.
	 * Ammo is a powerful physics engine converted from the C language project Bullet
	 * use Ammo.js if you need to support any 3D shape (trimesh).
	 * Also see {@link AmmoSystem}.
	 * @extends Component
	 * @param {Object} [settings] The settings object can contain the following properties:
	 * @param {number} [settings.mass=0] (0 means immovable)
	 * @param {boolean} [settings.useBounds=false] use the model bounds or use the real (must-be-convex) vertices
	 * @param {boolean} [settings.useWorldBounds=false] use the model world bounds or use the real (must-be-convex) vertices (this setting is experimental)
	 * @param {boolean} [settings.useWorldTransform=false] use the model world transform instead of local (this setting is experimental)
	 * @param {boolean} [settings.showBounds=false] show the model world bounding box (this setting is experimental)
	 * @example
	 * var entity = EntityUtils.createTypicalEntity(goo.world, ShapeCreator.createBox(20, 10, 1));
	 * entity.setComponent(new AmmoComponent({mass:5}));
	 */
	function AmmoComponent(settings) {
		this.type = 'AmmoComponent';
		this.settings = settings = settings || {};
		this.mass = settings.mass !== undefined ? settings.mass : 0;
		this.useBounds = settings.useBounds !== undefined ? settings.useBounds : false;
		this.useWorldBounds = settings.useWorldBounds !== undefined ? settings.useWorldBounds : false;
		this.useWorldTransform = settings.useWorldTransform !== undefined ? settings.useWorldTransform : false;
		this.ammoTransform = new Ammo.btTransform();
		this.gooQuaternion = new Quaternion();
		this.isTrigger = settings.isTrigger !== undefined ? settings.isTrigger : false;
		this.shape = undefined;
	}
	AmmoComponent.prototype = Object.create(Component.prototype);

	AmmoComponent.prototype.getAmmoShapefromGooShape = function(entity, gooTransform) {
		var shape;
		var scale = gooTransform.scale;

		if( entity.meshDataComponent && entity.meshDataComponent.meshData) {
			var meshData = entity.meshDataComponent.meshData;
			if (meshData instanceof Box) {
				shape = new Ammo.btBoxShape(new Ammo.btVector3( meshData.xExtent, meshData.yExtent, meshData.zExtent));
			} else if (meshData instanceof Sphere) {
				shape = new Ammo.btSphereShape(meshData.radius);
			} else if (meshData instanceof Quad) {
				// there doesn't seem to be a Quad shape in Ammo
				shape = new Ammo.btBoxShape(new Ammo.btVector3( meshData.xExtent, meshData.yExtent, 0.01 )); //new Ammo.btPlane();
			} else {
				if (this.useBounds || this.mass > 0) {
					entity.meshDataComponent.computeBoundFromPoints();
					var bound = entity.meshDataComponent.modelBound;
					if (bound instanceof BoundingBox) {
						shape = new Ammo.btBoxShape(new Ammo.btVector3( bound.xExtent*scale.x, bound.yExtent*scale.y, bound.zExtent*scale.z));
					} else if (bound instanceof BoundingSphere) {
						shape = new Ammo.btSphereShape( bound.radius*scale.x);
					}
				} else {
					shape = calculateTriangleMeshShape( entity, scale.data); // this can only be used for static meshes, i.e. mass == 0.
				}
			}
		} else {
			var shape = new Ammo.btCompoundShape();
			var c = entity.transformComponent.children;
			for(var i=0; i<c.length; i++) {
				var childAmmoShape = this.getAmmoShapefromGooShape( c[i].entity );
				var localTrans = new Ammo.btTransform();
				localTrans.setIdentity();
				var gooPos = c[i].transform.translation;
				localTrans.setOrigin(new Ammo.btVector3( gooPos.x, gooPos.y, gooPos.z));
				// TODO: also setRotation ?
				shape.addChildShape(localTrans,childAmmoShape);
			}
		}
		return shape;
	};

	AmmoComponent.prototype.getAmmoShapefromGooShapeWorldBounds = function(entity) {
		var shape;
		var bound = EntityUtils.getTotalBoundingBox( entity);
		this.center = bound.center;
		shape = new Ammo.btBoxShape(new Ammo.btVector3( bound.xExtent, bound.yExtent, bound.zExtent));
		//shape = new Ammo.btBoxShape(new Ammo.btVector3( bound.xExtent*scale, bound.yExtent*scale, bound.zExtent*scale));
		return shape;
	};

	AmmoComponent.prototype.initialize = function(entity) {
		var gooTransform = entity.transformComponent.transform;

		if( this.useWorldTransform ) {
			gooTransform = entity.transformComponent.worldTransform;
		}

		var gooPos = gooTransform.translation;

		var ammoTransform = new Ammo.btTransform();
		ammoTransform.setIdentity(); // TODO: is this needed ?
		ammoTransform.setOrigin(new Ammo.btVector3( gooPos.x, gooPos.y, gooPos.z));
		this.gooQuaternion.fromRotationMatrix(gooTransform.rotation);
		var q = this.gooQuaternion;
		ammoTransform.setRotation(new Ammo.btQuaternion(q.x, q.y, q.z, q.w));

		if(this.useWorldBounds) {
			entity._world.process();
			this.shape = this.getAmmoShapefromGooShapeWorldBounds(entity, gooTransform);
			this.difference = this.center.clone().sub( gooTransform.translation).invert();
		} else {
			this.shape = this.getAmmoShapefromGooShape(entity, gooTransform);
		}

		if(false == this.isTrigger){
			var motionState = new Ammo.btDefaultMotionState( ammoTransform );
			var localInertia = new Ammo.btVector3(0, 0, 0);

			// rigidbody is dynamic if and only if mass is non zero, otherwise static
			if(this.mass !== 0.0) {
				this.shape.calculateLocalInertia( this.mass, localInertia );
			}

			var info = new Ammo.btRigidBodyConstructionInfo(this.mass, motionState, this.shape, localInertia);
			this.body = new Ammo.btRigidBody( info );
		}
	};

	AmmoComponent.prototype.showBounds = function(entity) {
		// entity.meshRendererComponent.worldBound
		// entity.meshDataComponent.computeBoundFromPoints();
		var bound = EntityUtils.getTotalBoundingBox( entity );
		var bv;
		if (bound.xExtent) {
			bv = EntityUtils.createTypicalEntity(entity._world, ShapeCreator.createBox( bound.xExtent*2, bound.yExtent*2, bound.zExtent*2));
		} else if (bound.radius) {
			bv = EntityUtils.createTypicalEntity(entity._world, ShapeCreator.createSphere(12, 12, bound.radius));
		}
		var material = Material.createMaterial(ShaderLib.simpleLit);
		material.wireframe = true;
		bv.meshRendererComponent.materials.push(material);

		bv.transformComponent.setTranslation(bound.center);
		//entity.transformComponent.attachChild( bv.transformComponent );

		bv.addToWorld();
		this.bv = bv;
	};

	AmmoComponent.prototype.copyPhysicalTransformToVisual = function(entity) {
		var tc = entity.transformComponent;
		if ( ! this.body ) {
			return;
		}
		this.body.getMotionState().getWorldTransform(this.ammoTransform);
		var ammoQuat = this.ammoTransform.getRotation();
		this.gooQuaternion.setd(ammoQuat.x(), ammoQuat.y(), ammoQuat.z(), ammoQuat.w());
		tc.transform.rotation.copyQuaternion(this.gooQuaternion);
		var origin = this.ammoTransform.getOrigin();
		tc.setTranslation(origin.x(), origin.y(), origin.z());
		if( this.settings.showBounds) {
			if( !this.bv ) {
				this.showBounds( entity);
			}
			this.bv.transformComponent.transform.rotation.copy( tc.transform.rotation);
			this.bv.transformComponent.setTranslation( tc.transform.translation);
		}
		if( this.difference) {
			tc.addTranslation( this.difference);
		}
	};

	return AmmoComponent;
});
