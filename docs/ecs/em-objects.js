import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM } from "./ecs.js";
import { V } from "../matrix/sprig-matrix.js";
import { CubeMesh } from "../meshes/mesh-list.js";
import { PositionDef, ScaleDef, RotationDef, PhysicsParentDef, } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { T } from "../utils/util-no-import.js";
import { isArray } from "../utils/util.js";
// TODO(@darzu): PERF. since w/ objects we're constructing entities w/ batch components
//    we should batch update the query cache as well, which might have a perf boost
/*
OBJECTS
goals:
  hierarchy of entities w/ nice bi pointer syntax
  declarative components instead of imperative code

an object has:
  [x] a set of components
  [x] and any number of nested objects
  [ ] optionally those are physics parented
  [x] optionally custom component (w/ properties or just tag)
  [ ] optional constructor w/ build resources
  [ ] optionally entity-pool'ed
    [ ] "just" add onSpawn/onDespawn ?
  [ ] optionally works w/ multiplayer and netEntityHelper etc.
    note: defineNetEntityHelper has local vs props component distinction

  e.g.
    ship
      { cuttingEnable: true }
      mast
        sail
      rudder
      cannonL
      cannonR
*/
// TODO(@darzu): MULTIPLAYER: this uses non-updatable component
// TODO(@darzu): POOLS: this doesn't work with entity pools
//    To work with pools we just need onSpawn, onDespawn
// TODO(@darzu): NAMESPACES? each object and in-line child defines a new component so
//    the component namespaces could become quite cluttered?
// TODO(@darzu): SYSTEMS: how do objects interact w/ systems? Can you match against
//  an object instead of (or in addition to?) a set of components?
// TODO(@darzu): NON-OBJ interop: children needs to accept entities instead of objects and built objects instead of obj def
// TODO(@darzu): self-props is optional? just creates an EntityW<> in that case?
// TODO(@darzu): ARRAY OF CHILDREN?
//    instead of children needing names and a custom component, just use indexes which can
//    be strongly typed
// TODO(@darzu): OBJ.CHILD.XYZ: Maybe instead of all of this, which is mostly to facilitate the parent->children relationship
//    we just have some .child convenient way of tracking parent child relationships
// TODO(@darzu): PHYSICS PARENT: parameters for enabling/disabling physics parenting
/*
Object is:
  set of components
  + (optional) named tag component
  + (optional) named tag component w/ props
  + (optional) .child relation(s)
*/
// TODO(@darzu): .CHILD isn't child?
//    maybe bidirectional
//    .other, .relation, .child
//    could be optional
//    Also, could be we just add relations via setParentChild(entA, entB) then
//    that automatically adds a entA.child ? Hmm hard to do that correctly w/ types
// TODO(@darzu): merge ObjDef and ObjChildDef so that the more permissive one is top-level
/*
Entities vs objects
  entities have components
  objects have components and relations
  objects are entities
  object definitions can have inline component definitions (props)
  OR
  entities have components
  objects have a list of (component | relation)

(can all be seperate:)
how things are defined
  series of attributes (component, props/tag, child relations, physics properties, net-entity stuff)
  can attributes depend on one another? sure
how things are created
  constructor system, immediate construct, components for network, dynamic/full sync stuff,
how things are stored
  ECS, +? anything else permitted?
how things are queried
  ECS queries, +?

We'd love to incorperate delayed construction somehow so we can have things like:
  RenderableConstructDef,
  collider using MeshDef not needing AABB right away
  Authority not needing MeDef
  massively reduce use of async on creation

Merging objects?
  Like constructNetTurret, mixin onto entity
*/
// TODO(@darzu): ABSTRACTION. Rethink how we do this.
// TODO(@darzu): LANG. Having this component be generic so all children could be well typed would be very useful.
export const ChildrenDef = EM.defineComponent("children", () => {
    return [];
});
function isCompDefs(d) {
    return Array.isArray(d);
}
function isObjDef(d) {
    return "opts" in d;
}
function isObjChildEnt(ca) {
    return "id" in ca;
}
// TODO(@darzu): optionally just takes a list of components?
export function defineObj(opts) {
    // define children
    const childDefs = {};
    if (opts.children) {
        for (let cName of Object.keys(opts.children)) {
            const defOrOptsOrCS = opts.children[cName];
            if (isCompDefs(defOrOptsOrCS)) {
                childDefs[cName] = defOrOptsOrCS;
            }
            else if (isObjDef(defOrOptsOrCS)) {
                childDefs[cName] = defOrOptsOrCS;
            }
            else {
                childDefs[cName] = defineObj(defOrOptsOrCS);
            }
        }
    }
    function createObjProps(args, childEnts) {
        const p = args.props ?? {};
        // TODO(@darzu): we could probably strengthen these types to remove all casts
        const res = {
            ...childEnts,
            ...p,
        };
        return res;
    }
    // TODO(@darzu): Use updatable componets instead; see notes in entity-manager.ts
    const props = EM.defineNonupdatableComponent(opts.name, createObjProps, { multiArg: true });
    const _def = {
        opts,
        props,
        children: childDefs,
    };
    const def = {
        ..._def,
        new: (a) => createObj(_def, a),
        mixin: (e, a) => mixinObj(e, _def, a),
    };
    return def;
}
function createChildrenObjs(def, args) {
    // create children objects
    const childEnts = {};
    if (args.children) {
        for (let cName of Object.keys(args.children)) {
            const cArgs = args.children[cName];
            if (isObjChildEnt(cArgs)) {
                // already an entity
                childEnts[cName] = cArgs;
            }
            else {
                // create the entity
                const cDef = def.children[cName];
                const cEnt = createObj(cDef, cArgs);
                childEnts[cName] = cEnt;
            }
        }
    }
    return childEnts;
}
function _setComp(e, c, args) {
    if (c.multiArg)
        EM.set(e, c, ...args);
    else
        EM.set(e, c, args);
}
export function createObj(def, args) {
    if (isObjChildEnt(args)) {
        return args;
    }
    else {
        const e = EM.mk();
        mixinObj(e, def, args);
        return e;
    }
}
// TODO(@darzu): move onto EM.set ? EM.set takes an array of component defs or ObjDef
export function mixinObj(e, def, args) {
    // TODO(@darzu): i hate all these casts
    if (isObjChildEnt(args)) {
        throw `Cannot mixin two entities: ${e.id} and ${args.id}`;
    }
    else if (isCompDefs(def)) {
        if (isArray(args)) {
            const cArgsArr = args; // TODO(@darzu): We shouldn't need such hacky casts
            def.forEach((c, i) => {
                const cArgs = cArgsArr[i];
                _setComp(e, c, cArgs);
            });
            // return e as ObjChildEnt<D>;
        }
        else {
            const cArgsObj = args;
            def.forEach((c, i) => {
                const cArgs = cArgsObj[c.name];
                _setComp(e, c, cArgs);
            });
        }
        return;
    }
    else if (isObjDef(def)) {
        _mixinObj(e, def, args);
        // return e as ObjChildEnt<D>
        return;
    }
    throw "never";
}
function _createObj(def, args) {
    const e = EM.mk();
    _mixinObj(e, def, args);
    return e;
}
function _mixinObj(e, def, args) {
    // TODO(@darzu): there's probably some extreme type-foo that could do this impl w/o cast
    // add components
    if (Array.isArray(args.args)) {
        const cArgs = args.args;
        def.opts.components.forEach((cDef, i) => {
            _setComp(e, cDef, cArgs[i]);
        });
    }
    else {
        const cArgs = args.args;
        for (let cDef of def.opts.components) {
            _setComp(e, cDef, cArgs[cDef.name]);
        }
    }
    // create children
    const children = createChildrenObjs(def, args);
    // add children list
    EM.set(e, ChildrenDef);
    for (let cName of Object.keys(children)) {
        const cEnt = children[cName];
        e.children.push(cEnt);
    }
    // add props w/ named & typed children
    EM.set(e, def.props, args, children);
    // physics parent children
    const physicsParentChildren = def.opts.physicsParentChildren ?? false;
    if (physicsParentChildren && args.children) {
        for (let cName of Object.keys(args.children)) {
            const cEnt = children[cName];
            EM.set(cEnt, PhysicsParentDef, e.id);
        }
    }
}
// merge object definitions so it's easier to type
function mixinObjDef() {
    throw "TODO impl";
}
// TODO(@darzu): IMPL despawn w/ children
function despawnObj() {
    // either despawn in pool,
    //  or dead the entity
    throw "TODO impl";
}
export function testObjectTS() {
    const CannonObj = defineObj({
        name: "cannon",
        components: [PositionDef],
    });
    const ShipObj = defineObj({
        name: "ship2",
        propsType: T(),
        // updateProps: (p, n: number) => {
        //   p.myProp = n;
        //   return p;
        // },
        // dataType: (p: { myProp: number }) => {},
        components: [PositionDef, RenderableConstructDef],
        physicsParentChildren: true,
        children: {
            mast: {
                name: "mast2",
                components: [ScaleDef],
                children: {
                    sail: {
                        name: "sail2",
                        components: [RotationDef],
                    },
                },
            },
            cannonL: CannonObj,
            cannonR: CannonObj,
            gem: [ColorDef, PositionDef],
            rudder: [PositionDef, RotationDef],
        },
    });
    if (!"true") {
        // let __o4 = null as unknown as __t4;
        // const l23 = __o4.mast.scale;
    }
    const rudder = createObj([PositionDef, RotationDef], [
        [1, 1, 1],
        undefined,
    ]);
    const rudder2 = createObj([PositionDef, RotationDef], {
        position: [1, 1, 1],
        rotation: undefined,
    });
    console.log("testGrayHelpers".toUpperCase());
    console.dir(ShipObj);
    const ship = createObj(ShipObj, {
        props: {
            myProp: 7,
        },
        args: {
            position: V(0, 0, 0),
            renderableConstruct: [CubeMesh],
        },
        children: {
            mast: {
                args: {
                    scale: V(1, 1, 1),
                },
                children: {
                    sail: {
                        args: [undefined],
                    },
                },
            },
            cannonL: {
                args: {
                    position: V(1, 0, 0),
                },
            },
            cannonR: {
                args: [V(1, 0, 0)],
            },
            gem: [ENDESGA16.blue, V(1, 1, 1)],
            rudder: rudder,
        },
    });
    console.dir(ship);
    let foo = "klj";
    let bar = foo?.endsWith("j");
    ship.ship2.myProp = 8;
    ship.position;
    // const cl = ship.ship["cannonL"];
    const cl = ship.ship2.cannonL;
    const se = ship.ship2.mast.mast2.sail;
    const mp = se.rotation;
    const cannonLPos = ship.ship2.cannonL.position;
    const rudderPos = ship.ship2.rudder.position;
    ship.ship2.rudder.rotation;
    // TODO(@darzu): oo i like this one best
    // const cl3 = ship.child.cannonL;
    // const se3 = ship.child.mast.child.sail;
    // const mp3 = se.rotation;
    // const cl2 = ship.child[0];
    // const se2 = ship.child[1].child[0];
    // const mp2 = m.rotation;
    // const ShipDef = defineObject("ship", {
    //   position: [V(0,0,0)],
    //   scale: [V(1,1,1)],
    //   renderableConstruct: [CubeMesh, true],
    // }
}
//# sourceMappingURL=em-objects.js.map